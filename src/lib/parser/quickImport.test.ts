import { describe, expect, it } from 'vitest';
import { parseQuickImport, matchMarker, toQuickImportText } from './quickImport';
import { revalidate, duplicateKey } from './validate';

const parse = (s: string) => parseQuickImport(s);

describe('QuickImport parser', () => {
  it('parses a single correctly formatted card', () => {
    const r = parse('QUESTION: What is osmosis?\nANSWER: The net movement of water molecules through a partially permeable membrane.');
    expect(r.stats).toEqual({ total: 1, valid: 1, invalid: 0, duplicates: 0 });
    expect(r.cards[0].question).toBe('What is osmosis?');
    expect(r.cards[0].answer).toBe('The net movement of water molecules through a partially permeable membrane.');
    expect(r.cards[0].location).toBe('Lines 1–2');
    expect(r.issues).toHaveLength(0);
  });

  it('parses multiple valid cards from the spec example', () => {
    const r = parse(`QUESTION: What is osmosis?
ANSWER: The net movement of water molecules through a partially permeable membrane.

QUESTION: What is the charge of a sulfate ion?
ANSWER: 2-

QUESTION: What is the formula for force?
ANSWER: F = ma`);
    expect(r.stats.valid).toBe(3);
    expect(r.cards.map((c) => c.answer)).toEqual([
      'The net movement of water molecules through a partially permeable membrane.',
      '2-',
      'F = ma',
    ]);
  });

  it('reports a missing answer without stealing the next card\'s answer', () => {
    const r = parse(`QUESTION: Q1
ANSWER: A1

QUESTION: Q2 has no answer

QUESTION: Q3
ANSWER: A3`);
    expect(r.stats).toMatchObject({ total: 3, valid: 2, invalid: 1 });
    expect(r.cards[1].question).toBe('Q2 has no answer');
    expect(r.cards[1].errors.map((e) => e.code)).toContain('missing-answer');
    expect(r.cards[2]).toMatchObject({ question: 'Q3', answer: 'A3', status: 'valid' });
    expect(r.cards[0]).toMatchObject({ question: 'Q1', answer: 'A1', status: 'valid' });
  });

  it('reports an answer without a question and keeps neighbours intact', () => {
    const r = parse(`QUESTION: Q1
ANSWER: A1
ANSWER: orphan answer

QUESTION: Q2
ANSWER: A2`);
    expect(r.stats).toMatchObject({ total: 3, valid: 2, invalid: 1 });
    expect(r.cards[0].answer).toBe('A1');
    expect(r.cards[1].errors.map((e) => e.code)).toEqual(['missing-question']);
    expect(r.cards[1].answer).toBe('orphan answer');
    expect(r.cards[2]).toMatchObject({ question: 'Q2', answer: 'A2' });
  });

  it('reports a leading orphan answer', () => {
    const r = parse('ANSWER: lonely\n\nQUESTION: Q\nANSWER: A');
    expect(r.cards[0].errors[0].code).toBe('missing-question');
    expect(r.cards[1].status).toBe('valid');
  });

  it('supports multiline questions and answers', () => {
    const r = parse(`QUESTION: Explain the steps:
1. first
2. second
ANSWER: Line one
Line two

Paragraph two`);
    expect(r.cards[0].question).toBe('Explain the steps:\n1. first\n2. second');
    expect(r.cards[0].answer).toBe('Line one\nLine two\n\nParagraph two');
  });

  it('supports a marker on its own line followed by content', () => {
    const r = parse('QUESTION:\nWhat is 2+2?\nANSWER:\n4');
    expect(r.cards[0]).toMatchObject({ question: 'What is 2+2?', answer: '4', status: 'valid' });
  });

  it('detects duplicate cards', () => {
    const r = parse('Q: a\nA: b\n\nQ: A\nA:  B \n\nQ: c\nA: d');
    expect(r.stats).toMatchObject({ total: 3, valid: 2, duplicates: 1 });
    expect(r.cards[1].status).toBe('duplicate');
    expect(r.cards[1].duplicateOf).toBe(r.cards[0].id);
  });

  it('flags duplicates of cards already in the deck', () => {
    const existing = new Set([duplicateKey('What is H2O?', 'Water')]);
    const r = parseQuickImport('QUESTION: what is h2o?\nANSWER: water', { existingKeys: existing });
    expect(r.cards[0].status).toBe('duplicate');
    expect(r.cards[0].duplicateOf).toBe('existing');
  });

  it('accepts mixed capitalisation and optional spaces around colons', () => {
    const r = parse('question : one\nAnSwEr:two\n\nQuestion:three\nanswer   :   four');
    expect(r.stats.valid).toBe(2);
    expect(r.cards[0]).toMatchObject({ question: 'one', answer: 'two' });
    expect(r.cards[1]).toMatchObject({ question: 'three', answer: 'four' });
  });

  it('ignores extra whitespace and blank lines', () => {
    const r = parse('\n\n   \nQUESTION:    padded   \n\n\n\nANSWER:   value   \n\n\n\n\n\nQUESTION: x\nANSWER: y\n\n');
    expect(r.cards[0]).toMatchObject({ question: 'padded', answer: 'value' });
    expect(r.stats.valid).toBe(2);
    expect(r.issues).toHaveLength(0);
  });

  it('normalises Windows and old Mac line endings', () => {
    const r = parse('QUESTION: a\r\nANSWER: b\r\n\r\nQUESTION: c\rANSWER: d');
    expect(r.cards.map((c) => [c.question, c.answer])).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('preserves Unicode and mathematical notation', () => {
    const r = parse('QUESTION: ∫ x² dx = ?\nANSWER: x³/3 + C — ∀ε>0, √2 ≈ 1.414, ΔG° = −RT ln K, 日本語 😀\n\nQUESTION: Quadratic formula?\nANSWER: $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$');
    expect(r.cards[0].question).toBe('∫ x² dx = ?');
    expect(r.cards[0].answer).toBe('x³/3 + C — ∀ε>0, √2 ≈ 1.414, ΔG° = −RT ln K, 日本語 😀');
    expect(r.cards[1].answer).toBe('$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$');
  });

  it('preserves markdown formatting in content', () => {
    const r = parse('QUESTION: What is **bold**?\nANSWER: - item *one*\n- item `two`');
    expect(r.cards[0].question).toBe('What is **bold**?');
    expect(r.cards[0].answer).toBe('- item *one*\n- item `two`');
  });

  it('handles empty documents', () => {
    for (const s of ['', '   ', '\n\n\r\n']) {
      const r = parse(s);
      expect(r.cards).toHaveLength(0);
      expect(r.issues[0].code).toBe('empty-document');
    }
  });

  it('reports documents with no markers', () => {
    const r = parse('Just some notes\nwithout any cards');
    expect(r.cards).toHaveLength(0);
    expect(r.issues.map((i) => i.code)).toEqual(['unrecognised-content', 'no-cards-found']);
    expect(r.issues[0].content).toContain('Just some notes');
  });

  it('reports empty question and answer fields', () => {
    const r = parse('QUESTION:\nANSWER: something\n\nQUESTION: something\nANSWER:   ');
    expect(r.cards[0].errors.map((e) => e.code)).toEqual(['empty-question']);
    expect(r.cards[1].errors.map((e) => e.code)).toEqual(['empty-answer']);
  });

  it('parses optional metadata', () => {
    const r = parse(`QUESTION: What is the function of a ribosome?
ANSWER: Protein synthesis.
HINT: Think about proteins.
EXPLANATION: Ribosomes translate messenger RNA into polypeptide chains.
TAGS: Biology, Cells`);
    expect(r.cards[0]).toMatchObject({
      hint: 'Think about proteins.',
      explanation: 'Ribosomes translate messenger RNA into polypeptide chains.',
      tags: ['Biology', 'Cells'],
      status: 'valid',
    });
  });

  it('reports metadata that has no question', () => {
    const r = parse('HINT: floating hint\n\nQUESTION: a\nANSWER: b');
    expect(r.cards[0].errors[0].code).toBe('orphan-metadata');
    expect(r.cards[1].status).toBe('valid');
  });

  it('reports text outside cards instead of silently dropping it', () => {
    const r = parse('Chapter 1 — Cells\n\nQUESTION: a\nANSWER: b');
    expect(r.cards).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ code: 'unrecognised-content', location: 'Line 1' });
  });

  it('supports Q:/A: short markers', () => {
    const r = parse('Q: short\nA: form\n\nq: two\na: three');
    expect(r.stats.valid).toBe(2);
  });

  it('treats "A:" as content when the document does not use "Q:"', () => {
    const r = parse('QUESTION: Which option is a noble gas?\nANSWER: B\nA: Oxygen\nB: Neon');
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].answer).toBe('B\nA: Oxygen\nB: Neon');
  });

  it('accepts numbered, bulleted and bold markers', () => {
    const r = parse('1. QUESTION: one\n   ANSWER: uno\n- **Question:** two\n- **Answer:** dos\n## Question 3: three\nAnswer 3: tres');
    expect(r.cards.map((c) => [c.question, c.answer])).toEqual([
      ['one', 'uno'],
      ['two', 'dos'],
      ['three', 'tres'],
    ]);
  });

  it('isolates malformed cards: 100 cards with 7 broken yields 93 valid', () => {
    const blocks: string[] = [];
    for (let i = 1; i <= 100; i++) {
      if (i % 14 === 0) blocks.push(`QUESTION: broken ${i}`); // missing answer
      else blocks.push(`QUESTION: q${i}\nANSWER: a${i}`);
    }
    const r = parse(blocks.join('\n\n'));
    expect(r.stats).toMatchObject({ total: 100, valid: 93, invalid: 7 });
    // Every valid card's answer must belong to its own question.
    for (const c of r.cards.filter((c) => c.status === 'valid')) {
      expect(c.answer).toBe(c.question.replace('q', 'a'));
    }
  });

  it('never attaches a later answer to an earlier incomplete question', () => {
    const r = parse('QUESTION: first (no answer)\nQUESTION: second\nANSWER: belongs to second');
    expect(r.cards[0]).toMatchObject({ question: 'first (no answer)', answer: '', status: 'invalid' });
    expect(r.cards[1]).toMatchObject({ question: 'second', answer: 'belongs to second', status: 'valid' });
  });

  it('revalidates a corrected card immediately', () => {
    const r = parse('QUESTION: needs answer');
    expect(r.cards[0].status).toBe('invalid');
    const fixed = revalidate([{ ...r.cards[0], answer: 'now answered', hasAnswerField: true }]);
    expect(fixed[0].status).toBe('valid');
    expect(fixed[0].errors).toHaveLength(0);
  });

  it('round-trips through the text exporter', () => {
    const cards = [
      { question: 'a', answer: 'b', hint: 'h', explanation: 'e', tags: ['x', 'y'] },
      { question: 'multi\nline', answer: 'ok' },
    ];
    const r = parse(toQuickImportText(cards));
    expect(r.cards.map((c) => ({ q: c.question, a: c.answer, h: c.hint, e: c.explanation, t: c.tags }))).toEqual([
      { q: 'a', a: 'b', h: 'h', e: 'e', t: ['x', 'y'] },
      { q: 'multi\nline', a: 'ok', h: '', e: '', t: [] },
    ]);
  });

  it('matchMarker ignores ordinary sentences', () => {
    expect(matchMarker('Note: this is not a card', true)).toBeNull();
    expect(matchMarker('The answer is 42', true)).toBeNull();
  });
});
