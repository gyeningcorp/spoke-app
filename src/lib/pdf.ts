// PDF export using pdfmake. Template-specific accent color + icon, section
// headings/bullets, action-item checklist, page-number footer, optional
// full-transcript appendix.

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces';
import type { StructuredResult, Transcript } from './types';
import { getTemplate } from '../templates/templates';
import type { TemplateId } from './types';

// Wire up the default Roboto virtual font store.
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs ?? (pdfFonts as any).vfs;

export interface PdfOptions {
  includeTranscript?: boolean;
  transcript?: Transcript;
}

export function buildPdfDoc(
  result: StructuredResult,
  templateId: TemplateId,
  opts: PdfOptions = {},
): TDocumentDefinitions {
  const tpl = getTemplate(templateId);
  const accent = tpl.color;

  const body: Content[] = [];

  // Header block
  body.push({
    columns: [
      { text: tpl.icon, fontSize: 28, width: 40 },
      [
        { text: result.title || tpl.label, style: 'title', color: accent },
        {
          text: `${result.date || ''}${result.duration ? '  •  ' + result.duration : ''}  •  ${tpl.label}`,
          style: 'meta',
        },
      ],
    ],
  });
  body.push({
    canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 2, lineColor: accent }],
    margin: [0, 6, 0, 12],
  });

  // Raw-text fallback (Claude JSON parse failed on server)
  if ((!result.sections || result.sections.length === 0) && result.raw) {
    body.push({ text: result.raw, style: 'bullet', margin: [0, 4, 0, 4] });
  }

  // Sections
  for (const section of result.sections || []) {
    body.push({ text: section.heading, style: 'heading', color: accent, margin: [0, 10, 0, 4] });
    body.push({
      ul: section.bullets.map((b) => ({ text: b, style: 'bullet' })),
      margin: [0, 0, 0, 4],
    });
  }

  // Action items as a checklist
  if (result.action_items && result.action_items.length) {
    body.push({ text: 'Action Items', style: 'heading', color: accent, margin: [0, 14, 0, 6] });
    for (const item of result.action_items) {
      body.push({
        columns: [
          { text: '☐', width: 16, fontSize: 12 },
          {
            text: [
              { text: item.task },
              item.owner ? { text: `  — ${item.owner}`, italics: true, color: '#666' } : { text: '' },
            ],
            style: 'bullet',
          },
        ],
        margin: [0, 2, 0, 2],
      });
    }
  }

  // Optional transcript appendix
  if (opts.includeTranscript && opts.transcript?.text) {
    body.push({ text: 'Transcript', style: 'heading', color: accent, pageBreak: 'before', margin: [0, 0, 0, 6] });
    body.push({ text: opts.transcript.text, style: 'transcript' });
  }

  return {
    content: body,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'VoiceNotes', style: 'footer', margin: [40, 0, 0, 0] },
        { text: `${currentPage} / ${pageCount}`, alignment: 'right', style: 'footer', margin: [0, 0, 40, 0] },
      ],
    }),
    styles: {
      title: { fontSize: 20, bold: true },
      meta: { fontSize: 10, color: '#888', margin: [0, 2, 0, 0] },
      heading: { fontSize: 14, bold: true },
      bullet: { fontSize: 11, lineHeight: 1.3 },
      transcript: { fontSize: 9, color: '#444', lineHeight: 1.4 },
      footer: { fontSize: 8, color: '#999' },
    },
    defaultStyle: { font: 'Roboto' },
    pageMargins: [40, 40, 40, 50],
  };
}

/** Trigger a browser download of the generated PDF. */
export function downloadPdf(
  result: StructuredResult,
  templateId: TemplateId,
  filename: string,
  opts: PdfOptions = {},
): void {
  const doc = buildPdfDoc(result, templateId, opts);
  pdfMake.createPdf(doc).download(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

/** Get the PDF as a base64 string (for Capacitor Filesystem + Share). */
export function pdfToBase64(
  result: StructuredResult,
  templateId: TemplateId,
  opts: PdfOptions = {},
): Promise<string> {
  const doc = buildPdfDoc(result, templateId, opts);
  return new Promise((resolve) => {
    pdfMake.createPdf(doc).getBase64((data: string) => resolve(data));
  });
}
