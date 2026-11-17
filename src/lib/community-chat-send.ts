/**
 * Storing one line in a group, channel or community chat. The open chat
 * (use-community-chat) and the chat list's "reply to all" both send through
 * here, so a message looks and is checked the same wherever it was written.
 */
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

export interface CommunityChatSender {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  badgeBalance?: number;
}

export interface CommunityChatDraft {
  communityId: string;
  walletAddress: string;
  content: string;
  messageType?: string;
  imageUrl?: string;
  replyToId?: string;
  sender?: CommunityChatSender;
}

/** The row as it will be stored. */
export function communityChatRow(d: CommunityChatDraft) {
  return {
    community_id: d.communityId,
    wallet_address: d.walletAddress.toLowerCase(),
    username: d.sender?.username || null,
    display_name: d.sender?.displayName || null,
    avatar_url: d.sender?.avatarUrl || null,
    badge_balance: d.sender?.badgeBalance || null,
    content: d.content,
    message_type: d.messageType ?? 'text',
    image_url: d.imageUrl || null,
    reply_to_id: d.replyToId || null,
    reactions: {},
  };
}

/** Insert it. Resolves with the stored row; the database's own rules (slow mode, mutes, send rights) come back as the error. */
export async function insertCommunityChatMessage<T = unknown>(d: CommunityChatDraft): Promise<{ data: T | null; error: any }> {
  try {
    const { data, error } = await withWalletHeader(
      supabase
        .from('community_chat_messages')
        .insert(communityChatRow(d) as any)
        .select('*')
        .single(),
      d.walletAddress,
    );
    return { data: (data as T) ?? null, error };
  } catch (thrown) {
    return { data: null, error: thrown };
  }
}
