import type { ImportFormat } from '@/types';
import { computeStats } from './validate';
import { parseQuickImport } from './quickImport';
import { parseCsv } from './csv';
import { parseFoundyJson } from './foundyJson';
import type { ParseOptions, ParseResult } from './types';

/**
 * Local, in-browser text extraction for every supported import format.
 * Nothing is uploaded: files are read with the File API and parsed with
 * libraries bundled into the app (Mammoth for DOCX, PDF.js for PDF).
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx', '.pdf', '.csv', '.json'];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

export function detectFormat(file: { name: string; type?: string }): ImportFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt')) return 'txt';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.json')) return 'json';
  switch (file.type) {
    case 'text/plain':
      return 'txt';
    case 'text/markdown':
      return 'md';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'application/pdf':
      return 'pdf';
    case 'text/csv':
      return 'csv';
    case 'application/json':
      return 'json';
    default:
      return null;
  }
}

function failure(source: string, format: ImportFormat, code: 'unsupported-format' | 'extraction-failed' | 'scanned-pdf' | 'file-too-large', message: string): ParseResult {
  return {
    cards: [],
    issues: [{ code, severity: 'error', message }],
    stats: computeStats([]),
    format,
    source,
  };
}

async function readAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

async function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const lib = (mammoth as unknown as { default?: typeof mammoth }).default ?? mammoth;
  const result = await lib.extractRawText({ arrayBuffer: buffer });
  // Mammoth ends every paragraph with "\n\n". Collapse that so one Word
  // paragraph = one line: reported line numbers then match the document,
  // and empty paragraphs between cards still become blank lines.
  return result.value.replace(/\r\n?/g, '\n').replace(/\n\n/g, '\n');
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
  const pageTexts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Rebuild lines from positioned text runs: a new line starts when the
    // run says so (hasEOL) or its baseline moves vertically.
    let line = '';
    const lines: string[] = [];
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Array.isArray(item.transform) ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line) {
        lines.push(line);
        line = '';
      }
      line += item.str;
      if (y !== null) lastY = y;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    pageTexts.push(lines.join('\n'));
    page.cleanup();
  }
  await doc.destroy();
  return { text: pageTexts.join('\n\n'), pages: doc.numPages };
}

/** Extract + parse a user file. Never throws: failures become issues. */
export async function importFile(file: File, options: ParseOptions = {}): Promise<ParseResult> {
  const source = file.name;
  const format = detectFormat(file);
  if (!format) {
    return failure(source, 'text', 'unsupported-format', `"${file.name}" is not a supported format. Use TXT, MD, DOCX, PDF, CSV or Foundy JSON.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    return failure(source, format, 'file-too-large', `"${file.name}" is larger than 25 MB. Split it into smaller files and import them separately.`);
  }
  if (file.size === 0) {
    return { ...parseQuickImport('', { ...options, source, format }) };
  }

  try {
    switch (format) {
      case 'txt':
      case 'md':
        return parseQuickImport(await readAsText(file), { ...options, source, format });
      case 'csv':
        return parseCsv(await readAsText(file), { ...options, source });
      case 'json':
        return parseFoundyJson(await readAsText(file), { ...options, source });
      case 'docx': {
        const text = await extractDocxText(await readAsArrayBuffer(file));
        return parseQuickImport(text, { ...options, source, format });
      }
      case 'pdf': {
        const { text, pages } = await extractPdfText(await readAsArrayBuffer(file));
        if (!text.replace(/\s/g, '').length) {
          return failure(
            source,
            'pdf',
            'scanned-pdf',
            `No selectable text was found in "${file.name}" (${pages} page${pages === 1 ? '' : 's'}). It is probably a scanned document or an image. Scanned PDFs need OCR (optical character recognition) first — run it through an OCR tool, then import the resulting text.`,
          );
        }
        return parseQuickImport(text, { ...options, source, format });
      }
      default:
        return failure(source, format, 'unsupported-format', 'Unsupported format.');
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const hint =
      format === 'docx'
        ? ' Make sure it is a .docx Word document (older .doc files are not supported).'
        : format === 'pdf'
          ? ' The PDF may be damaged or password-protected.'
          : '';
    return failure(source, format, 'extraction-failed', `Could not read "${file.name}": ${reason}.${hint}`);
  }
}
