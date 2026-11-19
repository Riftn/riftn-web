/**
 * The saved answer to "Delete message?" in chats. Kept on this device, like
 * the chat text size. "ask" shows the pop-up every time; "me" deletes from
 * your own chat straight away; "everyone" deletes for everyone whenever that
 * is allowed and falls back to "for me" when it isn't (someone else's message
 * in a group).
 *
 * Settings → Appearance → "When you delete a message" changes it back.
 */
import { useSyncExternalStore } from 'react';

export const CHAT_DELETE_CHOICES = ['ask', 'me', 'everyone'] as const;
export type ChatDeleteChoice = (typeof CHAT_DELETE_CHOICES)[number];

const KEY = 'riftn.chat.deleteChoice';
const EVENT = 'riftn:chat-delete-choice';

export function isChatDeleteChoice(value: unknown): value is ChatDeleteChoice {
  return typeof value === 'string' && (CHAT_DELETE_CHOICES as readonly string[]).includes(value);
}

export function getChatDeleteChoice(): ChatDeleteChoice {
  try {
    const v = localStorage.getItem(KEY);
    return isChatDeleteChoice(v) ? v : 'ask';
  } catch {
    return 'ask';
  }
}

export function setChatDeleteChoice(choice: ChatDeleteChoice): void {
  try {
    if (choice === 'ask') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
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

export function useChatDeleteChoice(): ChatDeleteChoice {
  return useSyncExternalStore(subscribe, getChatDeleteChoice, () => 'ask');
}
