import { parseTags, uid } from '@/lib/utils';
import type { ImportFormat } from '@/types';
import { computeStats, revalidate } from './validate';
import {
  MAX_CARDS_PER_IMPORT,
  type DocumentIssue,
  type ParseOptions,
  type ParseResult,
  type ParsedCard,
} from './types';

/**
 * Foundy QuickImport — deterministic, fault-tolerant text parser.
 *
 * The document is read line by line through a small state machine:
 *
 *   QUESTION  → closes the current block and opens a new one
 *   ANSWER    → fills the open block; if that block has no question, or
 *               already has an answer, the answer starts a NEW orphan block
 *               (so it can never attach to an earlier, incomplete question)
 *   HINT / EXPLANATION / TAGS / ALIASES → metadata for the open block
 *   other     → continuation of the last field (multiline support)
 *
 * Every block is validated independently and errors never stop the parse.
 * Text that is not inside any block is reported, never silently dropped.
 * See docs/IMPORT_PARSER.md for the full specification.
 */

type Field = 'question' | 'answer' | 'hint' | 'explanation' | 'tags' | 'aliases';

const LONG_MARKERS: Record<string, Field> = {
  question: 'question',
  answer: 'answer',
  hint: 'hint',
  explanation: 'explanation',
  explain: 'explanation',
  tags: 'tags',
  tag: 'tags',
  aliases: 'aliases',
  alias: 'aliases',
};
const SHORT_MARKERS: Record<string, Field> = { q: 'question', a: 'answer' };

// Optional list/heading/quote prefix, optional emphasis, the marker word,
// optional number ("Question 3"), optional emphasis, then ":" (ASCII or
// full-width) with any surrounding spaces.
const MARKER_RE =
  /^\s*(?:(?:\d{1,4}[.)]|[-*•>]|#{1,6})\s+)?(?:\*\*|__|\*|_)?\s*([A-Za-z]+)(?:\s*#?\d{1,4})?\s*(?:\*\*|__|\*|_)?\s*[:：]\s*(?:\*\*|__|\*|_)?\s?(.*)$/;

interface MarkerMatch {
  field: Field;
  rest: string;
}

export function matchMarker(line: string, allowShort: boolean): MarkerMatch | null {
  const m = MARKER_RE.exec(line);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const field = LONG_MARKERS[word] ?? (allowShort ? SHORT_MARKERS[word] : undefined);
  if (!field) return null;
  // Strip a closing emphasis marker directly after the colon ("**Q:** text").
  const rest = m[2].replace(/^(?:\*\*|__)\s?/, '');
  return { field, rest };
}

/** Normalise line endings, strip BOM and zero-width characters at line starts. */
export function normaliseText(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u2028|\u2029/g, '\n')
    .replace(/^[\u200B\u200C\u200D\u2060]+/gm, '')
    .replace(/\u00A0/g, ' ');
}

