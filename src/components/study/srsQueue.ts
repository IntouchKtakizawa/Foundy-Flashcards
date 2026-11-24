import { db } from '@/db/database';
import { DAY_MS, startOfDay } from '@/lib/utils';
import type { Flashcard } from '@/types';

/** Higher = review sooner: overdue time, lapses and difficulty all add weight. */
function priority(c: Flashcard, now: number): number {
  return (now - c.due) / DAY_MS + c.srs.lapses * 1.5 + c.srs.difficulty * 0.5;
}

/**
 * Spaced-repetition queue: due review cards first (most urgent first),
 * then up to `newLimit` never-studied cards in their deck order.
 */
export function buildSrsQueue(cards: Flashcard[], now: number, newLimit: number): Flashcard[] {
  const due = cards.filter((c) => c.srs.reps > 0 && c.due <= now).sort((a, b) => priority(b, now) - priority(a, now));
  const fresh = cards.filter((c) => c.srs.reps === 0).slice(0, Math.max(0, newLimit));
  return [...due, ...fresh];
}

/** "Study ahead": every card, earliest due first. */
export function buildStudyAheadQueue(cards: Flashcard[]): Flashcard[] {
  return cards.slice().sort((a, b) => a.due - b.due);
}

/** Number of distinct new cards first reviewed with spaced repetition today. */
export async function countNewIntroducedToday(now = Date.now()): Promise<number> {
  const logs = await db.reviews
    .where('reviewedAt')
    .aboveOrEqual(startOfDay(now))
    .filter((r) => r.mode === 'srs' && r.prevState === 0)
    .toArray();
  return new Set(logs.map((r) => r.cardId)).size;
}

/** Earliest upcoming due time among already-studied cards, if any. */
export function nextDueAt(cards: Flashcard[], now: number): number | null {
  let min: number | null = null;
  for (const c of cards) {
    if (c.srs.reps > 0 && c.due > now && (min === null || c.due < min)) min = c.due;
  }
  return min;
}
