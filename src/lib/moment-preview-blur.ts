import { useSyncExternalStore } from 'react';

/**
 * "Blur Moment previews": other people's Moment tiles on Home stay blurred
 * until you open them, so nothing is seen before you choose to watch it
 * (Requests e7dde08b / ce574e81). Off by default. Saved on this device.
 */
const KEY = 'riftn.blurMomentPreviews';
const listeners = new Set<() => void>();

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

let blurred = read();

export function setMomentPreviewsBlurred(next: boolean) {
  blurred = next;
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useMomentPreviewsBlurred(): boolean {
  return useSyncExternalStore(subscribe, () => blurred, () => false);
}
