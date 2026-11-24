import { shuffle } from '@/lib/utils';
import { stripMarkdown } from '@/lib/markdown/render';

export interface ChoiceCard {
  id: string;
  question: string;
  answer: string;
}

export interface ChoiceQuestion {
  cardId: string;
  question: string;
  options: Array<{ text: string; correct: boolean; sourceCardId: string }>;
}

const key = (s: string) => stripMarkdown(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** Number of distinct answers available as distractors in a pool. */
export function distinctAnswerCount(pool: ChoiceCard[]): number {
  return new Set(pool.map((c) => key(c.answer)).filter(Boolean)).size;
}

/**
 * Build a multiple-choice question for `card` using other cards' answers as
 * distractors. Options are de-duplicated by normalised text, so two cards
 * with the same answer never produce two identical options. When the pool
 * is small, fewer options are returned (minimum 2) instead of padding.
 */
export function buildChoiceQuestion(
  card: ChoiceCard,
  pool: ChoiceCard[],
  optionCount = 4,
  rng: () => number = Math.random,
): ChoiceQuestion | null {
  const correctKey = key(card.answer);
  if (!correctKey) return null;
  const seen = new Set([correctKey]);
  const distractors: ChoiceQuestion['options'] = [];
  // Prefer answers of similar length — they make more plausible distractors.
  const candidates = shuffle(pool, rng)
    .filter((c) => c.id !== card.id)
    .sort((a, b) => Math.abs(a.answer.length - card.answer.length) - Math.abs(b.answer.length - card.answer.length));
  const shortlist = shuffle(candidates.slice(0, Math.max(optionCount * 3, 9)), rng).concat(candidates.slice(Math.max(optionCount * 3, 9)));
  for (const c of shortlist) {
    const k = key(c.answer);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    distractors.push({ text: c.answer, correct: false, sourceCardId: c.id });
    if (distractors.length >= optionCount - 1) break;
  }
  if (distractors.length < 1) return null;
  return {
    cardId: card.id,
    question: card.question,
    options: shuffle([{ text: card.answer, correct: true, sourceCardId: card.id }, ...distractors], rng),
  };
}
