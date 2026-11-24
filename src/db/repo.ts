import { db } from './database';
import { newSrsState, schedule } from '@/lib/srs/fsrs';
import { uid } from '@/lib/utils';
import {
  DEFAULT_PREFERENCES,
  type Deck,
  type DeckColor,
  type DeckIcon,
  type Flashcard,
  type Folder,
  type Grade,
  type ImportFormat,
  type Preferences,
  type ReviewLog,
  type StudyMode,
  type StudySession,
} from '@/types';

/* -------------------------------------------------------------------------- */
/* Decks                                                                      */
/* -------------------------------------------------------------------------- */

export interface DeckInput {
  name: string;
  description?: string;
  color?: DeckColor;
  icon?: DeckIcon;
  folderId?: string | null;
  tags?: string[];
}

export async function createDeck(input: DeckInput): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = {
    id: uid(),
    name: input.name.trim() || 'Untitled deck',
    description: input.description?.trim() ?? '',
    color: input.color ?? 'violet',
    icon: input.icon ?? 'book',
    folderId: input.folderId ?? null,
    tags: input.tags ?? [],
    archived: 0,
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: null,
    lastOpenedAt: now,
  };
  await db.decks.add(deck);
  return deck;
}

export async function updateDeck(id: string, patch: Partial<Omit<Deck, 'id' | 'createdAt'>>): Promise<void> {
  await db.decks.update(id, { ...patch, updatedAt: Date.now() });
}

export async function touchDeckOpened(id: string): Promise<void> {
  await db.decks.update(id, { lastOpenedAt: Date.now() });
}

export async function setDeckArchived(id: string, archived: boolean): Promise<void> {
  await updateDeck(id, { archived: archived ? 1 : 0 });
}

export async function duplicateDeck(id: string): Promise<Deck | null> {
  const deck = await db.decks.get(id);
  if (!deck) return null;
  const now = Date.now();
  const copy: Deck = {
    ...deck,
    id: uid(),
    name: `${deck.name} (copy)`,
    archived: 0,
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: null,
    lastOpenedAt: now,
  };
  const cards = await db.cards.where('deckId').equals(id).toArray();
  await db.transaction('rw', db.decks, db.cards, async () => {
    await db.decks.add(copy);
    await db.cards.bulkAdd(
      cards.map((c) => {
        const srs = newSrsState(now);
        return { ...c, id: uid(), deckId: copy.id, srs, due: srs.due, flagged: 0, createdAt: now, updatedAt: now };
      }),
    );
  });
  return copy;
}

export async function deleteDeck(id: string): Promise<void> {
  await db.transaction('rw', [db.decks, db.cards, db.reviews], async () => {
    await db.cards.where('deckId').equals(id).delete();
    await db.reviews.where('deckId').equals(id).delete();
    await db.decks.delete(id);
  });
}

/** Move every card from `sourceIds` into `targetId` and delete the sources. */
export async function mergeDecks(targetId: string, sourceIds: string[]): Promise<number> {
  let moved = 0;
  await db.transaction('rw', [db.decks, db.cards, db.reviews], async () => {
    let pos = await nextPosition(targetId);
    for (const sid of sourceIds) {
      if (sid === targetId) continue;
      const cards = await db.cards.where('deckId').equals(sid).sortBy('position');
      for (const c of cards) {
        await db.cards.update(c.id, { deckId: targetId, position: pos++, updatedAt: Date.now() });
        moved++;
      }
      await db.reviews.where('deckId').equals(sid).modify({ deckId: targetId });
      await db.decks.delete(sid);
    }
    await db.decks.update(targetId, { updatedAt: Date.now() });
  });
  return moved;
}

/* -------------------------------------------------------------------------- */
/* Cards                                                                      */
/* -------------------------------------------------------------------------- */

export interface CardInput {
  question: string;
  answer: string;
  explanation?: string;
  hint?: string;
  tags?: string[];
  aliases?: string[];
  questionImage?: string | null;
  answerImage?: string | null;
}

async function nextPosition(deckId: string): Promise<number> {
  const last = await db.cards.where('[deckId+position]').between([deckId, -Infinity], [deckId, Infinity]).last();
  return last ? last.position + 1 : 0;
}

