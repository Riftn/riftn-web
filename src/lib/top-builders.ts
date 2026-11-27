/**
 * Top builders on the Requests board.
 *
 * Points:
 *   +10 for each of your requests that shipped
 *   +1  for each upvote your requests received
 *   +2  for each comment on someone else's request (counts up to 20 comments)
 *
 * Team accounts are left out so the board shows the community.
 * Everyone who has posted a request or commented on someone else's is listed,
 * even with 0 points for the period, so the full list is always there.
 * "This month" counts ships by the day they shipped, upvotes on requests
 * posted this month, and comments written this month.
 */

import { ASSISTANT_ADDRESS } from './assistant';

export const SHIPPED_POINTS = 10;
export const VOTE_POINTS = 1;
export const COMMENT_POINTS = 2;
export const COMMENT_CAP = 20;

/** Team accounts that never appear on the board. */
const TEAM_ACCOUNTS = new Set([
  ASSISTANT_ADDRESS,
  '0xec4e2c7417f781b35d830671f013b3b91f29ba64',
  // Historical team activity also uses these identifiers.
  '0x9324840523a5d17dd12a2f11a9472e5a199c1937',
  '0x18b2a58c33ba8fc924c1e6baaba8b22ad788727b',
  'maldoteth',
]);

export interface BuilderRequestRow {
  id: string;
  author_wallet_address: string;
  status: string;
  vote_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface BuilderCommentRow {
  wallet_address: string;
  feature_request_id: string;
  created_at: string;
}

export interface BuilderProfile {
  address: string;
  username?: string | null;
  avatarImageUrl?: string | null;
}

export interface TopBuilder {
  wallet: string;
  username: string | null;
  avatar: string | null;
  shipped: number;
  votes: number;
  comments: number;
  shippedPoints: number;
  votePoints: number;
  commentPoints: number;
  points: number;
  lastShippedAt: string | null;
}

export type BuilderPeriod = 'month' | 'all';

const SHIPPED = new Set(['shipped', 'completed']);
const BUILDER_PAGE_SIZE = 1000;

/** Read past the API row limit in primary-key order. */
export async function fetchBuilderRows<T extends { id: string }>(
  fetchPage: (limit: number, afterId: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  let afterId: string | null = null;
  while (true) {
    const { data, error } = await fetchPage(BUILDER_PAGE_SIZE, afterId);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < BUILDER_PAGE_SIZE) return rows;
    afterId = page[page.length - 1].id;
  }
}

export function periodStart(period: BuilderPeriod, now: Date = new Date()): number {
  if (period === 'all') return 0;
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

export function rankBuilders(
  requests: BuilderRequestRow[],
  comments: BuilderCommentRow[],
  since: number,
  profiles: BuilderProfile[],
): TopBuilder[] {
  // Historical activity determines points. Only the profile owned by the
  // same wallet can supply a handle and avatar.
  const profilesByWallet = new Map(profiles.map(profile => [profile.address.toLowerCase(), profile]));
  const map = new Map<string, TopBuilder>();
  const get = (wallet: string) => {
    let b = map.get(wallet);
    if (!b) {
      const profile = profilesByWallet.get(wallet);
      b = {
        wallet,
        username: profile?.username || null,
        avatar: profile?.avatarImageUrl || null,
        shipped: 0, votes: 0, comments: 0,
        shippedPoints: 0, votePoints: 0, commentPoints: 0, points: 0,
        lastShippedAt: null,
      };
      map.set(wallet, b);
    }
    return b;
  };

  const authorOf = new Map<string, string>();
  for (const r of requests) {
    if (!r.author_wallet_address) continue;
    const wallet = r.author_wallet_address.toLowerCase();
    authorOf.set(r.id, wallet);
    if (TEAM_ACCOUNTS.has(wallet)) continue;
    const b = get(wallet);
    if (SHIPPED.has(r.status) && Date.parse(r.updated_at) >= since) {
      b.shipped += 1;
      if (!b.lastShippedAt || r.updated_at > b.lastShippedAt) b.lastShippedAt = r.updated_at;
    }
    if (Date.parse(r.created_at) >= since) b.votes += Math.max(0, r.vote_count ?? 0);
  }

  for (const c of comments) {
    if (!c.wallet_address) continue;
    const wallet = c.wallet_address.toLowerCase();
    if (TEAM_ACCOUNTS.has(wallet)) continue;
    const author = authorOf.get(c.feature_request_id);
    if (!author || author === wallet) continue;
    const b = get(wallet);
    if (Date.parse(c.created_at) >= since) b.comments += 1;
  }

  const out: TopBuilder[] = [];
  for (const b of map.values()) {
    b.shippedPoints = b.shipped * SHIPPED_POINTS;
    b.votePoints = b.votes * VOTE_POINTS;
    b.commentPoints = Math.min(b.comments, COMMENT_CAP) * COMMENT_POINTS;
    b.points = b.shippedPoints + b.votePoints + b.commentPoints;
    out.push(b);
  }
  out.sort((a, b) =>
    b.points - a.points
    || (b.lastShippedAt ?? '').localeCompare(a.lastShippedAt ?? '')
    || (a.username ?? a.wallet).localeCompare(b.username ?? b.wallet));
  return out;
}
