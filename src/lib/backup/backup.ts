import { db, type FoundyDB } from '@/db/database';
import { newSrsState } from '@/lib/srs/fsrs';
import { uid } from '@/lib/utils';
import {
  DECK_COLORS,
  DECK_ICONS,
  DEFAULT_PREFERENCES,
  type Deck,
  type Flashcard,
  type Folder,
  type ImportHistoryEntry,
  type Preferences,
  type ReviewLog,
  type SrsState,
  type StudySession,
} from '@/types';

export const APP_VERSION = '1.0.0';
export const BACKUP_SCHEMA_VERSION = 1;

export interface FoundyBackup {
  format: 'foundy-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: {
    decks: Deck[];
    cards: Flashcard[];
    folders: Folder[];
    reviews: ReviewLog[];
    sessions: StudySession[];
    imports: ImportHistoryEntry[];
    preferences: Preferences | null;
  };
}

export interface FoundyDeckFile {
  format: 'foundy-deck';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  deck: Pick<Deck, 'name' | 'description' | 'color' | 'icon' | 'tags'>;
  cards: Array<Pick<Flashcard, 'question' | 'answer' | 'explanation' | 'hint' | 'tags' | 'aliases' | 'questionImage' | 'answerImage'> & { srs?: SrsState; flagged?: 0 | 1 }>;
}

/* ------------------------------- export ---------------------------------- */

export async function createBackup(database: FoundyDB = db): Promise<FoundyBackup> {
  const [decks, cards, folders, reviews, sessions, imports, prefRec] = await Promise.all([
    database.decks.toArray(),
    database.cards.toArray(),
    database.folders.toArray(),
    database.reviews.toArray(),
    database.sessions.toArray(),
    database.imports.toArray(),
    database.preferences.get('preferences'),
  ]);
  let preferences: Preferences | null = null;
  if (prefRec) {
    const { id: _id, ...rest } = prefRec;
    preferences = rest;
  }
  return {
    format: 'foundy-backup',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { decks, cards, folders, reviews, sessions, imports, preferences },
  };
}

export async function createDeckFile(deckId: string, includeProgress = true, database: FoundyDB = db): Promise<FoundyDeckFile | null> {
  const deck = await database.decks.get(deckId);
  if (!deck) return null;
  const cards = await database.cards.where('deckId').equals(deckId).sortBy('position');
  return {
    format: 'foundy-deck',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    deck: { name: deck.name, description: deck.description, color: deck.color, icon: deck.icon, tags: deck.tags },
    cards: cards.map((c) => ({
      question: c.question,
      answer: c.answer,
      explanation: c.explanation,
      hint: c.hint,
      tags: c.tags,
      aliases: c.aliases,
      questionImage: c.questionImage,
      answerImage: c.answerImage,
      ...(includeProgress ? { srs: c.srs, flagged: c.flagged } : {}),
    })),
  };
}

