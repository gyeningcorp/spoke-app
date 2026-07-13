import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration } from '../lib/util';

interface PlaybackWaveformProps {
  blob: Blob | null;
  color?: string;
}

// Static waveform of a recorded blob with a play head + tap/drag scrubbing.
export function PlaybackWaveform({ blob, color = '#5a97ff' }: PlaybackWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : ''), [blob]);

  // Build the <audio> element.
  useEffect(() => {
    if (!url) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    const onTime = () => setCurrent(audio.currentTime);
    const onMeta = () => setDuration(isFinite(audio.duration) ? audio.duration : 0);
    const onEnd = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
      URL.revokeObjectURL(url);
    };
  }, [url]);

  // Decode peaks for the static waveform.
  useEffect(() => {
    let cancelled = false;
    if (!blob) return;
    (async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const buf = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        const channel = decoded.getChannelData(0);
        const barCount = 64;
        const block = Math.floor(channel.length / barCount) || 1;
        const out: number[] = [];
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < block; j++) {
            const v = channel[i * block + j] || 0;
            sum += v * v;
          }
          out.push(Math.sqrt(sum / block));
        }
        const max = Math.max(...out, 0.0001);
        if (!cancelled) setPeaks(out.map((v) => v / max));
        ctx.close().catch(() => {});
      } catch {
        // Some webviews can't decode webm/opus; show a flat placeholder.
        if (!cancelled) setPeaks(new Array(64).fill(0.25));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  // Draw the waveform + play head.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const n = peaks.length || 64;
    const bw = (w / n) * 0.6;
    const gap = (w / n) * 0.4;
    const progress = duration ? current / duration : 0;
    for (let i = 0; i < n; i++) {
      const p = peaks[i] ?? 0.2;
      const barH = Math.max(3 * dpr, p * h * 0.9);
      const x = i * (bw + gap) + gap / 2;
      const y = (h - barH) / 2;
      const played = i / n <= progress;
      ctx.globalAlpha = played ? 1 : 0.35;
      ctx.fillStyle = color;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, bw, barH, bw / 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, bw, barH);
      }
    }
    ctx.globalAlpha = 1;
  }, [peaks, current, duration, color]);

  const seekFromEvent = (clientX: number) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            background: color,
            color: '#fff',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            seekFromEvent(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) seekFromEvent(e.clientX);
          }}
          style={{ flex: 1, height: 60, display: 'block', touchAction: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
        <span>{formatDuration(current)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  );
}
