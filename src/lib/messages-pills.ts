import { useSyncExternalStore } from 'react';

/**
 * Messages tabs as filled pills (the open one solid, the rest soft grey),
 * round unread counts and no lit bar on the cards. Off by default: Messages
 * keeps its glowing underline. Saved per device and mirrored onto
 * <html data-msg-pills> so styles/messages-pills.css can follow it. The app
 * keeps the same choice under its own `messagesPills` pref.
 */

const STORAGE_KEY = 'riftn.messages.pills';

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let current = typeof window === 'undefined' ? false : read();
const listeners = new Set<() => void>();

function mirror(on: boolean) {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.dataset.msgPills = '';
  else delete document.documentElement.dataset.msgPills;
}

mirror(current);

export function getMessagesPills(): boolean {
  return current;
}

export function setMessagesPills(on: boolean): void {
  if (on === current) return;
  current = on;
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, 'true');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  mirror(on);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
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

export function useMessagesPills(): boolean {
  return useSyncExternalStore(subscribe, getMessagesPills, () => false);
}
