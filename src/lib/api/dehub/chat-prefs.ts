import { apiCall } from './core';

/** Reactions other people left on your lines in a chat, not seen yet. */
export interface ChatReactionSummary {
  total: number;
  /** Most used first. */
  emojis: { emoji: string; count: number }[];
  last: { emoji: string; by: string; name: string | null; messageId: string; at: string };
}

/** Public Chat keeps only its waiting reactions in the settings store. */
export const PUBLIC_CHAT_PREF_ID = 'live:global';

/** One person's own settings for one chat (only they see them). */
export interface ChatPref {
  conversationId: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  mutedUntil: string | null;
  markedUnread: boolean;
  /** Group/community chats: shown in the Chat list since then. */
  listedAt?: string | null;
  /** DMs: your messages in this chat are end-to-end encrypted since then. */
  encryptedAt?: string | null;
  /** Reactions to your lines you haven't seen; cleared when you open the chat. */
  reactions?: ChatReactionSummary | null;
}

/**
 * Group, channel and community chats are communities underneath. Their
 * settings live beside the DM ones under this id.
 */
export function roomChatId(communityId: string): string {
  return `community:${communityId.toLowerCase()}`;
}

export interface ChatPrefPatch {
  pinned?: boolean;
  archived?: boolean;
  unread?: boolean;
  /** ISO time, 'forever', or null to unmute. */
  mutedUntil?: string | null;
  /** Accept a message request (one way). */
  accepted?: true;
  /** Group/community chats: show in the Chat list. */
  listed?: boolean;
  /** DMs: end-to-end encrypt your messages in this chat. Off by default. */
  encrypted?: boolean;
  /** You opened the chat: clear its waiting reactions. */
  seenReactions?: true;
}

export async function getChatPrefs(): Promise<ChatPref[]> {
  const res = await apiCall<{ result?: ChatPref[] }>('/api/dm/chat-prefs', { requiresAuth: true });
  return Array.isArray(res?.result) ? res.result : [];
}

export async function setChatPref(conversationId: string, patch: ChatPrefPatch): Promise<ChatPref> {
  const res = await apiCall<{ result: ChatPref }>(`/api/dm/chat-prefs/${encodeURIComponent(conversationId)}`, {
    method: 'POST',
    body: patch as Record<string, unknown>,
    requiresAuth: true,
  });
  return res.result;
}
