import { useSyncExternalStore } from 'react';

/**
 * "Hide my balance": the eye on the menu's wallet chip swaps the number for
 * dots so it isn't on show while scrolling in public. Saved on this device.
 */
const KEY = 'riftn.hideBalance';
const listeners = new Set<() => void>();

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

let hidden = read();

export function setBalanceHidden(next: boolean) {
  hidden = next;
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useBalanceHidden(): boolean {
  return useSyncExternalStore(subscribe, () => hidden, () => false);
}

export const HIDDEN_BALANCE = '••••';
