import { describe, expect, it } from 'vitest';
import { rankNewMessageSuggestions } from './new-message-suggestions';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();

describe('rankNewMessageSuggestions', () => {
  const following = [
    { address: '0xOld', followedAt: daysAgo(400), followers: 10 },
    { address: '0xBig', followedAt: daysAgo(200), followers: 90000 },
    { address: '0xNew2', followedAt: daysAgo(2), followers: 5 },
    { address: '0xMid', followedAt: daysAgo(300), followers: 1200 },
    { address: '0xNew1', followedAt: daysAgo(0.1), followers: 1 },
    { address: '0xBlocked', followedAt: daysAgo(1), followers: 999999 },
  ];
  const messaged = [{ address: '0xChat' }, { address: '0xmid' }];

  it('puts newest follows first, then chats, then most followers', () => {
    const out = rankNewMessageSuggestions({ following, messaged, blocked: ['0xblocked'], now: NOW });
    expect(out.map((u) => u.address)).toEqual(['0xNew1', '0xNew2', '0xChat', '0xmid', '0xBig', '0xOld']);
  });

  it('skips me, the Recent faces row and duplicates, and stops at the limit', () => {
    const out = rankNewMessageSuggestions({
      following,
      messaged,
      me: '0xnew1',
      exclude: ['0xchat'],
      limit: 3,
      now: NOW,
    });
    expect(out.map((u) => u.address)).toEqual(['0xBlocked', '0xNew2', '0xmid']);
  });

  it('caps the newest-follows block at 5 so a follow spree leaves room for others', () => {
    const spree = Array.from({ length: 8 }, (_, i) => ({ address: `0xS${i}`, followedAt: daysAgo(i * 0.1 + 0.01), followers: 0 }));
    const out = rankNewMessageSuggestions({
      following: [...spree, { address: '0xStar', followedAt: daysAgo(90), followers: 50000 }],
      messaged: [],
      now: NOW,
    });
    expect(out.slice(0, 6).map((u) => u.address)).toEqual(['0xS0', '0xS1', '0xS2', '0xS3', '0xS4', '0xStar']);
  });
});
