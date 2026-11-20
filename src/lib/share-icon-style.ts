import { useSyncExternalStore } from 'react';

/**
 * Which glyph the post Share button uses (Settings > Appearance > Layout).
 * - classic:    the usual three-dot share icon (default)
 * - distribute: a person in a ring with arrows pointing out
 * Saved per device. The app keeps the same choice under its own pref.
 */
export type ShareIconStyle = 'classic' | 'distribute';

const STORAGE_KEY = 'dehub.shareIconStyle';

function read(): ShareIconStyle {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'distribute' ? 'distribute' : 'classic';
  } catch {
    return 'classic';
  }
}

let current: ShareIconStyle = typeof window === 'undefined' ? 'classic' : read();
const listeners = new Set<() => void>();

export function isShareIconStyle(value: unknown): value is ShareIconStyle {
  return value === 'classic' || value === 'distribute';
}

export function getShareIconStyle(): ShareIconStyle {
  return current;
}

export function setShareIconStyle(value: ShareIconStyle): void {
  if (value === current) return;
  current = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    current = read();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useShareIconStyle(): ShareIconStyle {
  return useSyncExternalStore(subscribe, getShareIconStyle, () => 'classic' as ShareIconStyle);
}
