import { describe, it, expect } from 'vitest';
import { earlyAccessOpen, earlyAccessHoursLeft, posterFilter, type EarlyAccessRow } from './early-access';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const OPEN_BY = '2026-11-25T00:00:00Z';
const row = (over: Partial<EarlyAccessRow> = {}): EarlyAccessRow => ({
  id: 'r1',
  author_wallet_address: '0xd0d15539ab287d64af4cec5f463145cf85ab4e95',
  author_username: 'c0chraniz3r',
  status: 'shipped',
  early_access_until: '2026-11-24T00:00:00Z',
  ...over,
});
const poster = { wallet: '0xD0D15539AB287D64AF4CEC5F463145CF85AB4E95' };
const someone = { wallet: '0x1111111111111111111111111111111111111111' };

describe('earlyAccessOpen', () => {
  it('shows the poster during the head start and hides it from others', () => {
    expect(earlyAccessOpen(row(), poster, OPEN_BY, NOW)).toBe(true);
    expect(earlyAccessOpen(row(), someone, OPEN_BY, NOW)).toBe(false);
    expect(earlyAccessOpen(row(), {}, OPEN_BY, NOW)).toBe(false);
  });
  it('lets the owners test it', () => {
    expect(earlyAccessOpen(row(), { ...someone, isOwner: true }, OPEN_BY, NOW)).toBe(true);
  });
  it('opens for everyone once the head start ends', () => {
    expect(earlyAccessOpen(row(), someone, OPEN_BY, Date.parse('2026-11-24T00:00:01Z'))).toBe(true);
  });
  it('is for everyone when it shipped with no head start', () => {
    expect(earlyAccessOpen(row({ early_access_until: null }), someone, OPEN_BY, NOW)).toBe(true);
  });
  it('waits for Shipped, but never past openBy', () => {
    const queued = row({ status: 'in_progress', early_access_until: null });
    expect(earlyAccessOpen(queued, someone, OPEN_BY, NOW)).toBe(false);
    expect(earlyAccessOpen(queued, poster, OPEN_BY, NOW)).toBe(true);
    expect(earlyAccessOpen(queued, someone, OPEN_BY, Date.parse(OPEN_BY))).toBe(true);
  });
  it('hides while loading and fails open on a missing row', () => {
    expect(earlyAccessOpen(undefined, someone, OPEN_BY, NOW)).toBe(false);
    expect(earlyAccessOpen(null, someone, OPEN_BY, NOW)).toBe(true);
  });
  it('matches old rows saved under a username', () => {
    const old = row({ author_wallet_address: 'maldoteth' });
    expect(earlyAccessOpen(old, { username: '@MaldotEth' }, OPEN_BY, NOW)).toBe(true);
  });
});

describe('earlyAccessHoursLeft', () => {
  it('rounds up and ends at null', () => {
    expect(earlyAccessHoursLeft('2026-11-24T00:00:00Z', NOW)).toBe(12);
    expect(earlyAccessHoursLeft('2026-11-23T12:00:30Z', NOW)).toBe(1);
    expect(earlyAccessHoursLeft('2026-11-23T11:00:00Z', NOW)).toBe(null);
    expect(earlyAccessHoursLeft(null, NOW)).toBe(null);
  });
});

describe('posterFilter', () => {
  it('matches wallet and a plain username, never wildcards', () => {
    expect(posterFilter('0xD0D15539AB287D64AF4CEC5F463145CF85AB4E95', '@Maldoteth'))
      .toBe('author_wallet_address.ilike.0xd0d15539ab287d64af4cec5f463145cf85ab4e95,author_wallet_address.ilike.maldoteth');
    expect(posterFilter('0xd0d15539ab287d64af4cec5f463145cf85ab4e95', 'a_b')).toBe('author_wallet_address.ilike.0xd0d15539ab287d64af4cec5f463145cf85ab4e95');
    expect(posterFilter('not-a-wallet')).toBe(null);
  });
});