function buildCard(deckId: string, input: CardInput, position: number, now: number): Flashcard {
  const srs = newSrsState(now);
  return {
    id: uid(),
    deckId,
    question: input.question,
    answer: input.answer,
    explanation: input.explanation ?? '',
    hint: input.hint ?? '',
    tags: input.tags ?? [],
    aliases: input.aliases ?? [],
    questionImage: input.questionImage ?? null,
    answerImage: input.answerImage ?? null,
    position,
    flagged: 0,
    srs,
    due: srs.due,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createCard(deckId: string, input: CardInput): Promise<Flashcard> {
  const now = Date.now();
  const card = buildCard(deckId, input, await nextPosition(deckId), now);
  await db.transaction('rw', db.cards, db.decks, async () => {
    await db.cards.add(card);
    await db.decks.update(deckId, { updatedAt: now });
  });
  return card;
}

export async function bulkAddCards(deckId: string, inputs: CardInput[]): Promise<number> {
  if (!inputs.length) return 0;
  const now = Date.now();
  await db.transaction('rw', db.cards, db.decks, async () => {
    let pos = await nextPosition(deckId);
    await db.cards.bulkAdd(inputs.map((i) => buildCard(deckId, i, pos++, now)));
    await db.decks.update(deckId, { updatedAt: now });
  });
  return inputs.length;
}

export async function updateCard(id: string, patch: Partial<CardInput>): Promise<void> {
  await db.cards.update(id, { ...patch, updatedAt: Date.now() });
}

export async function duplicateCard(id: string): Promise<Flashcard | null> {
  const card = await db.cards.get(id);
  if (!card) return null;
  // Insert directly after the original by shifting later cards down.
  const now = Date.now();
  const copy = buildCard(card.deckId, card, card.position + 1, now);
  await db.transaction('rw', db.cards, async () => {
    await db.cards
      .where('[deckId+position]')
      .between([card.deckId, card.position + 1], [card.deckId, Infinity])
      .modify((c) => {
        c.position += 1;
      });
    await db.cards.add(copy);
  });
  return copy;
}

export async function deleteCards(ids: string[]): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.bulkDelete(ids);
    await db.reviews.where('cardId').anyOf(ids).delete();
  });
}

export async function reorderCards(deckId: string, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.cards, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.cards.update(orderedIds[i], { position: i });
    }
  });
  await db.decks.update(deckId, { updatedAt: Date.now() });
}

export async function moveCardsToDeck(ids: string[], targetDeckId: string): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    let pos = await nextPosition(targetDeckId);
    for (const id of ids) {
      await db.cards.update(id, { deckId: targetDeckId, position: pos++, updatedAt: Date.now() });
    }
    await db.reviews.where('cardId').anyOf(ids).modify({ deckId: targetDeckId });
  });
}

export async function setCardFlag(id: string, flagged: boolean): Promise<void> {
  await db.cards.update(id, { flagged: flagged ? 1 : 0 });
}

