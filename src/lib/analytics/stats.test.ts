import { describe, expect, it } from 'vitest';
import { accuracy, computeStreak, dailyActivity, summariseCards, upcomingWorkload } from './stats';
import { newSrsState, schedule } from '@/lib/srs/fsrs';

const DAY = 86_400_000;
const noon = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();

describe('analytics', () => {
  it('computes current and longest streaks on local days', () => {
    const now = noon(2026, 5, 10);
    const reviews = [noon(2026, 5, 10), noon(2026, 5, 9), noon(2026, 5, 8), noon(2026, 5, 1), noon(2026, 5, 2), noon(2026, 5, 3), noon(2026, 5, 4)].map((reviewedAt) => ({ reviewedAt }));
    expect(computeStreak(reviews, now)).toEqual({ current: 3, longest: 4, studiedToday: true });
  });

  it('keeps the streak alive until the end of today', () => {
    const now = noon(2026, 5, 10);
    const s = computeStreak([{ reviewedAt: noon(2026, 5, 9) }], now);
    expect(s).toMatchObject({ current: 1, studiedToday: false });
  });

  it('calculates accuracy from real reviews only', () => {
    expect(accuracy([])).toBeNull();
    expect(accuracy([{ correct: true }, { correct: false }, { correct: true }, { correct: true }])).toBe(75);
  });

  it('buckets daily activity', () => {
    const now = noon(2026, 5, 10);
    const days = dailyActivity([{ reviewedAt: now, correct: true, durationMs: 1000 }, { reviewedAt: now - DAY, correct: false, durationMs: 500 }], 7, now);
    expect(days).toHaveLength(7);
    expect(days[6]).toMatchObject({ reviews: 1, correct: 1, accuracy: 100 });
    expect(days[5]).toMatchObject({ reviews: 1, accuracy: 0 });
  });

  it('summarises decks and workload', () => {
    const now = noon(2026, 5, 10);
    const fresh = newSrsState(now);
    const reviewed = schedule(fresh, 3, now - 10 * DAY);
    const cards = [
      { srs: fresh, due: fresh.due, flagged: 0 as const },
      { srs: reviewed, due: reviewed.due, flagged: 1 as const },
    ];
    const s = summariseCards(cards, now);
    expect(s).toMatchObject({ total: 2, newCount: 1, due: 1, flagged: 1, progressPct: 50 });
    expect(upcomingWorkload(cards, 3, now)[0].count).toBe(1);
  });
});
