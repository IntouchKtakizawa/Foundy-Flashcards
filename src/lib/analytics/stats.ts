import { masteryLevel, type MasteryLevel } from '@/lib/srs/fsrs';
import { DAY_MS, dayKey, pct, startOfDay } from '@/lib/utils';
import type { Flashcard, ReviewLog, StudySession } from '@/types';

/**
 * Pure analytics over locally stored study history. Every number shown in
 * the app comes from these functions — there is no sample or fake data.
 *
 * Definitions (also explained in the UI):
 *  - Accuracy: correct answers ÷ all answers. In spaced repetition, "Again"
 *    counts as incorrect and Hard/Good/Easy as correct.
 *  - Mastery: share of cards whose FSRS memory stability is ≥ 21 days.
 *  - Streak: consecutive local calendar days with at least one review.
 */

export interface DayActivity {
  key: string;
  date: number;
  label: string;
  reviews: number;
  correct: number;
  accuracy: number | null;
  timeMs: number;
}

export function dailyActivity(reviews: Pick<ReviewLog, 'reviewedAt' | 'correct' | 'durationMs'>[], days: number, now = Date.now()): DayActivity[] {
  const today = startOfDay(now);
  const buckets = new Map<string, DayActivity>();
  const out: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = startOfDay(today - i * DAY_MS + DAY_MS / 2); // DST-safe
    const key = dayKey(date);
    const entry: DayActivity = {
      key,
      date,
      label: new Date(date).toLocaleDateString(undefined, days <= 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }),
      reviews: 0,
      correct: 0,
      accuracy: null,
      timeMs: 0,
    };
    buckets.set(key, entry);
    out.push(entry);
  }
  for (const r of reviews) {
    const b = buckets.get(dayKey(r.reviewedAt));
    if (!b) continue;
    b.reviews++;
    if (r.correct) b.correct++;
    b.timeMs += Math.min(r.durationMs || 0, 5 * 60 * 1000); // cap idle time per card
  }
  for (const b of out) b.accuracy = b.reviews ? pct(b.correct, b.reviews) : null;
  return out;
}

export interface PeriodActivity {
  label: string;
  reviews: number;
  correct: number;
  accuracy: number | null;
}

/** Group reviews into the last `weeks` calendar weeks (Monday start). */
export function weeklyActivity(reviews: Pick<ReviewLog, 'reviewedAt' | 'correct'>[], weeks: number, now = Date.now()): PeriodActivity[] {
  const d = new Date(startOfDay(now));
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  const thisMonday = startOfDay(d.getTime() - dow * DAY_MS + DAY_MS / 2);
  const out: Array<PeriodActivity & { start: number; end: number }> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = startOfDay(thisMonday - i * 7 * DAY_MS + DAY_MS / 2);
    const end = startOfDay(start + 7 * DAY_MS + DAY_MS / 2);
    out.push({
      start,
      end,
      label: new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      reviews: 0,
      correct: 0,
      accuracy: null,
    });
  }
  for (const r of reviews) {
    const w = out.find((x) => r.reviewedAt >= x.start && r.reviewedAt < x.end);
    if (!w) continue;
    w.reviews++;
    if (r.correct) w.correct++;
  }
  return out.map(({ start: _s, end: _e, ...rest }) => ({ ...rest, accuracy: rest.reviews ? pct(rest.correct, rest.reviews) : null }));
}

export function monthlyActivity(reviews: Pick<ReviewLog, 'reviewedAt' | 'correct'>[], months: number, now = Date.now()): PeriodActivity[] {
  const base = new Date(now);
  const out: Array<PeriodActivity & { y: number; m: number }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), reviews: 0, correct: 0, accuracy: null });
  }
  for (const r of reviews) {
    const d = new Date(r.reviewedAt);
    const b = out.find((x) => x.y === d.getFullYear() && x.m === d.getMonth());
    if (!b) continue;
    b.reviews++;
    if (r.correct) b.correct++;
  }
  return out.map(({ y: _y, m: _m, ...rest }) => ({ ...rest, accuracy: rest.reviews ? pct(rest.correct, rest.reviews) : null }));
}

export interface Streak {
  current: number;
  longest: number;
  studiedToday: boolean;
}

export function computeStreak(reviews: Pick<ReviewLog, 'reviewedAt'>[], now = Date.now()): Streak {
  if (!reviews.length) return { current: 0, longest: 0, studiedToday: false };
  const days = new Set(reviews.map((r) => dayKey(r.reviewedAt)));
  const todayKey = dayKey(now);
  const studiedToday = days.has(todayKey);

  // Current streak: count back from today (or yesterday if not studied yet today).
  let current = 0;
  let cursor = startOfDay(now);
  if (!studiedToday) cursor = startOfDay(cursor - DAY_MS / 2);
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = startOfDay(cursor - DAY_MS / 2);
  }

  // Longest streak over all history.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of sorted) {
    const [y, m, d] = k.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    if (prev !== null && Math.round((t - prev) / DAY_MS) === 1) run++;
    else run = 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  return { current, longest: Math.max(longest, current), studiedToday };
}

