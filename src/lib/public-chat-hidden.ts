/**
 * Public Chat "Delete for me"
 * ===========================
 * Lines you removed from your own view of a public room. Everyone else still
 * sees them. Kept on this device per account (newest 500), so a line you
 * hid stays hidden after a reload.
 *
 * "Delete for everyone" (your own line, or any line if you moderate the room)
 * goes over the socket and takes it down for the whole room.
 *
 * Same storage key on the mobile app (libs/public-chat-hidden.ts).
 *
 * @module lib/public-chat-hidden
 */
import { useCallback, useSyncExternalStore } from 'react';

const KEY_PREFIX = 'riftn.publicChat.hidden.';
const MAX = 500;
const EMPTY: ReadonlySet<string> = new Set();

const cache = new Map<string, ReadonlySet<string>>();
const listeners = new Set<() => void>();

function keyFor(account: string) {
  return KEY_PREFIX + account.toLowerCase();
}

export function readHiddenLines(account: string | null | undefined): ReadonlySet<string> {
  if (!account) return EMPTY;
  const key = keyFor(account);
  const hit = cache.get(key);
  if (hit) return hit;
  let ids: string[] = [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    /* private mode or a bad value: nothing hidden */
  }
  const set = new Set(ids);
  cache.set(key, set);
  return set;
}

export function hideLineForMe(account: string | null | undefined, messageId: string) {
  if (!account || !messageId) return;
  const key = keyFor(account);
  const next = [...readHiddenLines(account)].filter((id) => id !== messageId);
  next.push(messageId);
  const kept = next.slice(-MAX);
  cache.set(key, new Set(kept));
  try {
    localStorage.setItem(key, JSON.stringify(kept));
  } catch {
    /* still hidden for this visit */
  }
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The lines this account hid, live. */
export function useHiddenLines(account: string | null | undefined): ReadonlySet<string> {
  const read = useCallback(() => readHiddenLines(account), [account]);
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
