import { useEffect, useRef } from 'react';

interface WaveformProps {
  analyser: AnalyserNode | null;
  active: boolean;
  color?: string;
}

// Live recording waveform driven by an AnalyserNode time-domain buffer.
// Big, satisfying bars that react to voice amplitude.
export function Waveform({ analyser, active, color = '#ff3b30' }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const bufferLen = analyser ? analyser.fftSize : 1024;
    const data = new Uint8Array(bufferLen);
    const bars = 48;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!analyser || !active) {
        // Flat idle line.
        ctx.fillStyle = color;
        const bw = (w / bars) * 0.5;
        for (let i = 0; i < bars; i++) {
          const x = (i / bars) * w + bw / 2;
          ctx.globalAlpha = 0.25;
          ctx.fillRect(x, h / 2 - 1 * dpr, bw, 2 * dpr);
        }
        ctx.globalAlpha = 1;
        return;
      }

      analyser.getByteTimeDomainData(data);
      const step = Math.floor(bufferLen / bars);
      const bw = (w / bars) * 0.6;
      const gap = (w / bars) * 0.4;

      for (let i = 0; i < bars; i++) {
        // RMS amplitude for this slice.
        let sum = 0;
        for (let j = 0; j < step; j++) {
          const v = (data[i * step + j] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / step);
        const barH = Math.max(3 * dpr, Math.min(h, rms * h * 3.2));
        const x = i * (bw + gap) + gap / 2;
        const y = (h - barH) / 2;
        ctx.fillStyle = color;
        const r = bw / 2;
        // Rounded bar.
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, bw, barH, r);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, bw, barH);
        }
      }
    };
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [analyser, active, color]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
