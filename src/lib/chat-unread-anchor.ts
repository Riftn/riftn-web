/**
 * Where "Unread messages" starts in a chat you just opened.
 *
 * Worked out once, at open, before the read receipt goes out — the receipt
 * flips every line to read, and the marker has to survive that so the reader
 * can still find where they left off.
 *
 * Two sources, because each can be short:
 *  - the lines themselves (`isRead` false, not ours) — exact, but only for the
 *    page that is loaded;
 *  - the conversation's unread count — right even past the loaded page, but
 *    says nothing about which line it starts at.
 * The marker sits on the oldest loaded unread line; when the flags show none
 * but the count does (a cached thread that predates the new lines), it counts
 * that many of the other side's lines back from the newest.
 */
export interface UnreadAnchorLine {
  id: string;
  own: boolean;
  isRead?: boolean;
  /** Deleted or unopenable lines are skipped: they don't render a row to sit on. */
  skip?: boolean;
}

export interface UnreadAnchor {
  /** The first unread line; the marker renders just above it. */
  id: string;
  /** Every line counted as unread at open, newest last. */
  ids: string[];
  /** What the marker says. Can be higher than ids.length when history is not loaded yet. */
  count: number;
}

/** @param lines oldest first */
export function findUnreadAnchor(lines: UnreadAnchorLine[], conversationUnread = 0): UnreadAnchor | null {
  const theirs = lines.filter((l) => !l.own && !l.skip);
  const flagged = theirs.filter((l) => l.isRead === false);
  if (flagged.length > 0) {
    const first = flagged[0];
    const ids = theirs.slice(theirs.indexOf(first)).map((l) => l.id);
    // All of the loaded page unread and the server says more: history holds the rest.
    const startsAtOldestLoaded = theirs.indexOf(first) === 0;
    const count = startsAtOldestLoaded ? Math.max(ids.length, conversationUnread) : ids.length;
    return { id: first.id, ids, count };
  }
  const n = Math.max(0, Math.floor(conversationUnread || 0));
  if (n === 0 || theirs.length === 0) return null;
  const ids = theirs.slice(-n).map((l) => l.id);
  return { id: ids[0], ids, count: Math.max(n, ids.length) };
}
