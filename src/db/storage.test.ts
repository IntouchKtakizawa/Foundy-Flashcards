import { beforeEach, describe, expect, it } from 'vitest';
import { FoundyDB, db } from './database';
import {
  applySrsReview,
  bulkAddCards,
  createCard,
  createDeck,
  createFolder,
  deleteAllData,
  deleteDeck,
  duplicateDeck,
  getPreferences,
  logReview,
  mergeDecks,
  reorderCards,
  resetStudyStatistics,
  savePreferences,
} from './repo';
import { createBackup, restoreBackup, validateBackup } from '@/lib/backup/backup';

beforeEach(async () => {
  await deleteAllData();
});

describe('persistent storage', () => {
  it('persists decks and cards across database connections', async () => {
    const deck = await createDeck({ name: 'Persisted', tags: ['x'] });
    await createCard(deck.id, { question: 'q', answer: 'a' });
    db.close();
    const reopened = new FoundyDB();
    await reopened.open();
    expect((await reopened.decks.get(deck.id))?.name).toBe('Persisted');
    expect(await reopened.cards.where('deckId').equals(deck.id).count()).toBe(1);
    reopened.close();
    await db.open();
  });

  it('keeps card order and supports reordering', async () => {
    const deck = await createDeck({ name: 'Order' });
    await bulkAddCards(deck.id, [
      { question: '1', answer: 'a' },
      { question: '2', answer: 'b' },
      { question: '3', answer: 'c' },
    ]);
    const cards = await db.cards.where('[deckId+position]').between([deck.id, -Infinity], [deck.id, Infinity]).toArray();
    expect(cards.map((c) => c.question)).toEqual(['1', '2', '3']);
    await reorderCards(deck.id, [cards[2].id, cards[0].id, cards[1].id]);
    const after = await db.cards.where('[deckId+position]').between([deck.id, -Infinity], [deck.id, Infinity]).toArray();
    expect(after.map((c) => c.question)).toEqual(['3', '1', '2']);
  });

  it('deletes a deck with its cards and history', async () => {
    const deck = await createDeck({ name: 'Gone' });
    const card = await createCard(deck.id, { question: 'q', answer: 'a' });
    await logReview({ cardId: card.id, deckId: deck.id, sessionId: null, mode: 'classic', correct: true, durationMs: 1000 });
    await deleteDeck(deck.id);
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });

  it('duplicates decks with fresh progress and merges decks', async () => {
    const a = await createDeck({ name: 'A' });
    const card = await createCard(a.id, { question: 'q', answer: 'a' });
    await applySrsReview(card, 4, { sessionId: null, durationMs: 500, retention: 0.9 });
    const copy = (await duplicateDeck(a.id))!;
    const copied = await db.cards.where('deckId').equals(copy.id).first();
    expect(copied?.srs.reps).toBe(0);
    const moved = await mergeDecks(a.id, [copy.id]);
    expect(moved).toBe(1);
    expect(await db.decks.count()).toBe(1);
    expect(await db.cards.where('deckId').equals(a.id).count()).toBe(2);
  });

  it('stores preferences', async () => {
    await savePreferences({ theme: 'dark', dailyTarget: 50 });
    expect(await getPreferences()).toMatchObject({ theme: 'dark', dailyTarget: 50, accent: 'violet' });
  });

  it('resets study statistics but keeps cards', async () => {
    const deck = await createDeck({ name: 'S' });
    const card = await createCard(deck.id, { question: 'q', answer: 'a' });
    await applySrsReview(card, 3, { sessionId: null, durationMs: 500, retention: 0.9 });
    await resetStudyStatistics();
    expect(await db.reviews.count()).toBe(0);
    expect((await db.cards.get(card.id))?.srs.reps).toBe(0);
  });
});

describe('backup export and restoration', () => {
  async function seed() {
    const folder = await createFolder('Science');
    const deck = await createDeck({ name: 'Bio', folderId: folder.id, color: 'teal', icon: 'leaf' });
    const card = await createCard(deck.id, { question: 'What is osmosis?', answer: 'Water movement', tags: ['bio'] });
    const reviewed = await applySrsReview(card, 3, { sessionId: null, durationMs: 1200, retention: 0.9 });
    await savePreferences({ accent: 'teal' });
    return { folder, deck, card: reviewed };
  }

  it('exports a complete, valid backup', async () => {
    await seed();
    const backup = await createBackup();
    const v = validateBackup(JSON.parse(JSON.stringify(backup)));
    expect(v).toMatchObject({ ok: true, kind: 'backup' });
    expect(v.counts).toMatchObject({ decks: 1, cards: 1, folders: 1, reviews: 1 });
    expect(backup.data.preferences?.accent).toBe('teal');
  });

  it('restores with replace, preserving scheduling, history, folders and preferences', async () => {
    const { deck, card, folder } = await seed();
    const backup = JSON.parse(JSON.stringify(await createBackup()));
    await deleteAllData();
    const summary = await restoreBackup(backup, 'replace');
    expect(summary).toMatchObject({ decks: 1, cards: 1, folders: 1, reviews: 1 });
    const restored = await db.cards.get(card.id);
    expect(restored?.srs).toEqual(card.srs);
    expect((await db.decks.get(deck.id))?.folderId).toBe(folder.id);
    expect((await getPreferences()).accent).toBe('teal');
  });

  it('merges without overwriting existing records', async () => {
    const { deck } = await seed();
    const backup = JSON.parse(JSON.stringify(await createBackup()));
    await db.decks.update(deck.id, { name: 'Renamed locally' });
    const summary = await restoreBackup(backup, 'merge');
    expect(summary.decks).toBe(1);
    expect(await db.decks.count()).toBe(2);
    expect((await db.decks.get(deck.id))?.name).toBe('Renamed locally');
    expect(await db.cards.count()).toBe(2);
    expect(await db.reviews.count()).toBe(2);
  });

  it('rejects malformed or foreign files before touching data', async () => {
    await seed();
    expect(validateBackup({ hello: 'world' }).ok).toBe(false);
    expect(validateBackup({ format: 'foundy-backup', schemaVersion: 99, data: {} }).ok).toBe(false);
    await expect(restoreBackup({ format: 'nope' }, 'replace')).rejects.toThrow();
    expect(await db.decks.count()).toBe(1);
  });

  it('skips malformed records inside an otherwise valid backup', async () => {
    const backup = JSON.parse(JSON.stringify(await (async () => (await seed(), createBackup()))()));
    backup.data.cards.push({ id: 'bad', deckId: 'missing-deck', question: 'q', answer: 'a' }, 42, null);
    const v = validateBackup(backup);
    expect(v.ok).toBe(true);
    expect(v.warnings.length).toBeGreaterThan(0);
    await deleteAllData();
    const s = await restoreBackup(backup, 'replace');
    expect(s.cards).toBe(1);
  });
});
