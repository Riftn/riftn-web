/**
 * Newest line and unread number for each group, channel and community chat in
 * the Messages list, like a private chat row. Two small reads per chat (its
 * newest line, and a count of lines from others since you last read it),
 * refreshed every 30 seconds while the list is on screen.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { createRoomReadStore, type RoomLastLine } from '@/lib/room-chat-read';

export const roomRead = createRoomReadStore({
  read: (key) => localStorage.getItem(key),
  write: (key, value) => localStorage.setItem(key, value),
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key.startsWith('riftn.roomReadAt:')) roomRead.refresh();
  });
}

export interface RoomSummary {
  last: RoomLastLine | null;
  unread: number;
}

// The generated types lag the table; the reads are plain selects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const LINE_FIELDS = 'id,content,message_type,image_url,wallet_address,username,display_name,created_at';

async function readSummary(roomId: string, wallet: string): Promise<RoomSummary> {
  const { data } = await withWalletHeader(
    db.from('community_chat_messages').select(LINE_FIELDS)
      .eq('community_id', roomId).order('created_at', { ascending: false }).limit(1),
    wallet,
  );
  const last = (Array.isArray(data) ? data[0] : null) as RoomLastLine | null;
  const lastAt = last ? Date.parse(last.created_at) : NaN;
  const readAt = roomRead.get(wallet, roomId);
  if (readAt == null) {
    roomRead.seed(wallet, roomId, Number.isFinite(lastAt) ? lastAt : Date.now());
    return { last, unread: 0 };
  }
  if (!Number.isFinite(lastAt) || lastAt <= readAt) return { last, unread: 0 };
  const { count } = await withWalletHeader(
    db.from('community_chat_messages').select('id', { count: 'exact', head: true })
      .eq('community_id', roomId).gt('created_at', new Date(readAt).toISOString())
      .neq('wallet_address', wallet.toLowerCase()),
    wallet,
  );
  return { last, unread: count ?? 0 };
}

export function useRoomChatSummaries(roomIds: string[], walletAddress: string | null | undefined) {
  const wallet = (walletAddress || '').toLowerCase();
  const ids = [...new Set(roomIds)].sort();
  // Re-render when a chat is read so its number clears straight away.
  useSyncExternalStore(roomRead.subscribe, roomRead.version, () => 0);
  const { data } = useQuery({
    queryKey: ['room-chat-summaries', wallet, ids.join(',')],
    enabled: !!wallet && ids.length > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const out: Record<string, RoomSummary> = {};
      const results = await Promise.allSettled(ids.slice(0, 60).map((id) => readSummary(id, wallet)));
      results.forEach((r, i) => { if (r.status === 'fulfilled') out[ids[i]] = r.value; });
      return out;
    },
  });
  if (!data) return {} as Record<string, RoomSummary>;
  const out: Record<string, RoomSummary> = {};
  for (const [id, summary] of Object.entries(data)) {
    const readAt = roomRead.get(wallet, id);
    const lastAt = summary.last ? Date.parse(summary.last.created_at) : NaN;
    out[id] = readAt != null && Number.isFinite(lastAt) && lastAt <= readAt ? { ...summary, unread: 0 } : summary;
  }
  return out;
}

/** Mark a group chat read while it is open (and once more on the way out). */
export function useRoomChatReading(roomId: string | undefined, walletAddress: string | null | undefined, active: boolean) {
  useEffect(() => {
    const wallet = (walletAddress || '').toLowerCase();
    if (!active || !roomId || !wallet) return;
    const mark = () => { if (document.visibilityState === 'visible') roomRead.markRead(wallet, roomId); };
    mark();
    const timer = window.setInterval(mark, 10_000);
    document.addEventListener('visibilitychange', mark);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', mark);
      roomRead.markRead(wallet, roomId);
    };
  }, [roomId, walletAddress, active]);
}

/** The newest line in General Chat, for its row in the Messages list. */
export function usePublicChatLastLine(enabled: boolean): RoomLastLine | null {
  const { data } = useQuery({
    queryKey: ['public-chat-last-line'],
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    // Coming back to the tab or the Messages page always asks again, so the
    // row never sits on a line from before you left.
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
    queryFn: async () => {
      const { getLiveChatMessages } = await import('@/lib/api/dehub/livechat');
      const lines = await getLiveChatMessages('global', { limit: 10 });
      const newest = lines
        .filter((m) => m && m.messageType !== 'system' && !(m as { isDeleted?: boolean }).isDeleted)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      if (!newest) return null;
      return {
        content: newest.content,
        message_type: newest.audioUrl ? 'audio' : (newest.type || newest.messageType || 'text'),
        image_url: newest.imageUrl || null,
        wallet_address: newest.sender?.address || null,
        username: newest.sender?.username || null,
        display_name: newest.sender?.displayName || null,
        created_at: newest.createdAt,
      } as RoomLastLine;
    },
  });
  return data ?? null;
}
