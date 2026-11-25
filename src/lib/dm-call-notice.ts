import type { TFunction } from 'i18next';

const CALL_NOTICE_PREFIX = /^(?:📞|📹|📵)/u;

/** Only messages emitted by the call flow should use the call card. */
export function isDmCallNotice(content: string | null | undefined): boolean {
  return !!content && (CALL_NOTICE_PREFIX.test(content) || !!parseEndedCallNote(content));
}

export interface CallNote {
  kind: 'started' | 'ended' | 'missed' | 'declined';
  video: boolean;
  /** Length of a call that connected, as it was written into the note. */
  duration: string | null;
}

// Call notices are stored as a shared English string, including in older chats.
function parseEndedCallNote(content: string): CallNote | null {
  const match = /^(?:[📞📹]\uFE0F?\s*)?(Voice|Video) call ended(?:\s*·\s*(\d+(?::\d{2}){1,2}))?$/iu.exec(content.trim());
  if (!match) return null;
  return { kind: 'ended', video: match[1].toLowerCase() === 'video', duration: match[2] ?? null };
}

export function localizeDmCallPreview(
  message: { content?: string | null; msgType?: string; type?: string; undecryptable?: boolean } | null | undefined,
  t: TFunction,
): string | undefined {
  if (!message?.content || message.undecryptable) return undefined;
  const type = message.msgType ?? message.type;
  if (type && type !== 'msg' && type !== 'text') return undefined;

  const note = parseEndedCallNote(message.content);
  if (!note) return undefined;
  const icon = note.video ? '📹' : '📞';
  const label = t('calls.ended', 'Call ended');
  const preview = icon + ' ' + label;
  return note.duration ? preview + ' · ' + note.duration : preview;
}

/** Reads a call note back into what happened. The notes are written in English by the call flow. */
export function describeCallNote(content: string): CallNote {
  const ended = parseEndedCallNote(content);
  if (ended) return ended;
  const video = /^📹/u.test(content) || /video/i.test(content);
  if (/declined/i.test(content)) return { kind: 'declined', video, duration: null };
  if (/^📵/u.test(content) || /missed/i.test(content)) return { kind: 'missed', video, duration: null };
  return { kind: 'started', video, duration: null };
}
