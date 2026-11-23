import { useSyncExternalStore } from 'react';

/**
 * How feed posts are split (Settings > Appearance > Layout).
 *
 * - bento: every post sits in its own rounded card (default).
 * - line:  no cards. Posts are split by one thin line as wide as the feed's
 *          top pill, and each post's content moves out to where the card's
 *          edge used to be. Media keeps its rounded shape.
 *
 * Saved per device and mirrored onto <html data-feed-sep> so the feed CSS
 * (styles/feed-separator.css) can follow it without re-rendering the feed.
 * Themes that already have no cards (Minimal, Light, Immersive) ignore it.
 * The app keeps the same choice under its own `feedSeparator` pref.
 */

export type FeedSeparator = 'bento' | 'line';

const STORAGE_KEY = 'dehub.feedSeparator';

function read(): FeedSeparator {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isFeedSeparator(stored)) return stored;
    return window.localStorage.getItem('riftn.chat.cards') === 'false' ? 'line' : 'bento';
  } catch {
    return 'bento';
  }
}

let current: FeedSeparator = typeof window === 'undefined' ? 'bento' : read();
const listeners = new Set<() => void>();

function mirror(value: FeedSeparator) {
  if (typeof document === 'undefined') return;
  if (value === 'line') document.documentElement.dataset.feedSep = 'line';
  else delete document.documentElement.dataset.feedSep;
}

mirror(current);

export function isFeedSeparator(value: unknown): value is FeedSeparator {
  return value === 'bento' || value === 'line';
}

export function getFeedSeparator(): FeedSeparator {
  return current;
}

export function setFeedSeparator(value: FeedSeparator): void {
  if (value === current) return;
  current = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  mirror(value);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY && e.key !== 'riftn.chat.cards') return;
    current = read();
    mirror(current);
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useFeedSeparator(): FeedSeparator {
  return useSyncExternalStore(subscribe, getFeedSeparator, () => 'bento' as FeedSeparator);
}
