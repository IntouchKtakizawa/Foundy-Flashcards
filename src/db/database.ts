import Dexie, { type Table } from 'dexie';
import type {
  Deck,
  Flashcard,
  Folder,
  ImportHistoryEntry,
  MetaRecord,
  PreferencesRecord,
  ReviewLog,
  StudySession,
} from '@/types';

export const DB_NAME = 'foundy-flashcards';

/**
 * IndexedDB database (via Dexie).
 *
 * Versioning rules:
 *  - Never edit a released version's schema; add a new `.version(n)` instead.
 *  - Put data back-fills in `.upgrade()` so existing users are migrated
 *    in place and nothing is lost when the app updates.
 */
export class FoundyDB extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Flashcard, string>;
  folders!: Table<Folder, string>;
  reviews!: Table<ReviewLog, string>;
  sessions!: Table<StudySession, string>;
  preferences!: Table<PreferencesRecord, string>;
  imports!: Table<ImportHistoryEntry, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = DB_NAME) {
    super(name);

    // v1 — initial schema.
    this.version(1).stores({
      decks: 'id, name, folderId, archived, updatedAt, lastStudiedAt, lastOpenedAt, *tags',
      cards: 'id, deckId, due, flagged, updatedAt, *tags',
      folders: 'id, name',
      reviews: 'id, cardId, deckId, sessionId, reviewedAt, mode',
      sessions: 'id, startedAt, mode',
      preferences: 'id',
      imports: 'id, createdAt, deckId',
      meta: 'key',
    });

    // v2 — compound indexes for ordered card lists and per-deck due queries,
    // plus a back-fill guaranteeing every card has aliases/position fields.
    this.version(2)
      .stores({
        cards: 'id, deckId, due, flagged, updatedAt, *tags, [deckId+position], [deckId+due]',
      })
      .upgrade(async (tx) => {
        await tx
          .table('cards')
          .toCollection()
          .modify((card: Partial<Flashcard>) => {
            if (!Array.isArray(card.aliases)) card.aliases = [];
            if (typeof card.position !== 'number') card.position = card.createdAt ?? Date.now();
          });
        await tx.table('meta').put({ key: 'migratedToV2At', value: Date.now() });
      });
  }
}

export const db = new FoundyDB();

/** Ask the browser to keep our storage even under pressure (best-effort). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted?.();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* unsupported */
  }
  return false;
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    /* unsupported */
  }
  return null;
}
