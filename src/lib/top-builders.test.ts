import { describe, it, expect } from 'vitest';
import { rankBuilders, periodStart, type BuilderRequestRow, type BuilderCommentRow } from './top-builders';

const profiles = [
  { address: '0xa', username: 'ann' },
  { address: '0xb', username: 'bob' },
  { address: '0xc', username: 'cat' },
];

const req = (id: string, wallet: string, status: string, votes: number, created: string, updated = created): BuilderRequestRow => ({
  id, author_wallet_address: wallet,
  status, vote_count: votes, created_at: created, updated_at: updated,
});

describe('rankBuilders', () => {
  it('scores ships, upvotes and comments on other people\'s requests', () => {
    const requests = [
      req('1', '0xa', 'shipped', 3, '2026-10-02T00:00:00Z'),
      req('2', '0xb', 'open', 1, '2026-10-03T00:00:00Z'),
    ];
    const comments: BuilderCommentRow[] = [
      { wallet_address: '0xB', feature_request_id: '1', created_at: '2026-10-04T00:00:00Z' },
      { wallet_address: '0xa', feature_request_id: '1', created_at: '2026-10-04T00:00:00Z' }, // own request: no points
    ];
    const [ann, bob] = rankBuilders(requests, comments, 0, profiles);
    expect(ann).toMatchObject({ username: 'ann', shipped: 1, votes: 3, comments: 0, points: 13 });
    expect(bob).toMatchObject({ username: 'bob', shipped: 0, votes: 1, comments: 1, points: 3 });
  });

  it('keeps scores and history on their wallets when two handles swap', () => {
    const createdAt = '2026-11-03T00:00:00Z';
    const requests = [
      {
        id: '1', author_wallet_address: '0xa', author_username: 'old', author_avatar: 'old-avatar',
        status: 'shipped', vote_count: 6, created_at: createdAt, updated_at: createdAt,
      },
      {
        id: '2', author_wallet_address: '0xb', author_username: 'new', author_avatar: null,
        status: 'open', vote_count: 3, created_at: createdAt, updated_at: createdAt,
      },
    ];
    const comments = [
      { wallet_address: '0xA', username: 'old', feature_request_id: '2', created_at: createdAt },
      { wallet_address: '0xa', username: 'new', feature_request_id: '1', created_at: createdAt },
    ];
    const profiles = [
      { address: '0xB', username: 'old', avatarImageUrl: 'other-avatar' },
      { address: '0xA', username: 'new', avatarImageUrl: 'current-avatar' },
    ];

    for (const since of [0, periodStart('month', new Date('2026-11-26T12:00:00'))]) {
      const [original, other] = rankBuilders(requests, comments, since, profiles);
      expect(original).toMatchObject({
        wallet: '0xa', username: 'new', avatar: 'current-avatar', shipped: 1, votes: 6, comments: 1, points: 18,
      });
      expect(other).toMatchObject({ wallet: '0xb', username: 'old', avatar: 'other-avatar', points: 3 });
    }
    expect(rankBuilders(requests, comments, 0, [profiles[0]])[0]).toMatchObject({
      wallet: '0xa', username: null, avatar: null, points: 18,
    });
  });

  it('leaves team accounts out and caps comment points', () => {
    const requests = [req('1', '0x9324840523a5d17dd12a2f11a9472e5a199c1937', 'shipped', 50, '2026-10-01T00:00:00Z')];
    const comments = Array.from({ length: 30 }, () => ({ wallet_address: '0xc', feature_request_id: '1', created_at: '2026-10-05T00:00:00Z' }));
    const out = rankBuilders(requests, comments, 0, profiles);
    expect(out.map((b) => b.username)).toEqual(['cat']);
    expect(out[0].commentPoints).toBe(40);
  });

  it('this month counts ships by ship day', () => {
    const since = periodStart('month', new Date('2026-11-15T12:00:00'));
    const requests = [req('1', '0xa', 'shipped', 0, '2026-09-01T00:00:00Z', '2026-11-03T00:00:00Z')];
    expect(rankBuilders(requests, [], since, profiles)[0].points).toBe(10);
    expect(rankBuilders(requests, [], periodStart('month', new Date('2026-12-15T12:00:00')), profiles)).toMatchObject([{ username: 'ann', points: 0 }]);
  });

  it('keeps everyone on the list even with 0 points this period', () => {
    const since = periodStart('month', new Date('2026-11-15T12:00:00'));
    const requests = [
      req('1', '0xa', 'open', 4, '2026-11-02T00:00:00Z'),
      req('2', '0xb', 'open', 9, '2026-08-01T00:00:00Z'),
    ];
    const comments: BuilderCommentRow[] = [
      { wallet_address: '0xc', feature_request_id: '1', created_at: '2026-07-01T00:00:00Z' },
    ];
    const out = rankBuilders(requests, comments, since, profiles);
    expect(out.map((b) => [b.username, b.points])).toEqual([['ann', 4], ['bob', 0], ['cat', 0]]);
  });
});
