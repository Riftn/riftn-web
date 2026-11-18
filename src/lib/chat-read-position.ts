/**
 * Telegram-style "where you left off" for chats.
 *
 * The server keeps one spot per chat: the newest line that has been on your
 * screen. Opening a chat lands on the first line after it, under an
 * "Unread messages" line, instead of at the newest message.
 */
import type { UnreadAnchor } from './chat-unread-anchor';

export interface ReadSpot {
  messageId: string;
  /** The line's own time (ISO). */
  at: string;
}

export interface ReadLine {
  id: string;
  own: boolean;
  /** The line's own time (ISO or ms). */
  at: string | number | null | undefined;
  /** Deleted, unopenable or still-sending lines: no row to land on, never counted. */
  skip?: boolean;
}

export type ReadAnchorResult =
  | { kind: 'none' }
  /** The spot is older than every loaded line and there is more history: load it first. */
  | { kind: 'older' }
  | { kind: 'anchor'; anchor: UnreadAnchor };

const ms = (at: ReadLine['at']): number => {
  if (typeof at === 'number') return at;
  const t = at ? Date.parse(at) : NaN;
  return Number.isFinite(t) ? t : NaN;
};

/**
 * @param lines oldest first
 * @param hasOlder there is history above the loaded lines
 */
export function anchorFromReadSpot(lines: ReadLine[], spot: ReadSpot, hasOlder: boolean): ReadAnchorResult {
  if (!lines.length) return { kind: 'none' };
  let index = lines.findIndex((l) => l.id === spot.messageId);
  if (index === -1) {
    const spotMs = ms(spot.at);
    if (!Number.isFinite(spotMs)) return { kind: 'none' };
    const oldest = ms(lines[0].at);
    if (Number.isFinite(oldest) && spotMs < oldest) {
      if (hasOlder) return { kind: 'older' };
      index = -1;
    } else {
      // The line itself is gone (deleted): everything up to its time was read.
      index = -1;
      for (let i = 0; i < lines.length; i++) {
        const t = ms(lines[i].at);
        if (Number.isFinite(t) && t <= spotMs) index = i;
      }
    }
  }
  let after = lines.slice(index + 1);
  // Writing in the chat means you were at the bottom of it.
  let lastOwn = -1;
  after.forEach((l, i) => { if (l.own && !l.skip) lastOwn = i; });
  if (lastOwn >= 0) after = after.slice(lastOwn + 1);
  const theirs = after.filter((l) => !l.own && !l.skip);
  if (!theirs.length) return { kind: 'none' };
  return { kind: 'anchor', anchor: { id: theirs[0].id, ids: theirs.map((l) => l.id), count: theirs.length } };
}

/**
 * The newest line whose top has come on screen in a scrolling chat. Walks the
 * candidates newest first and stops at the first one inside the box.
 */
export function newestLineOnScreen(
  container: HTMLElement,
  idsNewestFirst: string[],
  elementFor: (id: string) => HTMLElement | null | undefined,
): string | null {
  const box = container.getBoundingClientRect();
  // A chat taller than the window (inside a scrolling page) only counts the
  // part that is actually on screen.
  const top = Math.max(box.top, 0);
  const bottom = Math.min(box.bottom, typeof window !== 'undefined' ? window.innerHeight : box.bottom);
  for (const id of idsNewestFirst) {
    const el = elementFor(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0 && r.width === 0) continue;
    if (r.top < bottom - 12 && r.bottom > top) return id;
    if (r.bottom <= top) return null;
  }
  return null;
}

/** True when `a` is a later spot than `b` (or `b` is missing). */
export function isLaterSpot(a: ReadSpot, b: ReadSpot | null | undefined): boolean {
  if (!b) return true;
  if (a.messageId === b.messageId) return false;
  const x = ms(a.at);
  const y = ms(b.at);
  if (!Number.isFinite(x)) return false;
  if (!Number.isFinite(y)) return true;
  return x >= y;
}
