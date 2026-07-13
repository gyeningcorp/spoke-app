// Export helpers: PDF file (Filesystem), Share sheet, and clipboard copy.

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { StructuredResult, TemplateId, Transcript } from './types';
import { pdfToBase64, downloadPdf } from './pdf';

function sanitize(name: string): string {
  return (name || 'note').replace(/[^\w\d-_ ]+/g, '').trim().slice(0, 60) || 'note';
}

/** Render the structured result as plain text for clipboard / share body. */
export function resultToText(result: StructuredResult): string {
  const lines: string[] = [];
  lines.push(result.title || 'Voice Note');
  const meta = [result.date, result.duration].filter(Boolean).join('  •  ');
  if (meta) lines.push(meta);
  lines.push('');

  if ((!result.sections || result.sections.length === 0) && result.raw) {
    lines.push(result.raw);
  }
  for (const s of result.sections || []) {
    lines.push(s.heading.toUpperCase());
    for (const b of s.bullets) lines.push(`  • ${b}`);
    lines.push('');
  }
  if (result.action_items?.length) {
    lines.push('ACTION ITEMS');
    for (const a of result.action_items) {
      lines.push(`  ☐ ${a.task}${a.owner ? ` — ${a.owner}` : ''}`);
    }
  }
  return lines.join('\n').trim();
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for older webviews.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

interface ExportPdfArgs {
  result: StructuredResult;
  templateId: TemplateId;
  title: string;
  includeTranscript?: boolean;
  transcript?: Transcript;
}

/** Save the PDF locally and open the native share sheet (native), or download (web). */
export async function exportPdf(args: ExportPdfArgs): Promise<void> {
  const { result, templateId, title, includeTranscript, transcript } = args;
  const filename = `${sanitize(title)}.pdf`;

  if (!Capacitor.isNativePlatform()) {
    downloadPdf(result, templateId, filename, { includeTranscript, transcript });
    return;
  }

  const base64 = await pdfToBase64(result, templateId, { includeTranscript, transcript });
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({
    title,
    text: title,
    url: written.uri,
    dialogTitle: 'Share PDF',
  });
}

/** Share the rendered result as text via the native share sheet. */
export async function shareText(title: string, text: string): Promise<void> {
  const canShare = await Share.canShare().catch(() => ({ value: false }));
  if (canShare.value) {
    await Share.share({ title, text, dialogTitle: 'Share note' });
  } else if ((navigator as any).share) {
    await (navigator as any).share({ title, text });
  } else {
    await copyToClipboard(text);
  }
}

// keep Encoding import referenced for tree-shakers / future text exports
export const _ENCODING = Encoding.UTF8;
