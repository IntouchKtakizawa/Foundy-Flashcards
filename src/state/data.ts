import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import type { Deck, Flashcard, Folder, ReviewLog, StudySession } from '@/types';

/**
 * Reactive data hooks. Dexie's live queries re-run automatically whenever
 * the underlying tables change, so every screen stays in sync with
 * IndexedDB without manual refreshes. `undefined` means "still loading".
 */

export function useDecks(): Deck[] | undefined {
  return useLiveQuery(() => db.decks.toArray(), []);
}

export function useDeck(id: string | undefined): Deck | null | undefined {
  return useLiveQuery(async () => (id ? (await db.decks.get(id)) ?? null : null), [id]);
}

export function useFolders(): Folder[] | undefined {
  return useLiveQuery(() => db.folders.orderBy('name').toArray(), []);
}

export function useAllCards(): Flashcard[] | undefined {
  return useLiveQuery(() => db.cards.toArray(), []);
}

export function useDeckCards(deckId: string | undefined): Flashcard[] | undefined {
  return useLiveQuery(
    async () => (deckId ? db.cards.where('[deckId+position]').between([deckId, -Infinity], [deckId, Infinity]).toArray() : []),
    [deckId],
  );
}

export function useCard(id: string | undefined): Flashcard | null | undefined {
  return useLiveQuery(async () => (id ? (await db.cards.get(id)) ?? null : null), [id]);
}

export function useReviews(sinceMs?: number): ReviewLog[] | undefined {
  return useLiveQuery(() => (sinceMs ? db.reviews.where('reviewedAt').aboveOrEqual(sinceMs).toArray() : db.reviews.toArray()), [sinceMs]);
}

export function useSessions(): StudySession[] | undefined {
  return useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), []);
}

/** Group cards by deck id for quick per-deck summaries. */
export function groupByDeck(cards: Flashcard[]): Map<string, Flashcard[]> {
  const m = new Map<string, Flashcard[]>();
  for (const c of cards) {
    const arr = m.get(c.deckId);
    if (arr) arr.push(c);
    else m.set(c.deckId, [c]);
  }
  return m;
}
