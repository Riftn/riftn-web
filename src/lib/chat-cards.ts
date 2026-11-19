/**
 * Chat list on /app/messages: each chat on its own card (on, the default) or
 * a plain list with a line between chats (off). Kept on this device, like the
 * chat text size, under the same key the app uses.
 *
 * Settings → Appearance → "Chats as cards" changes it.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'riftn.chat.cards';
const EVENT = 'riftn:chat-cards';

export function getChatCards(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setChatCards(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'false');
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

export function useChatCards(): boolean {
  return useSyncExternalStore(subscribe, getChatCards, () => true);
}
