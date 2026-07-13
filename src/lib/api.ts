import type { ActionKind, StructuredResult, TemplateId, Transcript } from './types';
import { loadAuth } from './auth';
import { hasDirectKeys, generateDirect } from './directApi';

const PROXY_URL = (import.meta.env.VITE_PROXY_URL as string | undefined)?.replace(/\/$/, '') || '';
const USE_DIRECT = !PROXY_URL;

async function authHeaders(): Promise<Record<string, string>> {
  const auth = await loadAuth();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': auth.deviceId,
  };
  if (auth.jwt) headers['Authorization'] = `Bearer ${auth.jwt}`;
  return headers;
}

export interface TranscribeResponse {
  transcript: Transcript;
  minutesRemaining: number;
}

export class QuotaError extends Error {
  minutesRemaining = 0;
  constructor() {
    super('Out of minutes');
    this.name = 'QuotaError';
  }
}

export class NoKeysError extends Error {
  constructor() {
    super('API keys not configured');
    this.name = 'NoKeysError';
  }
}

// In direct mode, transcription is handled by the Web Speech API at record time
// and saved to the recording. This is only called if transcript is missing.
export async function transcribe(_blob: Blob, _durationSec: number): Promise<TranscribeResponse> {
  if (USE_DIRECT) {
    // Transcript should already be on the recording from record time.
    // If it's missing (e.g. speech recognition wasn't supported), return empty.
    return {
      transcript: { text: '', segments: [] },
      minutesRemaining: 9999,
    };
  }

  const audioBase64 = await blobToBase64(_blob);
  const res = await fetch(`${PROXY_URL}/transcribe`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      audioBase64,
      mimeType: _blob.type || 'audio/webm',
      durationSec: _durationSec,
    }),
  });
  if (res.status === 402) throw new QuotaError();
  if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
  return res.json();
}

export async function generate(
  transcript: Transcript,
  template: TemplateId,
  action: ActionKind,
  meta: { date: string; duration: string },
): Promise<StructuredResult> {
  if (USE_DIRECT) {
    if (!hasDirectKeys()) throw new NoKeysError();
    return generateDirect(transcript.text, template, action, meta);
  }

  const res = await fetch(`${PROXY_URL}/generate`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ transcript: transcript.text, template, action, meta }),
  });
  if (!res.ok) throw new Error(`Generation failed (${res.status})`);
  return res.json();
}

export interface SubscriptionStatus {
  tier: 'free' | 'pro';
  minutesRemaining: number;
}

export async function validateSubscription(): Promise<SubscriptionStatus> {
  if (USE_DIRECT) return { tier: 'pro', minutesRemaining: 9999 };

  const res = await fetch(`${PROXY_URL}/validate-subscription`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Validation failed (${res.status})`);
  return res.json();
}

export async function createCheckout(email: string): Promise<{ url: string }> {
  const res = await fetch(`${PROXY_URL}/checkout`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`Checkout failed (${res.status})`);
  return res.json();
}

export async function signup(
  email: string,
  password: string,
  googleId?: string,
): Promise<{ jwt: string; tier: 'free' | 'pro' }> {
  const res = await fetch(`${PROXY_URL}/auth/signup`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ email, password, googleId }),
  });
  if (!res.ok) throw new Error(`Signup failed (${res.status})`);
  return res.json();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
