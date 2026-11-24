import { createEmptyCard, fsrs, Rating, State, type Card as FsrsCard, type Grade as FsrsGrade } from 'ts-fsrs';
import type { Grade, SrsState } from '@/types';

/**
 * Thin adapter around ts-fsrs (FSRS v6).
 *
 * The rest of the app only sees our serialisable `SrsState` (numbers instead
 * of Date objects); this module converts to and from the library's Card type
 * so the scheduling algorithm can be upgraded in one place.
 */

const schedulers = new Map<string, ReturnType<typeof fsrs>>();

function scheduler(retention = 0.9) {
  const key = retention.toFixed(3);
  let f = schedulers.get(key);
  if (!f) {
    f = fsrs({ request_retention: retention, enable_fuzz: true, enable_short_term: true, maximum_interval: 36500 });
    schedulers.set(key, f);
  }
  return f;
}

export function newSrsState(now = Date.now()): SrsState {
  return fromFsrsCard(createEmptyCard(new Date(now)));
}

export function toFsrsCard(s: SrsState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.lastReview ? new Date(s.lastReview) : undefined,
  };
}

export function fromFsrsCard(c: FsrsCard): SrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as SrsState['state'],
    lastReview: c.last_review ? c.last_review.getTime() : null,
  };
}

export const GRADES: Grade[] = [1, 2, 3, 4];
export const GRADE_LABELS: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

/** Apply a review and return the next scheduling state. */
export function schedule(s: SrsState, grade: Grade, now = Date.now(), retention = 0.9): SrsState {
  const result = scheduler(retention).next(toFsrsCard(s), new Date(now), grade as unknown as FsrsGrade);
  return fromFsrsCard(result.card);
}

export interface IntervalPreview {
  grade: Grade;
  due: number;
  intervalMs: number;
}

/** Predict the next due time for each grade without mutating anything. */
export function previewIntervals(s: SrsState, now = Date.now(), retention = 0.9): Record<Grade, IntervalPreview> {
  const out = {} as Record<Grade, IntervalPreview>;
  for (const g of GRADES) {
    const next = schedule(s, g, now, retention);
    out[g] = { grade: g, due: next.due, intervalMs: Math.max(0, next.due - now) };
  }
  return out;
}

/** Probability (0..1) that the card is currently remembered. */
export function retrievability(s: SrsState, now = Date.now()): number {
  if (s.reps === 0) return 0;
  const r = scheduler().retrievability(toFsrsCard(s), new Date(now));
  return Number.isFinite(r) ? r : 0;
}

export type MasteryLevel = 'new' | 'learning' | 'familiar' | 'mastered';

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: 'New',
  learning: 'Learning',
  familiar: 'Familiar',
  mastered: 'Mastered',
};

/**
 * Mastery buckets (documented on the Statistics page):
 *  - new:      never reviewed with spaced repetition
 *  - learning: in (re)learning steps, or memory stability < 7 days
 *  - familiar: in review with stability between 7 and 21 days
 *  - mastered: in review with stability of at least 21 days
 */
export function masteryLevel(s: SrsState): MasteryLevel {
  if (s.reps === 0 || s.state === State.New) return 'new';
  if (s.state === State.Learning || s.state === State.Relearning) return 'learning';
  if (s.stability >= 21) return 'mastered';
  if (s.stability >= 7) return 'familiar';
  return 'learning';
}

export function isDue(s: SrsState, now = Date.now()): boolean {
  return s.due <= now;
}

export { Rating, State };
