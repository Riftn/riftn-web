import { afterEach, describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { applyDateLocale, formatMessageTime, formatRelativeTime } from './date-locale';

afterEach(() => applyDateLocale('en'));
describe('selected-language dates', () => {
  it('keeps Turkish conversation timestamps working without RelativeTimeFormat', () => {
    const original = Intl.RelativeTimeFormat;
    try {
      Object.defineProperty(Intl, 'RelativeTimeFormat', { configurable: true, writable: true, value: undefined });
      expect(formatRelativeTime(Date.now() - 120000, 'tr-TR')).toBe('2 dakika önce');
      expect(formatRelativeTime(null, 'fr')).toBeTruthy();
      expect(formatRelativeTime(Date.now() - 120000, 'unknown')).toBe('2 minutes ago');
    } finally {
      Object.defineProperty(Intl, 'RelativeTimeFormat', { configurable: true, writable: true, value: original });
    }
  });
  it('formats month names using the selected app language', () => {
    applyDateLocale('fr'); expect(format(new Date(2026, 0, 3), 'MMMM')).toBe('janvier');
    applyDateLocale('tr'); expect(format(new Date(2026, 0, 3), 'MMMM')).toBe('Ocak');
  });
  it('localizes relative time and invalid dates without English fallbacks', () => {
    expect(formatRelativeTime(Date.now() - 120000, 'es')).toBe('hace 2 minutos');
    expect(formatRelativeTime(null, 'fr')).toBe('maintenant');
    expect(formatRelativeTime(Date.now() - 120000, 'ar')).toMatch(/[\u0600-\u06ff]/);
  });
});

describe('message clock', () => {
  it.each([[0, 0, '00:00'], [1, 34, '01:34'], [13, 34, '13:34'], [23, 59, '23:59']])(
    'uses a 24-hour clock where the region does, even in English, for %i:%i',
    (hour, minute, expected) => {
      expect(formatMessageTime(new Date(2026, 0, 1, hour, minute), 'en-US', true)).toBe(expected);
    }
  );

  it('uses a 12-hour clock where the region does', () => {
    expect(formatMessageTime(new Date(2026, 0, 1, 16, 57), 'en-US', false)).toBe('4:57 PM');
    expect(formatMessageTime(new Date(2026, 0, 1, 0, 5), 'en-US', false)).toBe('12:05 AM');
  });
});
