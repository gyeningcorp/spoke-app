// Small formatting + id helpers.

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'rec-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Auto-title from the first few words of a transcript. */
export function autoTitle(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  const words = text.trim().split(/\s+/).slice(0, 6).join(' ');
  if (!words) return fallback;
  return words.length > 48 ? words.slice(0, 48) + '…' : words;
}

export function resultKey(template: string, action: string): string {
  return `${template}:${action}`;
}
