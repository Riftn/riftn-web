import { describe, expect, it } from 'vitest';
import { periodLabels, uses12Hour, wheelColumns, wheelIndexes, wheelLabels, wheelMinutes } from './clockWheel';

describe('clockWheel', () => {
  it('knows 12-hour from 24-hour clocks', () => {
    expect(uses12Hour('en-US')).toBe(true);
    expect(uses12Hour('tr')).toBe(false);
    expect(uses12Hour('de')).toBe(false);
  });

  it('builds the columns', () => {
    const us = wheelColumns('en-US');
    expect(us.hours[0]).toBe('12');
    expect(us.hours).toHaveLength(12);
    expect(us.minutes).toHaveLength(12);
    expect(us.periods).toEqual(['AM', 'PM']);
    const tr = wheelColumns('tr');
    expect(tr.hours).toHaveLength(24);
    expect(tr.hours[7]).toBe('07');
    expect(tr.periods).toBeNull();
  });

  it('round-trips times both ways', () => {
    for (const twelve of [true, false]) {
      for (const total of [0, 5, 11 * 60 + 55, 12 * 60, 12 * 60 + 30, 19 * 60 + 30, 23 * 60 + 55]) {
        expect(wheelMinutes(wheelIndexes(total, twelve), twelve)).toBe(total);
      }
    }
  });

  it('puts midnight and noon on 12', () => {
    expect(wheelIndexes(0, true)).toEqual({ hour: 0, minute: 0, period: 0 });
    expect(wheelIndexes(12 * 60, true)).toEqual({ hour: 0, minute: 0, period: 1 });
  });

  it('rounds odd minutes to the nearest mark', () => {
    expect(wheelIndexes(8 * 60 + 7, false).minute).toBe(1);
    expect(wheelIndexes(8 * 60 + 58, false).minute).toBe(11);
  });

  it('has local period words', () => {
    expect(periodLabels('en-US')).toEqual(['AM', 'PM']);
  });
});

describe('wheelLabels', () => {
  it('names the wheels in the reader language', () => {
    expect(wheelLabels('en').hour).toBe('Hour');
    expect(wheelLabels('de').hour).toBe('Stunde');
  });
});
