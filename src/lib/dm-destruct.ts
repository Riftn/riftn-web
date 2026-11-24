/**
 * Self-destructing DM attachments. The server removes the message for both
 * people when the timer runs out, or as soon as the other person has watched
 * a view-once one. Same choices as the backend `src/dm/dm-destruct.ts`.
 */
import i18n from 'i18next';

/** Translated when i18n is up; plain English before that (tests, very early boot). */
const tx = (key: string, defaultValue: string, vars: Record<string, unknown> = {}): string =>
  i18n.isInitialized ? String(i18n.t(key, { defaultValue, ...vars })) : defaultValue.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));

export type DmOpenChoice = 'open:3' | 'open:10' | 'open:25' | 'open:60';
/** An on-open countdown that lets them open it once more after it runs out. */
export type DmOpenReplayChoice = `${DmOpenChoice}:r1`;
export type DmDestructChoice = 'view' | 60 | 3600 | 43200 | 86400 | 604800 | 31536000 | DmOpenChoice | DmOpenReplayChoice;

export const DESTRUCT_CHOICES: DmDestructChoice[] = ['view', 60, 3600, 43200, 86400, 604800, 31536000];

/** Countdowns that start the first time the other person opens it. */
export const OPEN_CHOICES: DmOpenChoice[] = ['open:3', 'open:10', 'open:25', 'open:60'];

export function isOpenChoice(c: unknown): c is DmOpenChoice {
  return typeof c === 'string' && (OPEN_CHOICES as string[]).includes(c);
}

/** Seconds of an on-open countdown: 'open:10' -> 10. */
export function openSeconds(c: DmOpenChoice | DmOpenReplayChoice): number {
  return Number(c.split(':')[1]);
}

/** What is sent: the picked timer, with one replay added when asked for (on-open ones only). */
export function withReplay(c: DmDestructChoice | null | undefined, replay?: boolean): DmDestructChoice | undefined {
  if (!c) return undefined;
  return replay && isOpenChoice(c) ? `${c}:r1` : c;
}

export interface DmDestruct {
  mode: 'view' | 'time' | 'open';
  seconds?: number;
  expiresAt?: string;
  destroyedAt?: string;
  /** On-open: when they first opened it. */
  openedAt?: string;
  /** On-open: replays the sender allowed (0 or 1) and how many were started. */
  replaysAllowed?: number;
  replaysUsed?: number;
  /**
   * A view-once or on-open photo/video that was opened and then wiped: no
   * file and no text left, it stays in the chat for both people as "Opened".
   */
  marker?: boolean;
  /** What the wiped attachment was, for the Opened marker's icon. */
  kind?: 'image' | 'video';
}

/** A view-once or on-open photo/video: the kind that is gone once seen. */
export function isSeenOnce(d: DmDestruct | null | undefined): boolean {
  return d?.mode === 'view' || d?.mode === 'open';
}

/** Replays still left on an on-open message, as the server last said. */
export function replaysLeft(d: DmDestruct | null | undefined): number {
  return Math.max(0, (Number(d?.replaysAllowed) || 0) - (Number(d?.replaysUsed) || 0));
}

/** The big countdown on an open photo or video: "29s". */
export function countdownLabel(seconds: number): string {
  return tx('dm.openTimer.left', '{{n}}s', { n: Math.max(0, Math.ceil(seconds)) });
}

const LABELS: Record<string, string> = { view: '1 view', 60: '1 min', 3600: '1 hour', 43200: '12 hours', 86400: '1 day', 604800: '1 week', 31536000: '1 year' };
const SHORT: Record<string, string> = { view: '1 view', 60: '1m', 3600: '1h', 43200: '12h', 86400: '1d', 604800: '1w', 31536000: '1y' };

/** Short label for a choice, in the reader's language: "1 view", "1 min", "12 hours", "1 week". */
export function destructLabel(c: DmDestructChoice): string {
  if (isOpenChoice(c)) {
    const n = openSeconds(c);
    return n === 60 ? tx('dmVideo.destruct.60', '1 min') : tx('dmVideo.destructSecs', '{{n}} sec', { n });
  }
  return tx(`dmVideo.destruct.${c}`, LABELS[String(c)]);
}

/** Tiny label for small chips: "1 view", "1m", "12h", "1w". */
export function destructShort(c: DmDestructChoice): string {
  if (isOpenChoice(c)) return tx('dmVideo.destructShortSecs', '{{n}}s', { n: openSeconds(c) });
  return tx(`dmVideo.destructShort.${c}`, SHORT[String(c)]);
}

/** Time left on a timed message, as the chip shows it: "59s", "12m", "5h", "3d". */
export function destructLeft(d: DmDestruct | null | undefined, now = Date.now()): string | null {
  if (!d || d.mode !== 'time' || !d.expiresAt) return null;
  const s = Math.max(0, Math.round((new Date(d.expiresAt).getTime() - now) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** The choice from what is stored on a message (used for the optimistic copy). */
export function destructFromChoice(c: DmDestructChoice | null | undefined, now = Date.now()): DmDestruct | null {
  if (!c) return null;
  if (c === 'view') return { mode: 'view' };
  if (isOpenChoice(c)) return { mode: 'open', seconds: openSeconds(c) };
  if (typeof c === 'string' && c.startsWith('open:')) return { mode: 'open', seconds: openSeconds(c as DmOpenReplayChoice), replaysAllowed: 1, replaysUsed: 0 };
  if (typeof c !== 'number') return null;
  return { mode: 'time', seconds: c, expiresAt: new Date(now + c * 1000).toISOString() };
}
