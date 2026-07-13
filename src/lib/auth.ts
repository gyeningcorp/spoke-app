// Device identity + auth state persisted in localStorage.
// Free tier needs no login — a stable device id is enough for quota tracking.

import { Device } from '@capacitor/device';
import type { AuthState } from './types';

const DEVICE_KEY = 'vn_device_id';
const EMAIL_KEY = 'vn_email';
const JWT_KEY = 'vn_jwt';
const TIER_KEY = 'vn_tier';

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Stable device id: prefers Capacitor Device.getId(), falls back to a random uuid. */
export async function getDeviceId(): Promise<string> {
  let id = localStorage.getItem(DEVICE_KEY);
  if (id) return id;
  try {
    const info = await Device.getId();
    id = info.identifier || randomId();
  } catch {
    id = randomId();
  }
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export async function loadAuth(): Promise<AuthState> {
  const deviceId = await getDeviceId();
  return {
    deviceId,
    email: localStorage.getItem(EMAIL_KEY),
    jwt: localStorage.getItem(JWT_KEY),
    tier: (localStorage.getItem(TIER_KEY) as 'free' | 'pro') || 'free',
  };
}

export function saveAuth(partial: Partial<AuthState>): void {
  if (partial.email !== undefined) {
    partial.email ? localStorage.setItem(EMAIL_KEY, partial.email) : localStorage.removeItem(EMAIL_KEY);
  }
  if (partial.jwt !== undefined) {
    partial.jwt ? localStorage.setItem(JWT_KEY, partial.jwt) : localStorage.removeItem(JWT_KEY);
  }
  if (partial.tier !== undefined) {
    localStorage.setItem(TIER_KEY, partial.tier);
  }
}
