import { parseTags, uid } from '@/lib/utils';
import { computeStats, revalidate } from './validate';
import { MAX_CARDS_PER_IMPORT, type DocumentIssue, type ParseOptions, type ParseResult, type ParsedCard } from './types';

/**
 * Reads a Foundy deck file (`format: "foundy-deck"`) or a full backup
 * (`format: "foundy-backup"`) into reviewable cards. Untrusted input: every
 * field is type-checked and coerced to a string; nothing is executed.
 */
export function parseFoundyJson(input: string, options: ParseOptions & { source?: string } = {}): ParseResult {
  const source = options.source ?? 'JSON';
  const issues: DocumentIssue[] = [];
  const empty = (): ParseResult => ({ cards: [], issues, stats: computeStats([]), format: 'json', source });

  if (!input.trim()) {
    issues.push({ code: 'empty-document', severity: 'error', message: 'The JSON file is empty.' });
    return empty();
  }
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (e) {
    issues.push({ code: 'invalid-json', severity: 'error', message: `This file is not valid JSON (${(e as Error).message}).` });
    return empty();
  }
  if (!isObject(data)) {
    issues.push({ code: 'invalid-json', severity: 'error', message: 'Expected a Foundy deck object.' });
    return empty();
  }

  let rawCards: unknown[] = [];
  let deckName: string | undefined;
  let deckDescription: string | undefined;

  if (data.format === 'foundy-deck' && isObject(data.deck)) {
    rawCards = Array.isArray(data.cards) ? data.cards : [];
    deckName = str(data.deck.name) || undefined;
    deckDescription = str(data.deck.description) || undefined;
  } else if (data.format === 'foundy-deck-collection' && Array.isArray(data.decks)) {
    rawCards = data.decks.flatMap((d) => (isObject(d) && Array.isArray(d.cards) ? d.cards : []));
    issues.push({ code: 'unrecognised-content', severity: 'info', message: 'This file contains several decks; their cards will be imported into one deck. To keep them as separate decks, use Settings → Restore backup.' });
  } else if (data.format === 'foundy-backup' && isObject(data.data)) {
    rawCards = Array.isArray(data.data.cards) ? data.data.cards : [];
    issues.push({
      code: 'unrecognised-content',
      severity: 'info',
      message: 'This is a full backup. Cards from every deck will be imported into one deck. To restore everything (including study history), use Settings → Restore backup.',
    });
  } else if (Array.isArray(data.cards)) {
    rawCards = data.cards;
    deckName = str((data as Record<string, unknown>).name) || undefined;
  } else {
    issues.push({ code: 'invalid-json', severity: 'error', message: 'Unrecognised JSON structure. Expected a Foundy deck file exported from Foundy Flashcards.' });
    return empty();
  }

  if (rawCards.length > MAX_CARDS_PER_IMPORT) {
    issues.push({ code: 'truncated', severity: 'warning', message: `Only the first ${MAX_CARDS_PER_IMPORT.toLocaleString()} cards were processed.` });
    rawCards = rawCards.slice(0, MAX_CARDS_PER_IMPORT);
  }

  const cards: ParsedCard[] = rawCards.map((rc, i) => {
    const c = isObject(rc) ? rc : {};
    const malformed = !isObject(rc);
    return {
      id: uid(),
      index: i + 1,
      question: str(c.question),
      answer: str(c.answer),
      hint: str(c.hint),
      explanation: str(c.explanation),
      tags: Array.isArray(c.tags) ? c.tags.map(str).filter(Boolean) : parseTags(str(c.tags)),
      aliases: Array.isArray(c.aliases) ? c.aliases.map(str).filter(Boolean) : [],
      location: `Card ${i + 1}`,
      startLine: null,
      endLine: null,
      raw: safeStringify(rc),
      errors: malformed ? [{ code: 'malformed', message: 'Entry is not a card object.' }] : [],
      warnings: [],
      status: 'valid',
      duplicateOf: null,
      hasQuestionField: typeof c.question === 'string',
      hasAnswerField: typeof c.answer === 'string',
    };
  });

  if (!cards.length) {
    issues.push({ code: 'no-cards-found', severity: 'error', message: 'The file contains no cards.' });
  }
  const validated = revalidate(cards, options.existingKeys);
  return {
    cards: validated,
    issues,
    stats: computeStats(validated),
    format: 'json',
    source,
    suggestedDeckName: deckName,
    suggestedDeckDescription: deckDescription,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string {
  if (typeof v === 'string') return v.replace(/\r\n?/g, '\n').trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}
function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? '';
  } catch {
    return '';
  }
}
