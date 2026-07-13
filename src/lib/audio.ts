// Audio capture built on MediaRecorder + Web Audio AnalyserNode.
// On iOS/Android WKWebView, getUserMedia + MediaRecorder are available in
// Capacitor 6 (WKWebView 14.3+ / modern Android WebView). Where MediaRecorder
// is unavailable we degrade to a raw stream + manual chunking is not needed,
// but we pick the best supported mimeType.

export interface RecorderHandle {
  stream: MediaStream;
  recorder: MediaRecorder;
  analyser: AnalyserNode;
  audioCtx: AudioContext;
  mimeType: string;
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4', // Safari/iOS
    'audio/aac',
    'audio/ogg;codecs=opus',
  ];
  if (typeof MediaRecorder === 'undefined') return 'audio/mp4';
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export async function startRecorder(
  onChunk: (chunk: Blob) => void,
): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx: AudioContext = new AudioCtx();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) onChunk(e.data);
  };

  // Emit a chunk every second so a crash/interruption never loses more than ~1s.
  recorder.start(1000);

  return { stream, recorder, analyser, audioCtx, mimeType: mimeType || 'audio/mp4' };
}

export async function stopRecorder(handle: RecorderHandle): Promise<void> {
  return new Promise((resolve) => {
    const { recorder, stream, audioCtx } = handle;
    const finish = () => {
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close().catch(() => {});
      resolve();
    };
    if (recorder.state === 'inactive') {
      finish();
      return;
    }
    recorder.onstop = finish;
    recorder.stop();
  });
}
