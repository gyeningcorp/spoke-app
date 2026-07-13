// Thin client for the Cloudflare Worker proxy. All API keys live server-side.

import type { ActionKind, StructuredResult, TemplateId, Transcript } from './types';
import { loadAuth } from './auth';

const PROXY_URL = (import.meta.env.VITE_PROXY_URL as string | undefined)?.replace(/\/$/, '') || '';

async function authHeaders(): Promise<Record<string, string>> {
  const auth = await loadAuth();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': auth.deviceId,
  };
  if (auth.jwt) headers['Authorization'] = `Bearer ${auth.jwt}`;
  return headers;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || ''); // strip data: prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

/** POST /transcribe — sends native audio, returns transcript + updated quota. */
export async function transcribe(blob: Blob, durationSec: number): Promise<TranscribeResponse> {
  const audioBase64 = await blobToBase64(blob);
  const res = await fetch(`${PROXY_URL}/transcribe`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      audioBase64,
      mimeType: blob.type || 'audio/webm',
      durationSec,
    }),
  });
  if (res.status === 402) throw new QuotaError();
  if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
  return res.json();
}

/** POST /generate — transcript + template + action -> structured JSON from Claude. */
export async function generate(
  transcript: Transcript,
  template: TemplateId,
  action: ActionKind,
  meta: { date: string; duration: string },
): Promise<StructuredResult> {
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

/** POST /validate-subscription — refresh tier + quota from server. */
export async function validateSubscription(): Promise<SubscriptionStatus> {
  const res = await fetch(`${PROXY_URL}/validate-subscription`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Validation failed (${res.status})`);
  return res.json();
}

/** Returns a Stripe Checkout URL to open in the web view. */
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
