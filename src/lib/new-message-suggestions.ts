/**
 * Order of the "Suggested" people in New message (phone drawer, mirrored in
 * the app's NewDMModal):
 *
 *   1. People you followed most recently, newest first (follows from the last
 *      30 days, at most 5, so a big follow spree never hides everyone else).
 *   2. People you have messaged, most recent chat first.
 *   3. Everyone else you follow, most followers first.
 *
 * Each person shows once, never you, never someone you blocked, and never
 * someone already shown as a face in the Recent row above the list.
 */

export interface SuggestionPerson {
  address?: string | null;
  /** When you followed them (ISO string or ms). Only on people from your following list. */
  followedAt?: string | number | Date | null;
  /** Their follower count (some older rows carry the follower list itself). */
  followers?: number | string | string[] | null;
}

export const RECENT_FOLLOW_DAYS = 30;
export const RECENT_FOLLOW_MAX = 5;
export const SUGGESTION_LIMIT = 12;

const keyOf = (u?: SuggestionPerson | null) => String(u?.address || '').trim().toLowerCase();

const timeOf = (v: SuggestionPerson['followedAt']) => {
  if (v == null || v === '') return NaN;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
};

const followerCount = (u: SuggestionPerson) => {
  if (Array.isArray(u.followers)) return u.followers.length;
  const n = Number(u.followers);
  return Number.isFinite(n) ? n : 0;
};

export function rankNewMessageSuggestions<T extends SuggestionPerson>(opts: {
  /** People you follow, any order. */
  following: T[];
  /** People you have chatted with, most recent chat first. */
  messaged: T[];
  me?: string | null;
  /** Addresses already shown elsewhere (the Recent faces row). */
  exclude?: Iterable<string>;
  /** Addresses you blocked. */
  blocked?: Iterable<string>;
  limit?: number;
  now?: number;
}): T[] {
  const { following, messaged, me, limit = SUGGESTION_LIMIT, now = Date.now() } = opts;
  const skip = new Set<string>();
  const meKey = String(me || '').toLowerCase();
  if (meKey) skip.add(meKey);
  for (const a of opts.exclude ?? []) skip.add(String(a).toLowerCase());
  for (const a of opts.blocked ?? []) skip.add(String(a).toLowerCase());

  const out: T[] = [];
  const add = (u: T) => {
    const k = keyOf(u);
    if (!k || skip.has(k) || out.length >= limit) return;
    skip.add(k);
    out.push(u);
  };

  // 1. Newest follows. Rows without a date keep the server's order (it sends newest first).
  const cutoff = now - RECENT_FOLLOW_DAYS * 24 * 60 * 60 * 1000;
  const dated = following
    .map((u, i) => ({ u, i, t: timeOf(u.followedAt) }))
    .filter((r) => Number.isFinite(r.t) && r.t >= cutoff)
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .slice(0, RECENT_FOLLOW_MAX);
  for (const r of dated) add(r.u);

  // 2. People you have messaged, most recent first.
  for (const u of messaged) add(u);

  // 3. The rest of your follows, most followers first.
  const rest = following
    .map((u, i) => ({ u, i }))
    .sort((a, b) => followerCount(b.u) - followerCount(a.u) || a.i - b.i);
  for (const r of rest) add(r.u);

  return out;
}
