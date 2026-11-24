import { describe, expect, it } from 'vitest';
import { dripTimes, gapLabel, isLater } from '../post-spacing';

const t = (_k: string, o?: Record<string, unknown>) => String(o?.defaultValue ?? '').replace('{{n}}', String(o?.n ?? ''));

describe('post spacing', () => {
  it('names the gaps', () => {
    expect(gapLabel(30, t)).toBe('30 min');
    expect(gapLabel(60, t)).toBe('1 hour');
    expect(gapLabel(180, t)).toBe('3 hours');
    expect(gapLabel(1440, t)).toBe('1 day');
  });

  it('drips 20 photos one a day from the start time', () => {
    const now = new Date('2026-11-24T15:00:00Z');
    const start = new Date('2026-11-24T18:00:00Z');
    const times = dripTimes(start, 20, 1440, now);
    expect(times).toHaveLength(20);
    expect(times[0]).toEqual(start);
    expect(times[1]).toEqual(new Date('2026-11-25T18:00:00Z'));
    expect(times[19]).toEqual(new Date('2026-12-13T18:00:00Z'));
  });

  it('starts now when the start has passed, and the first one posts now', () => {
    const now = new Date('2026-11-24T15:00:00Z');
    const times = dripTimes(new Date('2026-11-24T10:00:00Z'), 3, 60, now);
    expect(times.map(d => d.toISOString())).toEqual(['2026-11-24T15:00:00.000Z', '2026-11-24T16:00:00.000Z', '2026-11-24T17:00:00.000Z']);
    expect(isLater(times[0], now.getTime())).toBe(false);
    expect(isLater(times[1], now.getTime())).toBe(true);
  });
});
