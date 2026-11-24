import { db } from '@/db/database';
import { createBackup, createDeckFile } from './backup';
import { toCsv } from '@/lib/parser/csv';
import { toQuickImportText } from '@/lib/parser/quickImport';
import { downloadText, slugify } from '@/lib/utils';

export type DeckExportFormat = 'json' | 'csv' | 'txt';

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportDeck(deckId: string, format: DeckExportFormat): Promise<void> {
  const deck = await db.decks.get(deckId);
  if (!deck) throw new Error('Deck not found');
  const name = `${slugify(deck.name)}-${stamp()}`;
  if (format === 'json') {
    const file = await createDeckFile(deckId, true);
    downloadText(JSON.stringify(file, null, 2), `${name}.foundy.json`, 'application/json');
    return;
  }
  const cards = await db.cards.where('deckId').equals(deckId).sortBy('position');
  if (format === 'csv') downloadText(toCsv(cards), `${name}.csv`, 'text/csv;charset=utf-8');
  else downloadText(toQuickImportText(cards), `${name}.txt`);
}

/** All decks as a single Foundy backup-free bundle (one deck file per deck in an array). */
export async function exportAllDecks(): Promise<void> {
  const decks = await db.decks.toArray();
  const files = [];
  for (const d of decks) {
    const f = await createDeckFile(d.id, true);
    if (f) files.push(f);
  }
  downloadText(JSON.stringify({ format: 'foundy-deck-collection', exportedAt: new Date().toISOString(), decks: files }, null, 2), `foundy-decks-${stamp()}.json`, 'application/json');
}

export async function exportFullBackup(): Promise<void> {
  const backup = await createBackup();
  downloadText(JSON.stringify(backup), `foundy-backup-${stamp()}.json`, 'application/json');
  await db.meta.put({ key: 'lastBackupAt', value: Date.now() });
}
