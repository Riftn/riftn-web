import { describe, it, expect } from 'vitest';
import { messageTime, onTranslateUp, queueTranslation, requestTranslateUp, TRANSLATE_UP_CONCURRENCY } from './use-translate-up';

describe('requestTranslateUp', () => {
  it('asks every earlier message in the scope, nearest first, and skips the tapped one', async () => {
    const ran: string[] = [];
    const offs = [
      ['a', 1000, 'dm'], ['b', 2000, 'dm'], ['c', 3000, 'dm'], ['d', 4000, 'dm'], ['e', 1500, 'room'],
    ].map(([id, at, scope]) => onTranslateUp((req) =>
      req.scope === scope && req.excludeId !== id && (at as number) <= req.upTo
        ? { at: at as number, run: () => { ran.push(id as string); } }
        : null));
    const joined = requestTranslateUp({ scope: 'dm', upTo: 3000, excludeId: 'c' });
    await new Promise((r) => setTimeout(r, 0));
    expect(joined).toBe(2);
    expect(ran).toEqual(['b', 'a']);
    offs.forEach((off) => off());
  });
});

describe('queueTranslation', () => {
  it('keeps only a few translations in flight at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const task = () => new Promise<void>((resolve) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      setTimeout(() => { inFlight -= 1; resolve(); }, 5);
    });
    await Promise.all(Array.from({ length: 10 }, () => queueTranslation(task)));
    expect(peak).toBe(TRANSLATE_UP_CONCURRENCY);
    expect(inFlight).toBe(0);
  });
});

describe('messageTime', () => {
  it('reads ISO strings, dates and numbers, and 0 for anything else', () => {
    expect(messageTime('2026-11-18T10:00:00Z')).toBe(Date.parse('2026-11-18T10:00:00Z'));
    expect(messageTime(new Date(5))).toBe(5);
    expect(messageTime(42)).toBe(42);
    expect(messageTime('nope')).toBe(0);
    expect(messageTime(undefined)).toBe(0);
  });
});
