const CALL_NOTICE_PREFIX = /^(?:📞|📹|📵)/u;

/** Only messages emitted by the call flow should use the call card. */
export function isDmCallNotice(content: string | null | undefined): boolean {
  return CALL_NOTICE_PREFIX.test(content || '');
}

export interface CallNote {
  kind: 'started' | 'ended' | 'missed' | 'declined';
  video: boolean;
  /** Length of a call that connected, as it was written into the note. */
  duration: string | null;
}

/** Reads a call note back into what happened. The notes are written in English by the call flow. */
export function describeCallNote(content: string): CallNote {
  const video = /^📹/u.test(content) || /video/i.test(content);
  const ended = content.match(/ended\s*·\s*(.+)$/i);
  if (ended) return { kind: 'ended', video, duration: ended[1].trim() };
  if (/declined/i.test(content)) return { kind: 'declined', video, duration: null };
  if (/^📵/u.test(content) || /missed/i.test(content)) return { kind: 'missed', video, duration: null };
  return { kind: 'started', video, duration: null };
}
