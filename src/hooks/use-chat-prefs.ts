import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { onDmReactionUpdated } from '@/lib/api/dehub/dm-socket';
import { getChatPrefs, setChatPref, type ChatPref, type ChatPrefPatch } from '@/lib/api/dehub/chat-prefs';
import { deleteConversation as clearConversationMessages } from '@/lib/api/dehub/dm';
import { messagesKeys, peerAddressForConversation } from '@/hooks/use-messages';
import { clearEncryptedChats, registerConversationPeerResolver, setEncryptedChats } from '@/lib/dm-e2ee/encrypt-choice';
import { setTranslateOutChats } from '@/lib/dm-translate-out';
import type { DeHubConversation } from '@/lib/api/dehub';

const KEY = ['dm-chat-prefs'] as const;
const FOREVER = '2999-12-31T00:00:00.000Z';

function applyPatch(prev: ChatPref | undefined, id: string, patch: ChatPrefPatch): ChatPref {
  const now = new Date().toISOString();
  const next: ChatPref = prev ?? { conversationId: id, pinnedAt: null, archivedAt: null, mutedUntil: null, markedUnread: false };
  return {
    ...next,
    ...(patch.pinned !== undefined ? { pinnedAt: patch.pinned ? now : null } : {}),
    ...(patch.archived !== undefined ? { archivedAt: patch.archived ? now : null, ...(patch.archived ? { pinnedAt: null } : {}) } : {}),
    ...(patch.unread !== undefined ? { markedUnread: patch.unread } : {}),
    ...(patch.listed !== undefined ? { listedAt: patch.listed ? now : null } : {}),
    ...(patch.encrypted !== undefined ? { encryptedAt: patch.encrypted ? now : null } : {}),
    ...(patch.translateOut !== undefined ? { translateOutAt: patch.translateOut ? now : null } : {}),
    ...(patch.seenReactions ? { reactions: null } : {}),
    ...(patch.mutedUntil !== undefined ? { mutedUntil: patch.mutedUntil === 'forever' ? FOREVER : patch.mutedUntil } : {}),
  };
}

/**
 * Your own pins, archives, mutes and "marked unread" flags, saved on the
 * server so they follow you between devices. Changes show at once and roll
 * back if the save fails.
 */
export function useChatPrefs() {
  const { isAuthenticated, walletAddress } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: getChatPrefs,
    enabled: isAuthenticated,
    staleTime: 60_000,
    // Reactions to your messages show in the list without a reload.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Someone reacted in a DM: fetch the list's reaction badges now.
  useEffect(() => {
    if (!isAuthenticated) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onDmReactionUpdated((d) => {
      if (!d.added || !d.by || d.by.toLowerCase() === (walletAddress || '').toLowerCase()) return;
      clearTimeout(timer);
      timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: KEY }), 600);
    });
    return () => { clearTimeout(timer); off(); };
  }, [isAuthenticated, walletAddress, queryClient]);

  // Sending reads "Encrypt chat" from here (see encrypt-choice).
  useEffect(() => {
    registerConversationPeerResolver((id) => peerAddressForConversation(queryClient, id, walletAddress));
  }, [queryClient, walletAddress]);
  useEffect(() => {
    if (!isAuthenticated) { clearEncryptedChats(); setTranslateOutChats(null); }
    else if (data) { setEncryptedChats(data); setTranslateOutChats(data); }
  }, [isAuthenticated, data]);

  const byId = useMemo(() => {
    const map = new Map<string, ChatPref>();
    for (const p of data ?? []) map.set(p.conversationId, p);
    return map;
  }, [data]);

  const update = useCallback(async (id: string, patch: ChatPrefPatch) => {
    const before = queryClient.getQueryData<ChatPref[]>(KEY) ?? [];
    const prev = before.find((p) => p.conversationId === id);
    const next = applyPatch(prev, id, patch);
    queryClient.setQueryData<ChatPref[]>(KEY, [...before.filter((p) => p.conversationId !== id), next]);
    if (patch.encrypted !== undefined) setEncryptedChats(queryClient.getQueryData<ChatPref[]>(KEY));
    if (patch.translateOut !== undefined) setTranslateOutChats(queryClient.getQueryData<ChatPref[]>(KEY));
    try {
      const saved = await setChatPref(id, patch);
      queryClient.setQueryData<ChatPref[]>(KEY, (cur = []) => [...cur.filter((p) => p.conversationId !== id), saved]);
    } catch {
      queryClient.setQueryData<ChatPref[]>(KEY, before);
      setEncryptedChats(before);
      setTranslateOutChats(before);
      toast.error(t('chatMenu.saveFailed', "Couldn't save that, try again"));
    }
  }, [queryClient, t]);

  /** Clear a chat's waiting reactions (it is open). Only calls out when there are some. */
  const seeReactions = useCallback((id: string) => {
    if (!byId.get(id)?.reactions) return;
    queryClient.setQueryData<ChatPref[]>(KEY, (cur = []) => cur.map((p) => (p.conversationId === id ? { ...p, reactions: null } : p)));
    // Quiet on failure: the badge just comes back on the next refresh.
    setChatPref(id, { seenReactions: true }).catch(() => undefined);
  }, [byId, queryClient]);

  return { byId, update, seeReactions };
}

/** True while a mute is still running. */
export function isMuted(pref: ChatPref | undefined): boolean {
  return !!pref?.mutedUntil && new Date(pref.mutedUntil).getTime() > Date.now();
}

/**
 * Archived, and nothing new has arrived since. A new message brings an
 * archived chat back into the list unless it is also muted.
 */
export function isArchived(pref: ChatPref | undefined, lastMessageAt?: string | null): boolean {
  if (!pref?.archivedAt) return false;
  if (isMuted(pref)) return true;
  if (!lastMessageAt) return true;
  return new Date(lastMessageAt).getTime() <= new Date(pref.archivedAt).getTime();
}

/** "Clear history": every message in the chat disappears for you only. */
export function useClearChatHistory() {
  const { walletAddress } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useCallback(async (conv: DeHubConversation) => {
    try {
      await clearConversationMessages(conv.id, walletAddress || undefined);
      queryClient.removeQueries({ queryKey: messagesKeys.messages(conv.id) });
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
      toast.success(t('chatMenu.cleared', 'History cleared'));
    } catch {
      toast.error(t('chatMenu.clearFailed', "Couldn't clear history, try again"));
    }
  }, [walletAddress, queryClient, t]);
}
