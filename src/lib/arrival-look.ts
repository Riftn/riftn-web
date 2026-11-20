/**
 * How a log-in lands on the page (SignInHandoff): Trace, Tune in, the Rift
 * (the default), Deck or Glass drop. A per-device choice in Settings → Appearance,
 * kept on this device like the sign-in logo look, since it plays before the
 * account is loaded. Same key and values as the app's `libs/arrival-look.ts`.
 */
import { useSyncExternalStore } from 'react';

export const ARRIVAL_LOOKS = ['trace', 'tune', 'rift', 'deck', 'glass'] as const;
export type ArrivalLook = (typeof ARRIVAL_LOOKS)[number];
export const DEFAULT_ARRIVAL_LOOK: ArrivalLook = 'rift';

/** How long each one's intro plays before it may open on the picture. */
export const ARRIVAL_INTRO_MS: Record<ArrivalLook, number> = {
  trace: 300,
  tune: 280,
  rift: 1100,
  deck: 600,
  glass: 450,
};

const KEY = 'riftn.signin.arrival';
const EVENT = 'riftn:arrival-look';

export function isArrivalLook(value: unknown): value is ArrivalLook {
  return typeof value === 'string' && (ARRIVAL_LOOKS as readonly string[]).includes(value);
}

export function getArrivalLook(): ArrivalLook {
  try {
    const saved = localStorage.getItem(KEY);
    return isArrivalLook(saved) ? saved : DEFAULT_ARRIVAL_LOOK;
  } catch {
    return DEFAULT_ARRIVAL_LOOK;
  }
}

export function setArrivalLook(look: ArrivalLook): void {
  try {
    if (look === DEFAULT_ARRIVAL_LOOK) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, look);
  } catch {
    // Private mode: the choice just won't stick.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useArrivalLook(): ArrivalLook {
  return useSyncExternalStore(subscribe, getArrivalLook, () => DEFAULT_ARRIVAL_LOOK);
}
