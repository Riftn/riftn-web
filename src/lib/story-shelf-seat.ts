/**
 * Whether Home showed the Moments row last time, so the loading skeletons
 * (index.html boot skeleton and the React FeedSkeleton) can hold its seat and
 * the feed does not jump down when the row arrives. Unknown counts as shown:
 * most people have the row, and an empty seat closing is rarer than a jump.
 */
export const SHELF_SEAT_KEY = 'dehub.shelfShown';

export function rememberShelfSeat(shown: boolean): void {
  try {
    localStorage.setItem(SHELF_SEAT_KEY, shown ? '1' : '0');
  } catch {
    /* storage off: the seat is simply assumed next time */
  }
}

export function shelfSeatExpected(): boolean {
  try {
    return localStorage.getItem(SHELF_SEAT_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Home's own feed paths, the only ones that carry the row. */
export function isShelfPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/' || path === '/app';
}
