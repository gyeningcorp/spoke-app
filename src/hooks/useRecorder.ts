import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { startRecorder, stopRecorder, type RecorderHandle } from '../lib/audio';

export interface RecorderState {
  isRecording: boolean;
  elapsedSec: number;
  error: string | null;
  analyser: AnalyserNode | null;
}

export interface StopResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  transcript: string; // captured via Web Speech API
}

type SpeechRecognitionAny = any;

function makeSpeechRecognition(): SpeechRecognitionAny | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const sr = new SR();
  sr.continuous = true;
  sr.interimResults = true;
  sr.lang = 'en-US';
  return sr;
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    elapsedSec: 0,
    error: null,
    analyser: null,
  });

  const handleRef = useRef<RecorderHandle | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTsRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const finalizeRef = useRef<(() => Promise<StopResult | null>) | null>(null);
  const srRef = useRef<SpeechRecognitionAny | null>(null);
  const transcriptRef = useRef<string>('');

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = useCallback(async () => {
    if (handleRef.current) return;
    try {
      chunksRef.current = [];
      transcriptRef.current = '';

      const handle = await startRecorder((chunk) => {
        chunksRef.current.push(chunk);
      });
      handleRef.current = handle;
      startTsRef.current = Date.now();
      setState((s) => ({ ...s, isRecording: true, elapsedSec: 0, error: null, analyser: handle.analyser }));

      timerRef.current = window.setInterval(() => {
        setState((s) => ({ ...s, elapsedSec: (Date.now() - startTsRef.current) / 1000 }));
      }, 100);

      // Start Web Speech recognition in parallel
      const sr = makeSpeechRecognition();
      if (sr) {
        const finals: string[] = [];
        sr.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const r = event.results[i];
            if (r.isFinal) finals.push(r[0].transcript);
            else interim = r[0].transcript;
          }
          transcriptRef.current = [...finals, interim].join(' ').trim();
        };
        sr.onerror = () => {}; // silently ignore — audio blob is still saved
        sr.onend = () => {
          // Restart if still recording (browsers stop after silence)
          if (handleRef.current) {
            try { sr.start(); } catch {}
          }
        };
        try { sr.start(); } catch {}
        srRef.current = sr;
      }
    } catch (err: any) {
      setState((s) => ({
        ...s,
        isRecording: false,
        error: err?.name === 'NotAllowedError' ? 'Microphone permission denied' : String(err?.message || err),
      }));
    }
  }, []);

  const stop = useCallback(async (): Promise<StopResult | null> => {
    const handle = handleRef.current;
    if (!handle) return null;
    clearTimer();
    const durationSec = (Date.now() - startTsRef.current) / 1000;

    // Stop speech recognition
    if (srRef.current) {
      try { srRef.current.stop(); } catch {}
      srRef.current = null;
    }

    await stopRecorder(handle);
    const blob = new Blob(chunksRef.current, { type: handle.mimeType });
    const transcript = transcriptRef.current;
    handleRef.current = null;
    setState((s) => ({ ...s, isRecording: false, analyser: null, elapsedSec: durationSec }));
    return { blob, mimeType: handle.mimeType, durationSec, transcript };
  }, []);

  finalizeRef.current = stop;

  useEffect(() => {
    let listener: any;
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && handleRef.current && finalizeRef.current) {
        finalizeRef.current().catch(() => {});
      }
    }).then((l) => (listener = l));

    const onHide = () => {
      if (document.visibilityState === 'hidden' && handleRef.current && finalizeRef.current) {
        finalizeRef.current().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      listener?.remove?.();
      document.removeEventListener('visibilitychange', onHide);
      clearTimer();
    };
  }, []);

  return { state, start, stop };
}
