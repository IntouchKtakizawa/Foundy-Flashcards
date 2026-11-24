import type { AnswerSensitivity } from '@/types';
import { stripMarkdown } from '@/lib/markdown/render';

/**
 * Written-answer checking.
 *
 * This is deliberately simple text comparison — it normalises case,
 * whitespace and (optionally) punctuation, accepts configured aliases and
 * tolerates small typos in "lenient" mode. It cannot judge meaning, which is
 * why the UI always lets the learner override the result.
 */

export interface CompareOptions {
  sensitivity: AnswerSensitivity;
  ignorePunctuation: boolean;
  aliases?: string[];
}

export interface CompareResult {
  correct: boolean;
  /** 0..1 similarity to the closest accepted answer. */
  similarity: number;
  matched: string | null;
  reason: 'exact' | 'normalised' | 'alias' | 'close' | 'different' | 'empty';
}

export function normaliseAnswer(s: string, opts: Pick<CompareOptions, 'sensitivity' | 'ignorePunctuation'>): string {
  let out = stripMarkdown(s).normalize('NFKC');
  if (opts.sensitivity !== 'strict') out = out.toLowerCase();
  out = out.replace(/\s+/g, ' ').trim();
  if (opts.ignorePunctuation) {
    // Keep characters that usually carry meaning in answers: + - = / ^ and digits.
    out = out.replace(/[.,;:!?'"`“”‘’()[\]{}…]/g, '').replace(/\s+/g, ' ').trim();
  }
  if (opts.sensitivity === 'lenient') {
    out = out.replace(/^(the|a|an)\s+/, '');
    out = out.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  return out;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

export function compareAnswer(submitted: string, expected: string, opts: CompareOptions): CompareResult {
  if (!submitted.trim()) return { correct: false, similarity: 0, matched: null, reason: 'empty' };
  if (submitted.trim() === expected.trim()) return { correct: true, similarity: 1, matched: expected, reason: 'exact' };

  const candidates = [expected, ...(opts.aliases ?? [])].filter((c) => c.trim());
  const sub = normaliseAnswer(submitted, opts);
  let best = { sim: 0, text: null as string | null, isAlias: false };

  for (let i = 0; i < candidates.length; i++) {
    const cand = normaliseAnswer(candidates[i], opts);
    if (sub === cand) {
      return { correct: true, similarity: 1, matched: candidates[i], reason: i === 0 ? 'normalised' : 'alias' };
    }
    const sim = similarity(sub, cand);
    if (sim > best.sim) best = { sim, text: candidates[i], isAlias: i > 0 };
  }

  // Lenient mode forgives small typos (roughly one edit per 6 characters).
  if (opts.sensitivity === 'lenient' && best.text) {
    const target = normaliseAnswer(best.text, opts);
    const allowed = Math.max(1, Math.floor(target.length / 6));
    if (target.length >= 4 && levenshtein(sub, target) <= allowed) {
      return { correct: true, similarity: best.sim, matched: best.text, reason: 'close' };
    }
  }
  return { correct: false, similarity: best.sim, matched: null, reason: 'different' };
}
