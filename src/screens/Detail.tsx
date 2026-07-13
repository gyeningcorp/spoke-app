import { useEffect, useState } from 'react';
import { PlaybackWaveform } from '../components/PlaybackWaveform';
import { TemplateChips } from '../components/TemplateChips';
import { ResultView } from '../components/ResultView';
import { Paywall } from '../components/Paywall';
import { getAudio, getRecording, saveRecording } from '../lib/storage';
import { generate, transcribe, QuotaError } from '../lib/api';
import { exportPdf, resultToText, shareText, copyToClipboard } from '../lib/export';
import { getTemplate } from '../templates/templates';
import { autoTitle, formatDate, formatDuration, resultKey } from '../lib/util';
import type { ActionKind, Recording, StructuredResult, TemplateId } from '../lib/types';

interface DetailProps {
  id: string;
  onBack: () => void;
  onQuotaChange: (minutes: number) => void;
}

export function Detail({ id, onBack, onQuotaChange }: DetailProps) {
  const [rec, setRec] = useState<Recording | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [template, setTemplate] = useState<TemplateId>('general');
  const [busy, setBusy] = useState<ActionKind | null>(null);
  const [result, setResult] = useState<StructuredResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tpl = getTemplate(template);

  useEffect(() => {
    (async () => {
      const r = await getRecording(id);
      const b = await getAudio(id);
      setRec(r ?? null);
      setBlob(b ?? null);
    })();
  }, [id]);

  // When template changes, show any cached result for the current (template, action).
  useEffect(() => {
    if (!rec) return;
    const cached =
      rec.results[resultKey(template, 'outline')] || rec.results[resultKey(template, 'summary')];
    setResult(cached ?? null);
  }, [rec, template]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  // Transcribe once, cache on the recording. Returns transcript text.
  const ensureTranscript = async (current: Recording): Promise<Recording> => {
    if (current.transcript) return current;
    const audio = blob || (await getAudio(id));
    if (!audio) throw new Error('Audio missing');
    const { transcript, minutesRemaining } = await transcribe(audio, current.durationSec);
    onQuotaChange(minutesRemaining);
    const updated: Recording = {
      ...current,
      transcript,
      title:
        current.title === 'New recording' || !current.title
          ? autoTitle(transcript.text, current.title)
          : current.title,
    };
    await saveRecording(updated);
    setRec(updated);
    return updated;
  };

  const run = async (action: ActionKind) => {
    if (!rec) return;
    setError(null);

    // Paywall: block generation when out of minutes (unless already cached).
    const key = resultKey(template, action);
    if (rec.results[key]) {
      setResult(rec.results[key]);
      return;
    }

    setBusy(action);
    try {
      const withTranscript = await ensureTranscript(rec);
      const meta = {
        date: formatDate(withTranscript.createdAt),
        duration: formatDuration(withTranscript.durationSec),
      };
      const generated = await generate(withTranscript.transcript!, template, action, meta);
      const updated: Recording = {
        ...withTranscript,
        results: { ...withTranscript.results, [key]: generated },
      };
      await saveRecording(updated);
      setRec(updated);
      setResult(generated);
    } catch (e: any) {
      if (e instanceof QuotaError) {
        onQuotaChange(0);
        setPaywall(true);
      } else {
        setError(e?.message || 'Something went wrong');
      }
    } finally {
      setBusy(null);
    }
  };

  const doCopy = async () => {
    if (!result) return;
    await copyToClipboard(resultToText(result));
    flash('Copied');
  };

  const doShare = async () => {
    if (!result) return;
    await shareText(rec?.title || 'Voice Note', resultToText(result));
  };

  const doPdf = async () => {
    if (!result || !rec) return;
    await exportPdf({
      result,
      templateId: template,
      title: rec.title,
      includeTranscript,
      transcript: rec.transcript,
    });
    flash('PDF ready');
  };

  return (
    <div className="app">
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 8px 0' }}>
        <button onClick={onBack} aria-label="Back" style={{ fontSize: 20, padding: '0 12px' }}>
          ‹ Back
        </button>
        <div style={{ flex: 1 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 4px' }}>{rec?.title ?? 'Recording'}</h1>
        {rec && (
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
            {formatDate(rec.createdAt)} • {formatDuration(rec.durationSec)}
          </div>
        )}

        {/* Playback waveform — always visible at top */}
        <div style={{ marginBottom: 16 }}>
          <PlaybackWaveform blob={blob} color={tpl.color} />
        </div>

        {/* Template chips */}
        <TemplateChips selected={template} onSelect={setTemplate} />

        {/* Two primary actions, stacked, full width, 60px tall */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <button
            onClick={() => run('outline')}
            disabled={busy !== null}
            style={primaryBtn(tpl.color, false)}
          >
            {busy === 'outline' ? <span className="spinner" /> : 'Outline'}
          </button>
          <button
            onClick={() => run('summary')}
            disabled={busy !== null}
            style={primaryBtn(tpl.color, true)}
          >
            {busy === 'summary' ? <span className="spinner" /> : 'Summarize'}
          </button>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginTop: 12, fontSize: 14 }}>{error}</div>}

        {/* Rendered result */}
        {result && <ResultView result={result} accent={tpl.color} />}

        {/* Export row */}
        {result && (
          <>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 20,
                fontSize: 14,
                color: 'var(--text-dim)',
              }}
            >
              <input
                type="checkbox"
                checked={includeTranscript}
                onChange={(e) => setIncludeTranscript(e.target.checked)}
              />
              Include full transcript in PDF
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={doPdf} style={exportBtn(tpl.color)}>
                PDF
              </button>
              <button onClick={doCopy} style={exportBtn(tpl.color)}>
                Copy
              </button>
              <button onClick={doShare} style={exportBtn(tpl.color)}>
                Share
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div
          className="fade-in"
          style={{
            position: 'fixed',
            bottom: 'calc(24px + var(--safe-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--text)',
            color: 'var(--bg)',
            padding: '10px 18px',
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {toast}
        </div>
      )}

      <Paywall open={paywall} onClose={() => setPaywall(false)} />
    </div>
  );
}

function primaryBtn(color: string, outline: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: 60,
    borderRadius: 16,
    fontSize: 18,
    fontWeight: 700,
    background: outline ? 'transparent' : color,
    color: outline ? color : '#fff',
    border: `2px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

function exportBtn(color: string): React.CSSProperties {
  return {
    flex: 1,
    height: 48,
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 600,
    background: 'var(--bg-elev)',
    color: 'var(--text)',
    border: `1px solid ${color}`,
  };
}
