/**
 * Search for group, channel and community chats, in the shape the shared chat
 * search (components/app/chat/ChatSearch) reads, so the community chat gets
 * the same search box, people list and result stepping as the public chat.
 * Reads the table directly under the reader's own row-level access: a private
 * community's history stays members-only.
 */
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import type { LiveChatMessage, LiveChatSearchPerson } from '@/lib/api/dehub/livechat';

const PAGE = 30;
/** How far back the "everyone in this chat" list looks. */
const PEOPLE_WINDOW = 1000;

interface Row {
  id: string;
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  content: string;
  message_type: string;
  image_url: string | null;
  created_at: string;
}

export interface CommunitySearchPage {
  messages: LiveChatMessage[];
  people: LiveChatSearchPerson[];
  hasMore: boolean;
  total: number | null;
}

/** Older-page cursor: the time of the last result, by its id. */
const cursorAt = new Map<string, string>();

const likeEscape = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export function toLiveChatMessage(row: Row, roomId: string): LiveChatMessage {
  return {
    id: row.id,
    roomId,
    content: row.content || '',
    messageType: row.message_type,
    imageUrl: row.image_url || undefined,
    sender: {
      address: row.wallet_address,
      username: row.username || undefined,
      displayName: row.display_name || undefined,
      avatarUrl: row.avatar_url || undefined,
      badgeBalance: row.badge_balance ?? undefined,
    },
    createdAt: row.created_at,
  };
}

/** Everyone who has written here (recent window), most messages first. */
export function peopleFromRows(rows: Pick<Row, 'wallet_address' | 'username' | 'display_name' | 'avatar_url'>[], q = ''): LiveChatSearchPerson[] {
  const by = new Map<string, LiveChatSearchPerson>();
  for (const r of rows) {
    const address = r.wallet_address?.toLowerCase();
    if (!address) continue;
    const p = by.get(address);
    if (p) { p.messageCount = (p.messageCount ?? 0) + 1; continue; }
    by.set(address, {
      address,
      username: r.username || undefined,
      displayName: r.display_name || undefined,
      avatarUrl: r.avatar_url || undefined,
      messageCount: 1,
    } as LiveChatSearchPerson);
  }
  const needle = q.trim().toLowerCase().replace(/^@/, '');
  return [...by.values()]
    .filter((p) => !needle || [p.username, p.displayName].some((v) => v?.toLowerCase().includes(needle)))
    .sort((a, b) => (b.messageCount ?? 0) - (a.messageCount ?? 0))
    .slice(0, 50);
}

export async function searchCommunityChat(
  communityId: string,
  params: { q?: string; from?: string; before?: string },
  walletAddress: string | null | undefined,
): Promise<CommunitySearchPage> {
  const q = (params.q ?? '').trim();
  let query = supabase
    .from('community_chat_messages')
    .select('id,wallet_address,username,display_name,avatar_url,badge_balance,content,message_type,image_url,created_at', { count: params.before ? undefined : 'exact' })
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE + 1);
  if (q) query = query.ilike('content', `%${likeEscape(q)}%`);
  if (params.from) query = query.eq('wallet_address', params.from.toLowerCase());
  const at = params.before ? cursorAt.get(params.before) : undefined;
  if (params.before && at) query = query.lt('created_at', at);

  const peopleQuery = !params.before && !params.from
    ? withWalletHeader(
        supabase
          .from('community_chat_messages')
          .select('wallet_address,username,display_name,avatar_url')
          .eq('community_id', communityId)
          .order('created_at', { ascending: false })
          .limit(PEOPLE_WINDOW),
        walletAddress ?? null,
      )
    : null;

  const [{ data, error, count }, peopleRes] = await Promise.all([
    withWalletHeader(query, walletAddress ?? null),
    peopleQuery ?? Promise.resolve(null),
  ]);
  if (error) throw error;
  const rows = ((data ?? []) as Row[]);
  const page = rows.slice(0, PAGE);
  for (const r of page) cursorAt.set(r.id, r.created_at);
  return {
    messages: page.map((r) => toLiveChatMessage(r, communityId)),
    people: peopleRes && !(peopleRes as any).error ? peopleFromRows(((peopleRes as any).data ?? []) as Row[], q) : [],
    hasMore: rows.length > PAGE,
    total: typeof count === 'number' ? count : null,
  };
}
