// Direct-call mode: Claude only. Transcription is handled by the browser's
// Web Speech API at record time (no API key needed for transcription).
// Generation uses Claude (claude-haiku-4-5-20251001) baked in at build time.

import type { ActionKind, StructuredResult, TemplateId } from './types';
import { TEMPLATES } from '../templates/templates';

const CLAUDE_KEY = import.meta.env.VITE_CLAUDE_KEY as string | undefined;

export function hasDirectKeys(): boolean {
  return !!CLAUDE_KEY;
}

export async function generateDirect(
  transcriptText: string,
  template: TemplateId,
  action: ActionKind,
  meta: { date: string; duration: string },
): Promise<StructuredResult> {
  if (!CLAUDE_KEY) throw new Error('Claude key not configured');

  const tpl = TEMPLATES.find(t => t.id === template);
  const templateName = tpl?.label || template;

  const prompt = action === 'outline'
    ? `Turn this transcript into a hierarchical outline following the ${templateName} structure. Capture topics, key points, and decisions. Return ONLY valid JSON, no markdown fences, no preamble.`
    : `Write a concise 3–5 sentence summary of this transcript, then 3–5 key takeaways. Follow the ${templateName} structure. Return ONLY valid JSON, no markdown fences, no preamble.`;

  const schema = `{"title":string,"date":string,"duration":string,"sections":[{"heading":string,"bullets":[string]}],"action_items":[{"task":string,"owner":string|null}]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `${prompt}\n\nJSON schema:\n${schema}\n\nDate: ${meta.date}\nDuration: ${meta.duration}\n\nTranscript:\n${transcriptText}`,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Generation failed (${res.status}): ${(err as { error?: { message?: string } }).error?.message || ''}`);
  }

  const data = await res.json() as { content?: { text?: string }[] };
  let raw = data.content?.[0]?.text || '';
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
