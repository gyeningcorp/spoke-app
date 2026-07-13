// Shared type definitions for the whole app.

export type TemplateId =
  | 'general'
  | 'interview'
  | 'meeting'
  | 'journal'
  | 'standup'
  | 'idea';

export type ActionKind = 'outline' | 'summary';

export interface TranscriptSegment {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
}

// Structured result returned by Claude (claude-haiku-4-5-20251001).
export interface StructuredSection {
  heading: string;
  bullets: string[];
}

export interface ActionItem {
  task: string;
  owner: string | null;
}

export interface StructuredResult {
  title: string;
  date: string;
  duration: string;
  sections: StructuredSection[];
  action_items: ActionItem[];
  // When JSON parsing fails we fall back to raw text.
  raw?: string;
}

export interface Recording {
  id: string;
  title: string;
  createdAt: number; // epoch ms
  durationSec: number;
  mimeType: string;
  // Blob is stored separately in IndexedDB (audioStore) keyed by id.
  transcript?: Transcript;
  // Cached results per (template + action) key, e.g. "meeting:outline".
  results: Record<string, StructuredResult>;
}

export interface QuotaState {
  minutesRemaining: number;
  tier: 'free' | 'pro';
}

export interface AuthState {
  deviceId: string;
  email: string | null;
  jwt: string | null;
  tier: 'free' | 'pro';
}
