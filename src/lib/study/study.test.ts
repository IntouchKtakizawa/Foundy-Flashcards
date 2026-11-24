import { describe, expect, it } from 'vitest';
import { compareAnswer, normaliseAnswer } from './answerCompare';
import { buildChoiceQuestion, distinctAnswerCount } from './multipleChoice';

const normal = { sensitivity: 'normal' as const, ignorePunctuation: true };

describe('written answer comparison', () => {
  it('normalises case, whitespace and punctuation', () => {
    expect(compareAnswer('  the MITOCHONDRION. ', 'The mitochondrion', normal).correct).toBe(true);
    expect(normaliseAnswer('Hello,   World!', normal)).toBe('hello world');
  });

  it('keeps meaningful symbols such as signs', () => {
    expect(compareAnswer('2+', '2-', normal).correct).toBe(false);
    expect(compareAnswer('2-', '2-', normal).correct).toBe(true);
  });

  it('accepts aliases', () => {
    const r = compareAnswer('mitochondria', 'The mitochondrion', { ...normal, aliases: ['mitochondria'] });
    expect(r).toMatchObject({ correct: true, reason: 'alias' });
  });

  it('is case-sensitive in strict mode', () => {
    expect(compareAnswer('dna', 'DNA', { sensitivity: 'strict', ignorePunctuation: false }).correct).toBe(false);
  });

  it('forgives small typos only in lenient mode', () => {
    expect(compareAnswer('photosynthsis', 'photosynthesis', normal).correct).toBe(false);
    expect(compareAnswer('photosynthsis', 'photosynthesis', { ...normal, sensitivity: 'lenient' }).correct).toBe(true);
    expect(compareAnswer('respiration', 'photosynthesis', { ...normal, sensitivity: 'lenient' }).correct).toBe(false);
  });

  it('treats empty input as incorrect', () => {
    expect(compareAnswer('   ', 'x', normal)).toMatchObject({ correct: false, reason: 'empty' });
  });
});

describe('multiple choice generation', () => {
  const pool = [
    { id: '1', question: 'q1', answer: 'Paris' },
    { id: '2', question: 'q2', answer: 'paris' },
    { id: '3', question: 'q3', answer: 'Rome' },
    { id: '4', question: 'q4', answer: 'Berlin' },
    { id: '5', question: 'q5', answer: 'Madrid' },
  ];

  it('never produces duplicate options and always includes the answer once', () => {
    for (let i = 0; i < 50; i++) {
      const q = buildChoiceQuestion(pool[0], pool, 4)!;
      const keys = q.options.map((o) => o.text.toLowerCase());
      expect(new Set(keys).size).toBe(keys.length);
      expect(q.options.filter((o) => o.correct)).toHaveLength(1);
      expect(q.options.length).toBe(4);
    }
  });

  it('degrades gracefully with too few distinct answers', () => {
    const tiny = [pool[0], pool[1]];
    expect(distinctAnswerCount(tiny)).toBe(1);
    expect(buildChoiceQuestion(pool[0], tiny)).toBeNull();
    const three = [pool[0], pool[2]];
    expect(buildChoiceQuestion(pool[0], three)!.options).toHaveLength(2);
  });
});