export function accuracy(reviews: Pick<ReviewLog, 'correct'>[]): number | null {
  if (!reviews.length) return null;
  return pct(reviews.filter((r) => r.correct).length, reviews.length);
}

export type MasteryDistribution = Record<MasteryLevel, number>;

export function masteryDistribution(cards: Pick<Flashcard, 'srs'>[]): MasteryDistribution {
  const dist: MasteryDistribution = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  for (const c of cards) dist[masteryLevel(c.srs)]++;
  return dist;
}

export interface DeckSummary {
  total: number;
  due: number;
  newCount: number;
  mastered: number;
  masteryPct: number;
  /** Share of cards reviewed at least once with spaced repetition. */
  progressPct: number;
  flagged: number;
}

export function summariseCards(cards: Pick<Flashcard, 'srs' | 'due' | 'flagged'>[], now = Date.now()): DeckSummary {
  let due = 0;
  let mastered = 0;
  let newCount = 0;
  let flagged = 0;
  for (const c of cards) {
    const level = masteryLevel(c.srs);
    if (level === 'mastered') mastered++;
    if (level === 'new') newCount++;
    else if (c.due <= now) due++;
    if (c.flagged) flagged++;
  }
  const total = cards.length;
  return {
    total,
    due,
    newCount,
    mastered,
    masteryPct: pct(mastered, total),
    progressPct: pct(total - newCount, total),
    flagged,
  };
}

export interface WorkloadDay {
  key: string;
  label: string;
  count: number;
}

/** Reviews due per day for the next `days` days (overdue cards land on today). */
export function upcomingWorkload(cards: Pick<Flashcard, 'due' | 'srs'>[], days: number, now = Date.now()): WorkloadDay[] {
  const today = startOfDay(now);
  const out: WorkloadDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = startOfDay(today + i * DAY_MS + DAY_MS / 2);
    out.push({
      key: dayKey(date),
      label: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : new Date(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
      count: 0,
    });
  }
  const index = new Map(out.map((d, i) => [d.key, i]));
  for (const c of cards) {
    if (c.srs.reps === 0) continue; // new cards are not "due" reviews
    const i = c.due <= now ? 0 : index.get(dayKey(c.due));
    if (i !== undefined) out[i].count++;
  }
  return out;
}

export interface DifficultCard {
  card: Flashcard;
  attempts: number;
  incorrect: number;
  accuracy: number;
  score: number;
}

/**
 * Cards the learner struggles with: weighted by lapses, FSRS difficulty and
 * the recent incorrect rate across every study mode.
 */
export function difficultCards(cards: Flashcard[], reviews: Pick<ReviewLog, 'cardId' | 'correct'>[], limit = 10): DifficultCard[] {
  const per = new Map<string, { attempts: number; incorrect: number }>();
  for (const r of reviews) {
    const p = per.get(r.cardId) ?? { attempts: 0, incorrect: 0 };
    p.attempts++;
    if (!r.correct) p.incorrect++;
    per.set(r.cardId, p);
  }
  return cards
    .map((card) => {
      const p = per.get(card.id) ?? { attempts: 0, incorrect: 0 };
      const missRate = p.attempts ? p.incorrect / p.attempts : 0;
      const score = card.srs.lapses * 2 + (card.srs.reps ? card.srs.difficulty / 2 : 0) + missRate * 5 + p.incorrect;
      return { card, attempts: p.attempts, incorrect: p.incorrect, accuracy: p.attempts ? pct(p.attempts - p.incorrect, p.attempts) : 0, score };
    })
    .filter((d) => d.incorrect > 0 || d.card.srs.lapses > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function totalStudyTime(sessions: Pick<StudySession, 'durationMs'>[]): number {
  return sessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
}

/** Last ~N weeks laid out for a GitHub-style calendar heatmap. */
export function calendarHeatmap(reviews: Pick<ReviewLog, 'reviewedAt' | 'correct' | 'durationMs'>[], weeks: number, now = Date.now()) {
  const d = new Date(startOfDay(now));
  const dow = (d.getDay() + 6) % 7;
  const totalDays = (weeks - 1) * 7 + dow + 1;
  const days = dailyActivity(reviews, totalDays, now);
  const max = Math.max(1, ...days.map((x) => x.reviews));
  const columns: Array<Array<DayActivity & { level: 0 | 1 | 2 | 3 | 4 }>> = [];
  days.forEach((day, i) => {
    const col = Math.floor(i / 7);
    if (!columns[col]) columns[col] = [];
    const ratio = day.reviews / max;
    const level = day.reviews === 0 ? 0 : ratio < 0.25 ? 1 : ratio < 0.5 ? 2 : ratio < 0.75 ? 3 : 4;
    columns[col].push({ ...day, level });
  });
  return { columns, max };
}
