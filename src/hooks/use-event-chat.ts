import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Event Chat Hook
 * ================
 * Realtime chat for event pages. Mirrors community chat pattern.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { translateCopy as _translateCopy } from '@/i18n/copy';

export interface EventChatMessage {
  id: string;
  event_id: string;
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  content: string;
  message_type: string;
  image_url: string | null;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  reply_to?: {
    id: string;
    content: string;
    sender_name: string;
  };
}

const QUERY_KEY = 'event-chat-messages';

export function useEventChat(eventId: string | undefined, restricted = false) {
  const { t: _copy } = _useCopy();
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();

  const { data: rawMessages = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, eventId, walletAddress?.toLowerCase()],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await withWalletHeader(supabase
        .from('event_chat_messages' as any)
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(200), walletAddress);
      if (error) throw error;
      // The newest 200, shown oldest first.
      return ((data || []) as unknown as EventChatMessage[]).reverse();
    },
    enabled: !!eventId,
    refetchInterval: restricted ? 5000 : false,
    staleTime: 30_000,
  });

  // Resolve reply_to
  const messages: EventChatMessage[] = rawMessages.map(msg => {
    if (!msg.reply_to_id) return msg;
    const parent = rawMessages.find(m => m.id === msg.reply_to_id);
    if (!parent) return msg;
    return {
      ...msg,
      reply_to: {
        id: parent.id,
        content: parent.content || (parent.message_type === 'gif' ? 'GIF' : _translateCopy("copy.d357175cfe89", { defaultValue: "Media" })),
        sender_name: parent.display_name || parent.username || _translateCopy("copy.b512d97e7cbf", { defaultValue: "User" }),
      },
    };
  });

  // Realtime
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`event-chat-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_chat_messages',
          filter: `event_id=eq.${eventId}`,
        },
        () => { void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, eventId, walletAddress?.toLowerCase()] }); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') queryClient.invalidateQueries({ queryKey: [QUERY_KEY, eventId, walletAddress?.toLowerCase()] });
      });

    return () => { supabase.removeChannel(channel); };
  }, [eventId, queryClient, walletAddress]);

  const sendMessage = useCallback(async (
    content: string,
    messageType: string = 'text',
    imageUrl?: string,
    replyToId?: string,
    userProfile?: { username?: string; displayName?: string; avatarUrl?: string; badgeBalance?: number }
  ) => {
    if (!eventId || !walletAddress) throw new Error(_copy("copy.bc30560b2f21", { defaultValue: "Sign in to send a message" }));
    const msg = {
      event_id: eventId,
      wallet_address: walletAddress.toLowerCase(),
      username: userProfile?.username || null,
      display_name: userProfile?.displayName || null,
      avatar_url: userProfile?.avatarUrl || null,
      badge_balance: userProfile?.badgeBalance || null,
      content,
      message_type: messageType,
      image_url: imageUrl || null,
      reply_to_id: replyToId || null,
      reactions: {},
    };

    const { error } = await withWalletHeader(
      supabase.from('event_chat_messages' as any).insert(msg as any),
      walletAddress
    );
    if (error) {
      console.error('[EventChat] Send error:', error);
      toast.error(_copy("copy.66b8e077d85f", { defaultValue: "Failed to send message" }));
      throw error;
    }
    await queryClient.invalidateQueries({ queryKey: [QUERY_KEY, eventId, walletAddress.toLowerCase()] });
  }, [eventId, walletAddress, queryClient, _copy]);

  const setReaction = useCallback(async (messageId: string, emoji: string, add: boolean) => {
    if (!walletAddress || !eventId) return;
    const { error } = await withWalletHeader(supabase.rpc('set_event_chat_reaction' as any, {
      p_event: eventId, p_message: messageId, p_emoji: emoji, p_add: add,
    } as any), walletAddress);
    if (error) toast.error(_copy('events.reactionFailed', { defaultValue: 'Could not update reaction' }));
    await queryClient.invalidateQueries({ queryKey: [QUERY_KEY, eventId, walletAddress.toLowerCase()] });
  }, [walletAddress, eventId, queryClient, _copy]);
  const addReaction = useCallback((id: string, emoji: string) => setReaction(id, emoji, true), [setReaction]);
  const removeReaction = useCallback((id: string, emoji: string) => setReaction(id, emoji, false), [setReaction]);

  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!walletAddress || !eventId) return false;
    const trimmed = newContent.trim();
    if (!trimmed) return false;

    queryClient.setQueryData<EventChatMessage[]>(
      [QUERY_KEY, eventId, walletAddress?.toLowerCase()],
      (old = []) => old.map(m => m.id === messageId ? { ...m, content: trimmed } : m)
    );

    const { error } = await withWalletHeader(
      supabase.from('event_chat_messages' as any).update({ content: trimmed } as any).eq('id', messageId).eq('wallet_address', walletAddress.toLowerCase()),
      walletAddress
    );
    if (error) {
      console.error('[EventChat] Edit error:', error);
      toast.error(_copy("copy.da8e926af644", { defaultValue: "Failed to edit message" }));
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, eventId, walletAddress?.toLowerCase()] });
      return false;
    }
    return true;
  }, [walletAddress, eventId, queryClient, _copy]);

  return { messages, isLoading, sendMessage, editMessage, addReaction, removeReaction };
}
