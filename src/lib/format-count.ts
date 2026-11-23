/**
 * One short style for every counter on screen: 999, 1.2K, 3.4M, 1B.
 * Views, listens, likes, followers, members, votes, points and the rest all go
 * through here, so web and the app read the same. Money keeps its exact amount
 * and does not use this.
 *
 * The K / M / B form is the same in every language on purpose: feed items keep
 * their counts as these strings and parseFormattedCount reads them back.
 */
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

/** A plain number: "1200", "1,200", "1 200", "12.5". Anything else is left as it is. */
const NUMERIC = /^-?\d{1,3}(?:[,\s  ]\d{3})+$|^-?\d+(?:\.\d+)?$/;

export function formatCount(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  let n: number;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!NUMERIC.test(trimmed)) return value; // already short ("1.2K") or not a number
    n = /^-?\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number(trimmed.replace(/[^\d-]/g, ''));
  } else {
    n = value;
  }
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) < 1000) return String(Number.isInteger(n) ? n : Math.round(n * 100) / 100);
  return compact.format(n);
}

/** Placeholders in translated copy that hold a counter. {{count}} covers plurals. */
export const COUNTER_PLACEHOLDERS = new Set([
  'count', 'views', 'likes', 'listens', 'listeners', 'followers', 'following', 'attended',
  'subscribers', 'members', 'viewers', 'watchers', 'plays', 'reposts', 'shares', 'upvotes',
  'votes', 'points', 'reactions', 'replies', 'comments', 'going', 'interested', 'holders',
]);
