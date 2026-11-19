/**
 * How a reaction moves when it lands in a chat (live chat, DMs, groups,
 * rooms). Kept on this device, like the chat text size.
 *
 *   fly   - the default: the emoji flies to its chip (from where you tapped
 *           for your own, up from below for everyone else's)
 *   pop   - the chip springs in place
 *   burst - your own blooms big over the line with sparks
 *   off   - no motion, the count just changes
 *
 * Settings → Appearance → "Reactions in chat" changes it.
 */
import { useSyncExternalStore } from 'react';

export const CHAT_REACTION_STYLES = ['fly', 'pop', 'burst', 'off'] as const;
export type ChatReactionStyle = (typeof CHAT_REACTION_STYLES)[number];

const KEY = 'riftn.chat.reactionStyle';
const EVENT = 'riftn:chat-reaction-style';
const DEFAULT: ChatReactionStyle = 'fly';

export function isChatReactionStyle(value: unknown): value is ChatReactionStyle {
  return typeof value === 'string' && (CHAT_REACTION_STYLES as readonly string[]).includes(value);
}

export function getChatReactionStyle(): ChatReactionStyle {
  try {
    const v = localStorage.getItem(KEY);
    return isChatReactionStyle(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setChatReactionStyle(style: ChatReactionStyle): void {
  try {
    if (style === DEFAULT) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, style);
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

export function useChatReactionStyle(): ChatReactionStyle {
  return useSyncExternalStore(subscribe, getChatReactionStyle, () => DEFAULT);
}
