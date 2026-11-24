import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';
import { parseFoundyJson } from './foundyJson';
import { detectFormat, importFile } from './extractors';

describe('CSV import', () => {
  it('detects a header row and maps columns by name', () => {
    const r = parseCsv('Front,Back,Tags\n"What is H2O?",Water,"Chemistry, Basics"\n"Multi\nline",ok,');
    expect(r.stats.valid).toBe(2);
    expect(r.cards[0]).toMatchObject({ question: 'What is H2O?', answer: 'Water', tags: ['Chemistry', 'Basics'], location: 'Row 2' });
    expect(r.cards[1].question).toBe('Multi\nline');
  });

  it('reads headerless files positionally and reports bad rows without dropping good ones', () => {
    const r = parseCsv('q1,a1\nq2,\n,a3\nq4,a4');
    expect(r.stats).toMatchObject({ total: 4, valid: 2, invalid: 2 });
    expect(r.cards[1].errors[0].code).toBe('empty-answer');
    expect(r.cards[2].errors[0].code).toBe('empty-question');
  });

  it('round-trips through toCsv', () => {
    const cards = [{ question: 'a, with comma', answer: 'b "quoted"', hint: 'h', explanation: '', tags: ['x'] }];
    const r = parseCsv(toCsv(cards));
    expect(r.cards[0]).toMatchObject({ question: 'a, with comma', answer: 'b "quoted"', hint: 'h', tags: ['x'] });
  });

  it('handles empty CSV files', () => {
    expect(parseCsv('').issues[0].code).toBe('empty-document');
  });
});

describe('Foundy JSON import', () => {
  it('reads deck files and suggests the deck name', () => {
    const json = JSON.stringify({ format: 'foundy-deck', deck: { name: 'Bio' }, cards: [{ question: 'q', answer: 'a', tags: ['t'] }, 'garbage', { question: 'only q' }] });
    const r = parseFoundyJson(json);
    expect(r.suggestedDeckName).toBe('Bio');
    expect(r.stats).toMatchObject({ total: 3, valid: 1, invalid: 2 });
    expect(r.cards[1].errors[0].code).toBe('malformed');
    expect(r.cards[2].errors.map((e) => e.code)).toContain('missing-answer');
  });

  it('rejects invalid JSON with a clear issue', () => {
    const r = parseFoundyJson('{nope');
    expect(r.cards).toHaveLength(0);
    expect(r.issues[0].code).toBe('invalid-json');
  });
});

describe('file handling', () => {
  it('detects formats by extension', () => {
    expect(detectFormat({ name: 'notes.MD' })).toBe('md');
    expect(detectFormat({ name: 'x.docx' })).toBe('docx');
    expect(detectFormat({ name: 'x.pdf' })).toBe('pdf');
    expect(detectFormat({ name: 'x.exe' })).toBeNull();
  });

  it('reports unsupported formats instead of failing silently', async () => {
    const r = await importFile(new File(['MZ'], 'virus.exe'));
    expect(r.issues[0].code).toBe('unsupported-format');
  });

  it('reports empty files', async () => {
    const r = await importFile(new File([''], 'empty.txt', { type: 'text/plain' }));
    expect(r.issues[0].code).toBe('empty-document');
  });

  it('parses text files end to end', async () => {
    const r = await importFile(new File(['QUESTION: a\r\nANSWER: b'], 'cards.txt', { type: 'text/plain' }));
    expect(r.stats.valid).toBe(1);
    expect(r.source).toBe('cards.txt');
  });

  it('reports DOCX extraction failures for corrupt files', async () => {
    const r = await importFile(new File(['not a zip'], 'broken.docx'));
    expect(r.issues[0].code).toBe('extraction-failed');
  });
});
