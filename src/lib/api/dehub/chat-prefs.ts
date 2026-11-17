import { apiCall } from './core';

/** One person's own settings for one chat (only they see them). */
export interface ChatPref {
  conversationId: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  mutedUntil: string | null;
  markedUnread: boolean;
  /** Group/community chats: shown in the Chat list since then. */
  listedAt?: string | null;
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
