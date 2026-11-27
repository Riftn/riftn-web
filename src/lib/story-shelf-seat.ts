/**
 * What Home's Moments seat held last time: the row of tiles, the "What's on
 * today?" ask bar, or nothing. The loading skeletons (index.html boot
 * skeleton and the React FeedSkeleton) and the shelf itself, while it waits
 * for its data, draw that same shape so the feed under it never moves when
 * the real thing lands. Unknown counts as the row: most people have it.
 */
export const SHELF_SEAT_KEY = 'dehub.shelfShown';

export type ShelfSeat = 'row' | 'ask' | 'none';

export function rememberShelfSeat(seat: ShelfSeat): void {
  try {
    localStorage.setItem(SHELF_SEAT_KEY, seat === 'row' ? '1' : seat === 'ask' ? 'ask' : '0');
  } catch {
    /* storage off: the row is simply assumed next time */
  }
}

export function expectedShelfSeat(): ShelfSeat {
  try {
    const value = localStorage.getItem(SHELF_SEAT_KEY);
    return value === '0' ? 'none' : value === 'ask' ? 'ask' : 'row';
  } catch {
    return 'row';
  }
}

/** Home's own feed paths, the only ones that carry the row. */
export function isShelfPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/' || path === '/app';
}
