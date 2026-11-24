import Papa from 'papaparse';
import { parseTags, uid } from '@/lib/utils';
import { computeStats, revalidate } from './validate';
import { MAX_CARDS_PER_IMPORT, type DocumentIssue, type ParseOptions, type ParseResult, type ParsedCard } from './types';

const HEADER_ALIASES: Record<string, 'question' | 'answer' | 'hint' | 'explanation' | 'tags' | 'aliases'> = {
  question: 'question',
  q: 'question',
  front: 'question',
  term: 'question',
  prompt: 'question',
  answer: 'answer',
  a: 'answer',
  back: 'answer',
  definition: 'answer',
  response: 'answer',
  hint: 'hint',
  explanation: 'explanation',
  explain: 'explanation',
  notes: 'explanation',
  tags: 'tags',
  tag: 'tags',
  aliases: 'aliases',
  alias: 'aliases',
};

type Column = (typeof HEADER_ALIASES)[string];

/**
 * CSV import. A header row is detected when it contains a recognised
 * question/answer column name; otherwise columns are read positionally as
 * question, answer, hint, explanation, tags.
 */
export function parseCsv(input: string, options: ParseOptions & { source?: string } = {}): ParseResult {
  const source = options.source ?? 'CSV';
  const issues: DocumentIssue[] = [];
  const text = input.replace(/^\uFEFF/, '');
  if (!text.trim()) {
    issues.push({ code: 'empty-document', severity: 'error', message: 'The CSV file is empty.' });
    return { cards: [], issues, stats: computeStats([]), format: 'csv', source };
  }

  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  for (const err of parsed.errors.slice(0, 20)) {
    issues.push({
      code: 'unrecognised-content',
      severity: 'warning',
      message: `CSV problem: ${err.message}`,
      location: typeof err.row === 'number' ? `Row ${err.row + 1}` : undefined,
    });
  }

  const rows = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim()));
  if (!rows.length) {
    issues.push({ code: 'empty-document', severity: 'error', message: 'The CSV file has no rows.' });
    return { cards: [], issues, stats: computeStats([]), format: 'csv', source };
  }

  let mapping: Column[] = ['question', 'answer', 'hint', 'explanation', 'tags'];
  let startRow = 0;
  const header = rows[0].map((c) => String(c ?? '').trim().toLowerCase());
  const headerMapped = header.map((h) => HEADER_ALIASES[h]);
  if (headerMapped.includes('question') || headerMapped.includes('answer')) {
    mapping = headerMapped as Column[];
    startRow = 1;
  }

  const limit = options.maxCards ?? MAX_CARDS_PER_IMPORT;
  const dataRows = rows.slice(startRow, startRow + limit);
  if (rows.length - startRow > limit) {
    issues.push({ code: 'truncated', severity: 'warning', message: `Only the first ${limit.toLocaleString()} rows were processed.` });
  }

  const cards: ParsedCard[] = dataRows.map((row, i) => {
    const rowNo = i + startRow + 1;
    const get = (col: Column) => {
      const idx = mapping.indexOf(col);
      return idx >= 0 && idx < row.length ? String(row[idx] ?? '').replace(/\r\n?/g, '\n').trim() : '';
    };
    const hasQ = mapping.includes('question') && mapping.indexOf('question') < row.length;
    const hasA = mapping.includes('answer') && mapping.indexOf('answer') < row.length;
    return {
      id: uid(),
      index: i + 1,
      question: get('question'),
      answer: get('answer'),
      hint: get('hint'),
      explanation: get('explanation'),
      tags: parseTags(get('tags')),
      aliases: get('aliases')
        .split(/[|;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      location: `Row ${rowNo}`,
      startLine: rowNo,
      endLine: rowNo,
      raw: Papa.unparse([row]),
      errors: [],
      warnings: [],
      status: 'valid',
      duplicateOf: null,
      hasQuestionField: hasQ,
      hasAnswerField: hasA,
    };
  });

  const validated = revalidate(cards, options.existingKeys);
  return { cards: validated, issues, stats: computeStats(validated), format: 'csv', source };
}

export function toCsv(
  cards: Array<{ question: string; answer: string; hint?: string; explanation?: string; tags?: string[] }>,
): string {
  return Papa.unparse({
    fields: ['question', 'answer', 'hint', 'explanation', 'tags'],
    data: cards.map((c) => [c.question, c.answer, c.hint ?? '', c.explanation ?? '', (c.tags ?? []).join(', ')]),
  });
}