export async function resetCardProgress(ids: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.cards, async () => {
    for (const id of ids) {
      const srs = newSrsState(now);
      await db.cards.update(id, { srs, due: srs.due });
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Folders                                                                    */
/* -------------------------------------------------------------------------- */

export async function createFolder(name: string, color: DeckColor = 'slate'): Promise<Folder> {
  const now = Date.now();
  const folder: Folder = { id: uid(), name: name.trim() || 'New folder', color, createdAt: now, updatedAt: now };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name: name.trim() || 'Folder', updatedAt: Date.now() });
}

export async function deleteFolder(id: string): Promise<void> {
  await db.transaction('rw', db.folders, db.decks, async () => {
    await db.decks.where('folderId').equals(id).modify({ folderId: null });
    await db.folders.delete(id);
  });
}

/* -------------------------------------------------------------------------- */
/* Reviews & sessions                                                         */
/* -------------------------------------------------------------------------- */

export async function startSession(deckIds: string[], mode: StudyMode, total: number): Promise<StudySession> {
  const session: StudySession = {
    id: uid(),
    deckIds,
    mode,
    startedAt: Date.now(),
    endedAt: null,
    durationMs: 0,
    total,
    correct: 0,
    incorrect: 0,
    missedCardIds: [],
  };
  await db.sessions.add(session);
  return session;
}

export async function finishSession(
  id: string,
  result: { total: number; correct: number; incorrect: number; missedCardIds: string[]; durationMs: number },
): Promise<void> {
  const endedAt = Date.now();
  const session = await db.sessions.get(id);
  await db.transaction('rw', db.sessions, db.decks, async () => {
    await db.sessions.update(id, { ...result, endedAt });
    if (session) {
      for (const deckId of session.deckIds) await db.decks.update(deckId, { lastStudiedAt: endedAt });
    }
  });
}

/** Record a non-scheduling review (classic, written, choice, match, exam). */
export async function logReview(entry: Omit<ReviewLog, 'id' | 'reviewedAt' | 'grade' | 'prevState' | 'scheduledDays'> & { reviewedAt?: number }): Promise<void> {
  const log: ReviewLog = {
    id: uid(),
    grade: null,
    prevState: null,
    scheduledDays: null,
    reviewedAt: entry.reviewedAt ?? Date.now(),
    ...entry,
  };
  await db.reviews.add(log);
  await db.decks.update(entry.deckId, { lastStudiedAt: log.reviewedAt });
}

/** Apply an FSRS grade to a card and log it. Returns the updated card. */
export async function applySrsReview(
  card: Flashcard,
  grade: Grade,
  opts: { sessionId: string | null; durationMs: number; retention: number; now?: number },
): Promise<Flashcard> {
  const now = opts.now ?? Date.now();
  const next = schedule(card.srs, grade, now, opts.retention);
  const updated: Flashcard = { ...card, srs: next, due: next.due };
  const log: ReviewLog = {
    id: uid(),
    cardId: card.id,
    deckId: card.deckId,
    sessionId: opts.sessionId,
    mode: 'srs',
    correct: grade > 1,
    grade,
    durationMs: opts.durationMs,
    reviewedAt: now,
    prevState: card.srs.state,
    scheduledDays: next.scheduledDays,
  };
  await db.transaction('rw', db.cards, db.reviews, db.decks, async () => {
    await db.cards.update(card.id, { srs: next, due: next.due });
    await db.reviews.add(log);
    await db.decks.update(card.deckId, { lastStudiedAt: now });
  });
  return updated;
}

/* -------------------------------------------------------------------------- */
/* Preferences, imports, maintenance                                          */
/* -------------------------------------------------------------------------- */

export async function getPreferences(): Promise<Preferences> {
  const rec = await db.preferences.get('preferences');
  if (!rec) return { ...DEFAULT_PREFERENCES };
  const { id: _id, ...rest } = rec;
  return { ...DEFAULT_PREFERENCES, ...rest };
}

export async function savePreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const current = await getPreferences();
  const next = { ...current, ...patch };
  await db.preferences.put({ id: 'preferences', ...next });
  return next;
}

export async function recordImport(entry: { source: string; format: ImportFormat; deckId: string; imported: number; skipped: number }): Promise<void> {
  await db.imports.add({ id: uid(), createdAt: Date.now(), ...entry });
}

export async function resetStudyStatistics(): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.reviews, db.sessions, db.cards, db.decks], async () => {
    await db.reviews.clear();
    await db.sessions.clear();
    await db.cards.toCollection().modify((c) => {
      const srs = newSrsState(now);
      c.srs = srs;
      c.due = srs.due;
      c.flagged = 0;
    });
    await db.decks.toCollection().modify({ lastStudiedAt: null });
  });
}

export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', [db.decks, db.cards, db.folders, db.reviews, db.sessions, db.preferences, db.imports, db.meta], async () => {
    await Promise.all([
      db.decks.clear(),
      db.cards.clear(),
      db.folders.clear(),
      db.reviews.clear(),
      db.sessions.clear(),
      db.preferences.clear(),
      db.imports.clear(),
      db.meta.clear(),
    ]);
  });
}
