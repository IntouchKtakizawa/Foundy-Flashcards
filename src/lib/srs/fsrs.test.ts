import { describe, expect, it } from 'vitest';
import { masteryLevel, newSrsState, previewIntervals, schedule } from './fsrs';

const DAY = 86_400_000;

describe('FSRS scheduling', () => {
  it('creates new cards that are due immediately', () => {
    const now = Date.UTC(2026, 0, 1);
    const s = newSrsState(now);
    expect(s.state).toBe(0);
    expect(s.reps).toBe(0);
    expect(s.due).toBe(now);
    expect(masteryLevel(s)).toBe('new');
  });

  it('orders intervals Again < Hard < Good < Easy', () => {
    const now = Date.UTC(2026, 0, 1);
    const p = previewIntervals(newSrsState(now), now);
    expect(p[1].intervalMs).toBeLessThan(p[2].intervalMs);
    expect(p[2].intervalMs).toBeLessThan(p[3].intervalMs);
    expect(p[3].intervalMs).toBeLessThan(p[4].intervalMs);
  });

  it('grows intervals with successful reviews and records state', () => {
    let now = Date.UTC(2026, 0, 1);
    let s = schedule(newSrsState(now), 4, now);
    expect(s.reps).toBe(1);
    expect(s.state).toBe(2);
    expect(s.lastReview).toBe(now);
    let prevInterval = s.due - now;
    for (let i = 0; i < 4; i++) {
      now = s.due;
      s = schedule(s, 3, now);
      const interval = s.due - now;
      expect(interval).toBeGreaterThan(prevInterval * 0.9);
      prevInterval = interval;
    }
    expect(s.stability).toBeGreaterThan(21);
    expect(masteryLevel(s)).toBe('mastered');
  });

  it('counts lapses and relearns after Again on a review card', () => {
    let now = Date.UTC(2026, 0, 1);
    let s = schedule(newSrsState(now), 4, now);
    now = s.due + DAY;
    s = schedule(s, 1, now);
    expect(s.lapses).toBe(1);
    expect(s.state).toBe(3);
    expect(s.due - now).toBeLessThan(DAY);
  });

  it('higher desired retention schedules sooner', () => {
    const now = Date.UTC(2026, 0, 1);
    const reviewed = schedule(newSrsState(now), 3, now);
    const later = reviewed.due + DAY;
    const low = schedule(reviewed, 3, later, 0.8);
    const high = schedule(reviewed, 3, later, 0.95);
    expect(high.due).toBeLessThan(low.due);
  });
});
