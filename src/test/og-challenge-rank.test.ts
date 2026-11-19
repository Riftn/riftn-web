import { describe, expect, it } from 'vitest';
import { rankOgHolders } from '@/lib/og-challenge-rank';

describe('rankOgHolders', () => {
  it('counts invited accounts that hold DHB, once each, ranked by count then DHB', () => {
    const ranked = rankOgHolders(
      [
        { owner_address: '0xA', referred_address: '0x1' },
        { owner_address: '0xa', referred_address: '0x2' },
        { owner_address: '0xB', referred_address: '0x3' },
        { owner_address: '0xB', referred_address: '0x4' },
        { owner_address: '0xC', referred_address: '0x1' }, // already credited to A
        { owner_address: '0xC', referred_address: '0x5' }, // dust
        { owner_address: '0xD', referred_address: '0xD' }, // self
      ],
      [
        { account: '0x1', total: 100 },
        { account: '0x2', total: null }, // hidden balance still counts
        { account: '0x3', total: 50 },
        { account: '0x4', total: 5000 },
        { account: '0x5', total: 0.5 },
        { account: '0xd', total: 999 },
      ],
    );
    expect(ranked).toEqual([
      { account: '0xb', count: 2, dhb: 5050 },
      { account: '0xa', count: 2, dhb: 100 },
    ]);
  });
});
