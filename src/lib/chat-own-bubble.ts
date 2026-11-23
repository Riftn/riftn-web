import { useSyncExternalStore } from 'react';

/**
 * Your own lines in Public Chat (live chat page, side chat) on a bubble, the
 * way private chats show them. Off by default: Public Chat reads as one open
 * room. Saved per device and mirrored onto <html data-chat-own-bubble> so the
 * CSS can follow it without re-rendering the chat. The app keeps the same
 * choice under its own `chatOwnBubble` pref.
 */

const STORAGE_KEY = 'riftn.chat.ownBubble';

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
  if (on) document.documentElement.dataset.chatOwnBubble = '';
  else delete document.documentElement.dataset.chatOwnBubble;
}

mirror(current);

export function getChatOwnBubble(): boolean {
  return current;
}

export function setChatOwnBubble(on: boolean): void {
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

export function useChatOwnBubble(): boolean {
  return useSyncExternalStore(subscribe, getChatOwnBubble, () => false);
}
