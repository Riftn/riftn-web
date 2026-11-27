import { describe, expect, it } from 'vitest';
import { parseWhen } from './parseWhen';
import { localWhenPlaceholder, toEnglishWhen } from './localWhen';

const now = new Date(2026, 10, 19, 10, 0); // Thu 19 Nov 2026, 10:00

describe('When box in the reader\'s language', () => {
  it('reads Turkish days, months, tomorrow and "in N hours"', () => {
    expect(parseWhen(toEnglishWhen('cuma 20:00', 'tr'), now)?.at).toEqual(new Date(2026, 10, 20, 20, 0));
    expect(parseWhen(toEnglishWhen('yarın 9:00', 'tr'), now)?.at).toEqual(new Date(2026, 10, 20, 9, 0));
    expect(parseWhen(toEnglishWhen('25 kasım 18:30', 'tr'), now)?.at).toEqual(new Date(2026, 10, 25, 18, 30));
    expect(parseWhen(toEnglishWhen('2 saat sonra', 'tr'), now)?.at).toEqual(new Date(2026, 10, 19, 12, 0));
  });

  it('reads German and Russian too, and leaves English alone', () => {
    expect(toEnglishWhen('in 2 Stunden', 'de')).toBe('in 2 hours');
    expect(toEnglishWhen('через 3 часа', 'ru')).toBe('in 3 hours');
    expect(toEnglishWhen('fri 8pm', 'en')).toBe('fri 8pm');
  });

  it('swaps the placeholder examples into the reader\'s language', () => {
    const tr = localWhenPlaceholder('Bir zaman yaz, örneğin "fri 8pm" veya "in 2 hours"', 'tr');
    expect(tr).not.toContain('fri 8pm');
    expect(tr).toContain('saat sonra');
    expect(localWhenPlaceholder('Type a time, like "fri 8pm"', 'en')).toBe('Type a time, like "fri 8pm"');
  });
});
