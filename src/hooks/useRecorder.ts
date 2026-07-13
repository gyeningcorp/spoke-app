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
}

// Manages a recording session, live timer, and interruption safety.
// On backgrounding / phone call, the current buffer is preserved and recording
// is finalized so nothing is lost.
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
      const handle = await startRecorder((chunk) => {
        chunksRef.current.push(chunk);
      });
      handleRef.current = handle;
      startTsRef.current = Date.now();
      setState((s) => ({ ...s, isRecording: true, elapsedSec: 0, error: null, analyser: handle.analyser }));

      timerRef.current = window.setInterval(() => {
        setState((s) => ({ ...s, elapsedSec: (Date.now() - startTsRef.current) / 1000 }));
      }, 100);
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
    await stopRecorder(handle);
    const blob = new Blob(chunksRef.current, { type: handle.mimeType });
    handleRef.current = null;
    setState((s) => ({ ...s, isRecording: false, analyser: null, elapsedSec: durationSec }));
    return { blob, mimeType: handle.mimeType, durationSec };
  }, []);

  // Keep a ref so lifecycle listeners can finalize without stale closures.
  finalizeRef.current = stop;

  // Interruption handling: if the app is backgrounded (call, home button),
  // finalize immediately so the recording is safely captured.
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
