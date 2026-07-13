import { useEffect, useState } from 'react';
import { RecordButton } from '../components/RecordButton';
import { Waveform } from '../components/Waveform';
import { useRecorder } from '../hooks/useRecorder';
import { listRecordings, saveAudio, saveRecording } from '../lib/storage';
import { formatDate, formatDuration, newId } from '../lib/util';
import type { Recording } from '../lib/types';

interface HomeProps {
  minutesRemaining: number;
  onOpen: (id: string) => void;
  onInfo: () => void;
}

export function Home({ minutesRemaining, onOpen, onInfo }: HomeProps) {
  const { state, start, stop } = useRecorder();
  const [recordings, setRecordings] = useState<Recording[]>([]);

  const refresh = async () => setRecordings(await listRecordings());
  useEffect(() => {
    refresh();
  }, []);

  const toggle = async () => {
    if (state.isRecording) {
      const result = await stop();
      if (!result) return;
      // Save immediately — never lose a recording.
      const id = newId();
      await saveAudio(id, result.blob);
      const transcript = result.transcript
        ? { text: result.transcript, segments: [] }
        : undefined;
      const rec: Recording = {
        id,
        title: 'New recording',
        createdAt: Date.now(),
        durationSec: result.durationSec,
        mimeType: result.mimeType,
        transcript,
        results: {},
      };
      await saveRecording(rec);
      await refresh();
      onOpen(id); // open DETAIL; auto-title happens after transcription
    } else {
      await start();
    }
  };

  return (
    <div className="app">
      {/* Recording stage */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 24,
          position: 'relative',
        }}
      >
        {state.isRecording && (
          <div className="fade-in" style={{ width: '80%', height: 90, marginBottom: 8 }}>
            <Waveform analyser={state.analyser} active={state.isRecording} />
          </div>
        )}
        <div
          style={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: state.isRecording ? 44 : 0,
            fontWeight: 700,
            height: state.isRecording ? 52 : 0,
            transition: 'font-size 0.2s ease',
            color: 'var(--text)',
          }}
        >
          {state.isRecording && formatDuration(state.elapsedSec)}
        </div>
        <RecordButton recording={state.isRecording} onClick={toggle} />
        {state.error && (
          <div style={{ color: 'var(--danger)', marginTop: 12, fontSize: 14 }}>{state.error}</div>
        )}
      </div>

      {/* Past recordings list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 90px' }}>
        <h2 style={{ fontSize: 15, color: 'var(--text-dim)', margin: '8px 4px 10px', fontWeight: 600 }}>
          Recordings
        </h2>
        {recordings.length === 0 && (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 24 }}>
            Tap the button to record your first note.
          </p>
        )}
        {recordings.map((r) => (
          <button
            key={r.id}
            onClick={() => onOpen(r.id)}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 14px',
              marginBottom: 8,
              borderRadius: 14,
              background: 'var(--bg-elev)',
              textAlign: 'left',
            }}
          >
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>
                {formatDate(r.createdAt)} • {formatDuration(r.durationSec)}
              </div>
            </div>
            <span style={{ color: 'var(--text-dim)', fontSize: 20 }}>›</span>
          </button>
        ))}
      </div>

      {/* Quiet minutes-remaining indicator, bottom-left */}
      <div
        style={{
          position: 'fixed',
          left: 14,
          bottom: 'calc(14px + var(--safe-bottom))',
          fontSize: 11,
          color: 'var(--text-dim)',
          opacity: 0.7,
        }}
      >
        {Math.max(0, Math.round(minutesRemaining))} min left
      </div>

      {/* Floating info/settings button, bottom-right */}
      <button
        onClick={onInfo}
        aria-label="Info and settings"
        style={{
          position: 'fixed',
          right: 18,
          bottom: 'calc(18px + var(--safe-bottom))',
          width: 56,
          height: 56,
          borderRadius: 28,
          background: 'var(--accent)',
          color: 'var(--accent-text)',
          fontSize: 28,
          fontWeight: 700,
          boxShadow: '0 6px 20px var(--shadow)',
        }}
      >
        +
      </button>
    </div>
  );
}
