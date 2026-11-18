import { apiCall } from './core';

/**
 * Where you stopped reading one chat, kept on the server so every device
 * opens it on the same line. Chat ids: a DM id, `community:<uuid>` for
 * group/channel/community chats, `live:<room>` for the public live chat.
 */
export interface ChatReadPosition {
  chatId: string;
  messageId: string;
  /** The line's own time (ISO). Lines after it are unread. */
  at: string;
  savedAt: string | null;
}

export async function getChatReadPosition(chatId: string): Promise<ChatReadPosition | null> {
  const res = await apiCall<{ result?: ChatReadPosition | null }>(
    `/api/dm/read-position/${encodeURIComponent(chatId)}`,
    { requiresAuth: true, timeoutMs: 6_000 },
  );
  return res?.result ?? null;
}

export async function saveChatReadPosition(chatId: string, messageId: string, at: string): Promise<ChatReadPosition | null> {
  const res = await apiCall<{ result?: ChatReadPosition | null }>(
    `/api/dm/read-position/${encodeURIComponent(chatId)}`,
    { method: 'POST', body: { messageId, at }, requiresAuth: true },
  );
  return res?.result ?? null;
}
