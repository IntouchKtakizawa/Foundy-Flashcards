import type { CardIssue, ParsedCard, ParseStats } from './types';
import { MAX_FIELD_LENGTH } from './types';

/** Normalised identity of a card, used for duplicate detection. */
export function duplicateKey(question: string, answer: string): string {
  const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${norm(question)}\u241F${norm(answer)}`;
}

/** Validate a single card's fields. Pure — safe to call after every edit. */
export function validateFields(card: Pick<ParsedCard, 'question' | 'answer' | 'hint' | 'explanation' | 'hasQuestionField' | 'hasAnswerField'>): CardIssue[] {
  const errors: CardIssue[] = [];
  if (!card.hasQuestionField) {
    errors.push({ code: 'missing-question', message: 'Answer has no matching QUESTION.' });
  } else if (!card.question.trim()) {
    errors.push({ code: 'empty-question', message: 'Question is empty.' });
  }
  if (!card.hasAnswerField) {
    errors.push({ code: 'missing-answer', message: 'Question has no ANSWER.' });
  } else if (!card.answer.trim()) {
    errors.push({ code: 'empty-answer', message: 'Answer is empty.' });
  }
  for (const [name, value] of [
    ['Question', card.question],
    ['Answer', card.answer],
    ['Hint', card.hint],
    ['Explanation', card.explanation],
  ] as const) {
    if (value.length > MAX_FIELD_LENGTH) {
      errors.push({
        code: 'field-too-long',
        message: `${name} is longer than ${MAX_FIELD_LENGTH.toLocaleString()} characters.`,
      });
    }
  }
  return errors;
}

/**
 * Recompute status + duplicate flags for a list of cards. Keeps any
 * structural errors (e.g. orphan metadata) that field validation can't see.
 * Returns new card objects; inputs are not mutated.
 */
export function revalidate(cards: ParsedCard[], existingKeys?: Set<string>): ParsedCard[] {
  const firstByKey = new Map<string, string>();
  return cards.map((card) => {
    const structural = card.errors.filter((e) => e.code === 'orphan-metadata' || e.code === 'malformed');
    const errors = [...structural, ...validateFields(card)];
    let status: ParsedCard['status'] = errors.length ? 'invalid' : 'valid';
    let duplicateOf: string | null = null;
    if (status === 'valid') {
      const key = duplicateKey(card.question, card.answer);
      if (existingKeys?.has(key)) {
        status = 'duplicate';
        duplicateOf = 'existing';
      } else if (firstByKey.has(key)) {
        status = 'duplicate';
        duplicateOf = firstByKey.get(key)!;
      } else {
        firstByKey.set(key, card.id);
      }
    }
    return { ...card, errors, status, duplicateOf };
  });
}

export function computeStats(cards: ParsedCard[]): ParseStats {
  let valid = 0;
  let invalid = 0;
  let duplicates = 0;
  for (const c of cards) {
    if (c.status === 'valid') valid++;
    else if (c.status === 'invalid') invalid++;
    else duplicates++;
  }
  return { total: cards.length, valid, invalid, duplicates };
}