/* ------------------------------ validation -------------------------------- */

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  kind: 'backup' | 'deck' | 'collection' | null;
  counts: { decks: number; cards: number; folders: number; reviews: number; sessions: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validSrs(v: unknown): v is SrsState {
  return isObj(v) && isNum(v.due) && isNum(v.stability) && isNum(v.difficulty) && isNum(v.reps) && isNum(v.lapses) && [0, 1, 2, 3].includes(v.state as number);
}

export function validateBackup(raw: unknown): BackupValidation {
  const res: BackupValidation = { ok: false, errors: [], warnings: [], kind: null, counts: { decks: 0, cards: 0, folders: 0, reviews: 0, sessions: 0 } };
  if (!isObj(raw)) {
    res.errors.push('File is not a Foundy backup (expected a JSON object).');
    return res;
  }
  if (raw.format === 'foundy-deck-collection') {
    res.kind = 'collection';
    if (!Array.isArray(raw.decks)) {
      res.errors.push('Deck collection has no decks.');
      return res;
    }
    const valid = raw.decks.filter((d) => validateBackup(d).ok);
    res.counts.decks = valid.length;
    res.counts.cards = valid.reduce((n: number, d) => n + validateBackup(d).counts.cards, 0);
    if (raw.decks.length - valid.length) res.warnings.push(`${raw.decks.length - valid.length} malformed deck(s) will be skipped.`);
    res.ok = valid.length > 0;
    if (!res.ok) res.errors.push('No valid decks found in this file.');
    return res;
  }
  if (raw.format === 'foundy-deck') {
    res.kind = 'deck';
    if (!isObj(raw.deck) || !isStr(raw.deck.name)) res.errors.push('Deck file is missing deck information.');
    if (!Array.isArray(raw.cards)) res.errors.push('Deck file has no cards array.');
    else {
      res.counts.decks = 1;
      res.counts.cards = raw.cards.filter((c) => isObj(c) && isStr(c.question) && isStr(c.answer)).length;
      const bad = raw.cards.length - res.counts.cards;
      if (bad) res.warnings.push(`${bad} malformed card${bad === 1 ? '' : 's'} will be skipped.`);
    }
    res.ok = res.errors.length === 0;
    return res;
  }
  if (raw.format !== 'foundy-backup') {
    res.errors.push('Unrecognised file. Choose a backup created with "Export complete backup".');
    return res;
  }
  res.kind = 'backup';
  if (!isNum(raw.schemaVersion) || raw.schemaVersion > BACKUP_SCHEMA_VERSION) {
    res.errors.push('This backup was created by a newer version of Foundy Flashcards. Update the app and try again.');
  }
  if (!isObj(raw.data)) {
    res.errors.push('Backup has no data section.');
    return res;
  }
  const d = raw.data;
  for (const key of ['decks', 'cards', 'folders', 'reviews', 'sessions'] as const) {
    if (d[key] !== undefined && !Array.isArray(d[key])) res.errors.push(`Backup field "${key}" is not a list.`);
  }
  if (res.errors.length) return res;
  const decks = (d.decks as unknown[] | undefined) ?? [];
  const cards = (d.cards as unknown[] | undefined) ?? [];
  const validDecks = decks.filter((x) => isObj(x) && isStr(x.id) && isStr(x.name));
  const deckIds = new Set(validDecks.map((x) => (x as Deck).id));
  const validCards = cards.filter((x) => isObj(x) && isStr(x.id) && isStr(x.deckId) && isStr(x.question) && isStr(x.answer));
  const orphanCards = validCards.filter((c) => !deckIds.has((c as Flashcard).deckId)).length;
  res.counts = {
    decks: validDecks.length,
    cards: validCards.length - orphanCards,
    folders: ((d.folders as unknown[] | undefined) ?? []).length,
    reviews: ((d.reviews as unknown[] | undefined) ?? []).length,
    sessions: ((d.sessions as unknown[] | undefined) ?? []).length,
  };
  if (decks.length - validDecks.length) res.warnings.push(`${decks.length - validDecks.length} malformed deck(s) will be skipped.`);
  if (cards.length - validCards.length) res.warnings.push(`${cards.length - validCards.length} malformed card(s) will be skipped.`);
  if (orphanCards) res.warnings.push(`${orphanCards} card(s) belong to missing decks and will be skipped.`);
  res.ok = true;
  return res;
}

/* -------------------------------- restore --------------------------------- */

export type RestoreStrategy = 'merge' | 'replace';

function sanitiseDeck(x: Record<string, unknown>): Deck {
  const now = Date.now();
  return {
    id: String(x.id),
    name: String(x.name).slice(0, 200),
    description: isStr(x.description) ? x.description : '',
    color: DECK_COLORS.includes(x.color as never) ? (x.color as Deck['color']) : 'violet',
    icon: DECK_ICONS.includes(x.icon as never) ? (x.icon as Deck['icon']) : 'book',
    folderId: isStr(x.folderId) ? x.folderId : null,
    tags: Array.isArray(x.tags) ? x.tags.filter(isStr) : [],
    archived: x.archived ? 1 : 0,
    createdAt: isNum(x.createdAt) ? x.createdAt : now,
    updatedAt: isNum(x.updatedAt) ? x.updatedAt : now,
    lastStudiedAt: isNum(x.lastStudiedAt) ? x.lastStudiedAt : null,
    lastOpenedAt: isNum(x.lastOpenedAt) ? x.lastOpenedAt : null,
  };
}

function sanitiseCard(x: Record<string, unknown>, deckId: string, position: number): Flashcard {
  const now = Date.now();
  const srs = validSrs(x.srs)
    ? {
        ...newSrsState(now),
        ...(x.srs as SrsState),
      }
    : newSrsState(now);
  return {
    id: isStr(x.id) ? x.id : uid(),
    deckId,
    question: String(x.question ?? ''),
    answer: String(x.answer ?? ''),
    explanation: isStr(x.explanation) ? x.explanation : '',
    hint: isStr(x.hint) ? x.hint : '',
    tags: Array.isArray(x.tags) ? x.tags.filter(isStr) : [],
    aliases: Array.isArray(x.aliases) ? x.aliases.filter(isStr) : [],
    questionImage: isStr(x.questionImage) && x.questionImage.startsWith('data:image/') ? x.questionImage : null,
    answerImage: isStr(x.answerImage) && x.answerImage.startsWith('data:image/') ? x.answerImage : null,
    position: isNum(x.position) ? x.position : position,
    flagged: x.flagged ? 1 : 0,
    srs,
    due: srs.due,
    createdAt: isNum(x.createdAt) ? x.createdAt : now,
    updatedAt: isNum(x.updatedAt) ? x.updatedAt : now,
  };
}

export interface RestoreSummary {
  decks: number;
  cards: number;
  folders: number;
  reviews: number;
  sessions: number;
}

/**
 * Restore a validated backup.
 *  - replace: wipe local data first, then write the backup as-is.
 *  - merge:   keep local data; records whose id already exists are given
 *             new ids, so nothing local is ever overwritten.
 */
export async function restoreBackup(raw: unknown, strategy: RestoreStrategy, database: FoundyDB = db): Promise<RestoreSummary> {
  const v = validateBackup(raw);
  if (!v.ok) throw new Error(v.errors.join(' '));
  if (v.kind === 'deck') {
    const r = await importDeckFile(raw as FoundyDeckFile, true, database);
    return { decks: 1, cards: r.cards, folders: 0, reviews: 0, sessions: 0 };
  }
  if (v.kind === 'collection') {
    const summary: RestoreSummary = { decks: 0, cards: 0, folders: 0, reviews: 0, sessions: 0 };
    for (const d of (raw as { decks: unknown[] }).decks) {
      if (!validateBackup(d).ok) continue;
      const r = await importDeckFile(d as FoundyDeckFile, true, database);
      summary.decks++;
      summary.cards += r.cards;
    }
    return summary;
  }
  const backup = raw as FoundyBackup;
  const d = backup.data;
  const summary: RestoreSummary = { decks: 0, cards: 0, folders: 0, reviews: 0, sessions: 0 };

  await database.transaction(
    'rw',
    [database.decks, database.cards, database.folders, database.reviews, database.sessions, database.imports, database.preferences],
    async () => {
      if (strategy === 'replace') {
        await Promise.all([
          database.decks.clear(),
          database.cards.clear(),
          database.folders.clear(),
          database.reviews.clear(),
          database.sessions.clear(),
          database.imports.clear(),
        ]);
      }
      const existing = async (table: 'decks' | 'cards' | 'folders' | 'reviews' | 'sessions', id: string) =>
        strategy === 'merge' && (await database[table].get(id)) !== undefined;

      const folderMap = new Map<string, string>();
      for (const f of (d.folders ?? []).filter((x) => isObj(x) && isStr(x.id) && isStr(x.name))) {
        const id = (await existing('folders', f.id)) ? uid() : f.id;
        folderMap.set(f.id, id);
        await database.folders.put({ id, name: f.name, color: DECK_COLORS.includes(f.color) ? f.color : 'slate', createdAt: f.createdAt ?? Date.now(), updatedAt: f.updatedAt ?? Date.now() });
        summary.folders++;
      }

      const deckMap = new Map<string, string>();
      for (const rawDeck of (d.decks ?? []).filter((x) => isObj(x) && isStr(x.id) && isStr(x.name))) {
        const deck = sanitiseDeck(rawDeck as unknown as Record<string, unknown>);
        const id = (await existing('decks', deck.id)) ? uid() : deck.id;
        deckMap.set(deck.id, id);
        await database.decks.put({ ...deck, id, folderId: deck.folderId ? folderMap.get(deck.folderId) ?? null : null });
        summary.decks++;
      }

      const cardMap = new Map<string, string>();
      let pos = 0;
      for (const rc of (d.cards ?? []).filter((x) => isObj(x) && isStr(x.id) && isStr(x.deckId))) {
        const deckId = deckMap.get(rc.deckId);
        if (!deckId) continue;
        const card = sanitiseCard(rc as unknown as Record<string, unknown>, deckId, pos++);
        const id = (await existing('cards', card.id)) ? uid() : card.id;
        cardMap.set(card.id, id);
        await database.cards.put({ ...card, id });
        summary.cards++;
      }

      const sessionMap = new Map<string, string>();
      for (const s of (d.sessions ?? []).filter((x) => isObj(x) && isStr(x.id))) {
        const id = (await existing('sessions', s.id)) ? uid() : s.id;
        sessionMap.set(s.id, id);
        await database.sessions.put({
          ...s,
          id,
          deckIds: (Array.isArray(s.deckIds) ? s.deckIds : []).map((x) => deckMap.get(x)).filter((x): x is string => !!x),
          missedCardIds: (Array.isArray(s.missedCardIds) ? s.missedCardIds : []).map((x) => cardMap.get(x)).filter((x): x is string => !!x),
        });
        summary.sessions++;
      }

      for (const r of (d.reviews ?? []).filter((x) => isObj(x) && isStr(x.id) && isNum(x.reviewedAt))) {
        const cardId = cardMap.get(r.cardId);
        const deckId = deckMap.get(r.deckId);
        if (!cardId || !deckId) continue;
        const id = (await existing('reviews', r.id)) ? uid() : r.id;
        await database.reviews.put({ ...r, id, cardId, deckId, sessionId: r.sessionId ? sessionMap.get(r.sessionId) ?? null : null });
        summary.reviews++;
      }

      for (const imp of (d.imports ?? []).filter((x) => isObj(x) && isStr(x.id))) {
        const deckId = deckMap.get(imp.deckId);
        if (deckId) await database.imports.put({ ...imp, id: strategy === 'merge' ? uid() : imp.id, deckId });
      }

      if (d.preferences && (strategy === 'replace' || !(await database.preferences.get('preferences')))) {
        await database.preferences.put({ id: 'preferences', ...DEFAULT_PREFERENCES, ...d.preferences });
      }
    },
  );
  return summary;
}

/** Import a Foundy deck file as a new deck, optionally keeping scheduling. */
export async function importDeckFile(file: FoundyDeckFile, keepProgress: boolean, database: FoundyDB = db): Promise<{ deckId: string; cards: number }> {
  const now = Date.now();
  const deck = sanitiseDeck({ ...(file.deck as unknown as Record<string, unknown>), id: uid(), createdAt: now, updatedAt: now, lastOpenedAt: now });
  const cards = (file.cards ?? [])
    .filter((c) => isObj(c) && isStr(c.question) && isStr(c.answer))
    .map((c, i) => {
      const card = sanitiseCard({ ...(c as unknown as Record<string, unknown>), id: uid(), position: i, srs: keepProgress ? c.srs : undefined }, deck.id, i);
      return card;
    });
  await database.transaction('rw', database.decks, database.cards, async () => {
    await database.decks.add(deck);
    await database.cards.bulkAdd(cards);
  });
  return { deckId: deck.id, cards: cards.length };
}
