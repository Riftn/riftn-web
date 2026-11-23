/**
 * Early access for the person who asked
 * =====================================
 * When a request ships a new feature, its poster can get it a day before
 * everyone else (Requests 4dbc2296). The feature's code asks
 * `useEarlyAccess('<request id>', '<latest public date>')`, and the owners
 * start the head start by setting the request's `early_access_until` when
 * they mark it Shipped (see the 20261122220000 migration for the SQL).
 *
 * Who sees a gated feature:
 *  - the request's poster and the board owners, always;
 *  - everyone else once `early_access_until` has passed, or straight away
 *    when the request shipped with no head start;
 *  - everyone after `openBy`, whatever the row says, so a request nobody
 *    marked Shipped can never hide a feature for good;
 *  - everyone when the row cannot be read (fail open).
 *
 * Pure functions here; the hooks live in hooks/use-early-access.ts.
 */

export interface EarlyAccessRow {
  id: string;
  author_wallet_address: string | null;
  author_username: string | null;
  status: string;
  early_access_until: string | null;
}

export interface EarlyAccessViewer {
  wallet?: string | null;
  username?: string | null;
  /** Board owners see every gated feature, to test it. */
  isOwner?: boolean;
}

const SHIPPED = new Set(['shipped', 'completed']);

export function isRequestPoster(row: Pick<EarlyAccessRow, 'author_wallet_address' | 'author_username'>, viewer: EarlyAccessViewer): boolean {
  const author = (row.author_wallet_address || '').toLowerCase();
  const wallet = (viewer.wallet || '').toLowerCase();
  if (author && wallet && author === wallet) return true;
  // A few old rows carry the username in the wallet column.
  const username = (viewer.username || '').replace(/^@/, '').toLowerCase();
  return !!username && !author.startsWith('0x') && author === username;
}

/**
 * True when this viewer may see the gated feature now. `row` is undefined
 * while loading (hidden, so nothing flashes), null when the row is missing
 * or the read failed (shown).
 */
export function earlyAccessOpen(
  row: EarlyAccessRow | null | undefined,
  viewer: EarlyAccessViewer,
  openBy: string,
  now: number = Date.now(),
): boolean {
  const cap = Date.parse(openBy);
  if (Number.isFinite(cap) && now >= cap) return true;
  if (row === undefined) return false;
  if (row === null) return true;
  if (viewer.isOwner || isRequestPoster(row, viewer)) return true;
  if (row.early_access_until) {
    const until = Date.parse(row.early_access_until);
    return !Number.isFinite(until) || now >= until;
  }
  return SHIPPED.has(row.status);
}

/** Whole hours left in the head start, at least 1, or null when it is over. */
export function earlyAccessHoursLeft(until: string | null | undefined, now: number = Date.now()): number | null {
  if (!until) return null;
  const end = Date.parse(until);
  if (!Number.isFinite(end) || end <= now) return null;
  return Math.max(1, Math.ceil((end - now) / 3_600_000));
}

/**
 * PostgREST `or` filter matching a person's requests by wallet, plus the old
 * rows that stored a plain username there. Wildcards are never let through.
 */
export function posterFilter(wallet: string, username?: string | null): string | null {
  const w = wallet.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(w)) return null;
  const parts = [`author_wallet_address.ilike.${w}`];
  const u = (username || '').replace(/^@/, '').trim().toLowerCase();
  if (/^[a-z0-9.]{2,40}$/.test(u)) parts.push(`author_wallet_address.ilike.${u}`);
  return parts.join(',');
}

/** The Early supporter badge itself rides on its own head start. */
export const EARLY_SUPPORTER_REQUEST_ID = '4dbc2296-4480-42cf-98c6-2751e39332d5';
export const EARLY_SUPPORTER_OPEN_BY = '2026-11-25T00:00:00Z';

/** Board owners (maldoteth's wallets) see every gated feature, to test it. */
export const EARLY_ACCESS_OWNER_WALLETS = [
  '0x9324840523a5d17dd12a2f11a9472e5a199c1937',
  '0xec4e2c7417f781b35d830671f013b3b91f29ba64',
];