/** Trim blank lines at both ends and collapse runs of blank lines to one. */
export function tidyMultiline(lines: string[]): string {
  const out: string[] = [];
  let blank = false;
  for (const l of lines) {
    const line = l.replace(/\s+$/, '');
    if (!line.trim()) {
      if (out.length && !blank) out.push('');
      blank = true;
    } else {
      out.push(line);
      blank = false;
    }
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n').trim() === '' ? '' : dedentFirst(out).join('\n');
}

function dedentFirst(lines: string[]): string[] {
  if (!lines.length) return lines;
  const copy = lines.slice();
  copy[0] = copy[0].replace(/^\s+/, '');
  return copy;
}

interface Block {
  fields: Partial<Record<Field, string[]>>;
  order: Field[];
  startLine: number;
  endLine: number;
  rawLines: string[];
  active: Field | null;
  orphanMetadata: boolean;
  warnings: string[];
}

function newBlock(line: number): Block {
  return { fields: {}, order: [], startLine: line, endLine: line, rawLines: [], active: null, orphanMetadata: false, warnings: [] };
}

function lineLabel(start: number, end: number): string {
  return start === end ? `Line ${start}` : `Lines ${start}–${end}`;
}

export function shouldUseShortMarkers(lines: string[]): boolean {
  // Short "A:" markers are only honoured when the document also uses "Q:",
  // so a line like "A: option one" inside a long-form answer stays content.
  return lines.some((l) => {
    const m = matchMarker(l, true);
    return m !== null && /^\s*(?:(?:\d{1,4}[.)]|[-*•>]|#{1,6})\s+)?(?:\*\*|__|\*|_)?\s*q(?:\s*#?\d{1,4})?\s*(?:\*\*|__|\*|_)?\s*[:：]/i.test(l);
  });
}

export function parseQuickImport(
  input: string,
  options: ParseOptions & { source?: string; format?: ImportFormat } = {},
): ParseResult {
  const source = options.source ?? 'Pasted text';
  const format = options.format ?? 'text';
  const issues: DocumentIssue[] = [];
  const text = normaliseText(input ?? '');

  if (!text.trim()) {
    issues.push({ code: 'empty-document', severity: 'error', message: 'The document is empty — there is nothing to import.' });
    return { cards: [], issues, stats: computeStats([]), format, source };
  }

  const lines = text.split('\n');
  const allowShort =
    options.shortMarkers === true ? true : options.shortMarkers === false ? false : shouldUseShortMarkers(lines);
  const maxCards = options.maxCards ?? MAX_CARDS_PER_IMPORT;

  const blocks: Block[] = [];
  let current: Block | null = null;
  // Text outside any block, grouped into contiguous segments.
  let stray: { start: number; end: number; lines: string[] } | null = null;
  let truncated = false;

  const flushStray = () => {
    if (stray && stray.lines.some((l) => l.trim())) {
      const content = tidyMultiline(stray.lines);
      issues.push({
        code: 'unrecognised-content',
        severity: 'warning',
        message: 'Text outside any QUESTION/ANSWER block was not imported.',
        location: lineLabel(stray.start, stray.end),
        content,
      });
    }
    stray = null;
  };

  const closeBlock = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    const marker = matchMarker(line, allowShort);

    if (marker) {
      flushStray();
      const { field, rest } = marker;

      if (field === 'question') {
        closeBlock();
        if (blocks.length >= maxCards) {
          truncated = true;
          break;
        }
        current = newBlock(lineNo);
      } else if (field === 'answer') {
        const needsNewBlock: boolean = !current || !current.fields.question || current.fields.answer !== undefined;
        if (needsNewBlock) {
          closeBlock();
          if (blocks.length >= maxCards) {
            truncated = true;
            break;
          }
          current = newBlock(lineNo);
        }
      } else if (!current) {
        // Metadata with nothing to attach to: keep it as an invalid block so
        // the user sees it (and can fix it) instead of losing it.
        current = newBlock(lineNo);
        current.orphanMetadata = true;
      }

      const block = current!;
      if (block.fields[field] !== undefined) {
        block.warnings.push(`Repeated ${field.toUpperCase()} on line ${lineNo} was merged into the first one.`);
        block.fields[field]!.push(rest);
      } else {
        block.fields[field] = [rest];
        block.order.push(field);
      }
      block.active = field;
      block.endLine = lineNo;
      block.rawLines.push(line);
      continue;
    }

    if (current) {
      // Continuation line (or blank line) of the active field.
      if (current.active) current.fields[current.active]!.push(line);
      current.rawLines.push(line);
      if (line.trim()) current.endLine = lineNo;
    } else {
      if (!stray) stray = { start: lineNo, end: lineNo, lines: [] };
      stray.lines.push(line);
      if (line.trim()) stray.end = lineNo;
    }
  }
  closeBlock();
  flushStray();

  if (truncated) {
    issues.push({
      code: 'truncated',
      severity: 'warning',
      message: `Only the first ${maxCards.toLocaleString()} cards were processed. Split very large documents into several imports.`,
    });
  }

  const cards: ParsedCard[] = blocks.map((b, idx) => blockToCard(b, idx + 1));

  if (!cards.length) {
    issues.push({
      code: 'no-cards-found',
      severity: 'error',
      message: 'No QUESTION/ANSWER markers were found. Use the format "QUESTION: …" followed by "ANSWER: …".',
    });
  }

  const validated = revalidate(cards, options.existingKeys);
  return { cards: validated, issues, stats: computeStats(validated), format, source };
}

function blockToCard(b: Block, index: number): ParsedCard {
  const get = (f: Field) => (b.fields[f] ? tidyMultiline(b.fields[f]!) : '');
  const errors: ParsedCard['errors'] = [];
  if (b.orphanMetadata) {
    errors.push({
      code: 'orphan-metadata',
      message: `${b.order.map((f) => f.toUpperCase()).join(', ')} found without a QUESTION.`,
    });
  }
  return {
    id: uid(),
    index,
    question: get('question'),
    answer: get('answer'),
    hint: get('hint'),
    explanation: get('explanation'),
    tags: b.fields.tags ? parseTags(b.fields.tags.join(',')) : [],
    aliases: b.fields.aliases
      ? b.fields.aliases
          .join('|')
          .split(/[|;]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    location: lineLabel(b.startLine, b.endLine),
    startLine: b.startLine,
    endLine: b.endLine,
    raw: tidyMultiline(b.rawLines),
    errors,
    warnings: b.warnings,
    status: 'valid',
    duplicateOf: null,
    hasQuestionField: b.fields.question !== undefined,
    hasAnswerField: b.fields.answer !== undefined,
  };
}

/** Serialise cards back into QuickImport text (used for TXT export). */
export function toQuickImportText(
  cards: Array<{ question: string; answer: string; hint?: string; explanation?: string; tags?: string[] }>,
): string {
  return cards
    .map((c) => {
      const parts = [`QUESTION: ${c.question}`, `ANSWER: ${c.answer}`];
      if (c.hint) parts.push(`HINT: ${c.hint}`);
      if (c.explanation) parts.push(`EXPLANATION: ${c.explanation}`);
      if (c.tags?.length) parts.push(`TAGS: ${c.tags.join(', ')}`);
      return parts.join('\n');
    })
    .join('\n\n')
    .concat('\n');
}
