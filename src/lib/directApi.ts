// Direct-call mode: Gemini + Claude called straight from the browser.
// Keys are stored in localStorage — never sent anywhere except the respective API.
// Swap this out for the Worker proxy before production.

import type { ActionKind, StructuredResult, TemplateId, Transcript } from './types';
import { TEMPLATES } from '../templates/templates';

const GEMINI_KEY_STORAGE = 'spoke_gemini_key';
const CLAUDE_KEY_STORAGE = 'spoke_claude_key';

export function getGeminiKey(): string { return localStorage.getItem(GEMINI_KEY_STORAGE) || ''; }
export function getClaudeKey(): string { return localStorage.getItem(CLAUDE_KEY_STORAGE) || ''; }
export function setGeminiKey(k: string) { localStorage.setItem(GEMINI_KEY_STORAGE, k); }
export function setClaudeKey(k: string) { localStorage.setItem(CLAUDE_KEY_STORAGE, k); }
export function hasDirectKeys(): boolean { return !!(getGeminiKey() && getClaudeKey()); }
export function clearDirectKeys() {
  localStorage.removeItem(GEMINI_KEY_STORAGE);
  localStorage.removeItem(CLAUDE_KEY_STORAGE);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function transcribeDirect(blob: Blob): Promise<Transcript> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini API key set');

  const audioBase64 = await blobToBase64(blob);
  const mimeType = blob.type || 'audio/webm';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Transcribe this audio exactly as spoken. Return only the transcript text, no commentary.' },
            { inline_data: { mime_type: mimeType, data: audioBase64 } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Transcription failed (${res.status}): ${(err as { error?: { message?: string } }).error?.message || ''}`);
  }

  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  return { text, segments: [] };
}

export async function generateDirect(
  transcript: Transcript,
  template: TemplateId,
  action: ActionKind,
  meta: { date: string; duration: string },
): Promise<StructuredResult> {
  const key = getClaudeKey();
  if (!key) throw new Error('No Claude API key set');

  const tpl = TEMPLATES.find(t => t.id === template);
  const templateName = tpl?.label || template;

  const prompt = action === 'outline'
    ? `Turn this transcript into a hierarchical outline following the ${templateName} structure. Capture topics, key points, and decisions. Return the JSON schema only.`
    : `Write a concise 3–5 sentence summary of this transcript, then 3–5 key takeaways. Follow the ${templateName} structure. Return the JSON schema only.`;

  const schema = `{
  "title": string,
  "date": string,
  "duration": string,
  "sections": [{"heading": string, "bullets": [string]}],
  "action_items": [{"task": string, "owner": string | null}]
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `${prompt}\n\nJSON schema to return:\n${schema}\n\nDate: ${meta.date}\nDuration: ${meta.duration}\n\nTranscript:\n${transcript.text}`,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Generation failed (${res.status}): ${(err as { error?: { message?: string } }).error?.message || ''}`);
  }

  const data = await res.json() as { content?: { text?: string }[] };
  let raw = data.content?.[0]?.text || '';
  // Strip markdown fences if present
  raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    return JSON.parse(raw) as StructuredResult;
  } catch {
    return {
      title: 'Recording',
      date: meta.date,
      duration: meta.duration,
      sections: [{ heading: 'Notes', bullets: [raw] }],
      action_items: [],
    };
  }
}
