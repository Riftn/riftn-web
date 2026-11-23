import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getChatReadPosition, saveChatReadPosition, type ChatReadPosition } from '@/lib/api/dehub/read-position';
import { isLaterSpot, type ReadSpot } from '@/lib/chat-read-position';

/** How long a chat waits for its saved spot before opening at the newest line. */
const WAIT_MS = 1500;
/** Saves at most this often while you scroll. */
const SAVE_EVERY_MS = 1200;

const keyFor = (chatId: string | null | undefined) => ['chat-read-position', chatId ?? null] as const;

/**
 * Where you left off in one chat (server-saved, follows you across devices).
 *
 * - `opening` is the spot as it stood when the chat opened. It never moves
 *   while the chat stays open, so the "Unread messages" line stays put.
 * - `ready` turns true once the spot is known (or after a short wait).
 * - `report(id, at)` is called with the newest line on screen; the furthest
 *   one is saved, a little after scrolling settles and when you leave.
 */
export function useChatReadPosition(chatId: string | null | undefined) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !!chatId && isAuthenticated;
  const query = useQuery({
    queryKey: keyFor(chatId),
    queryFn: () => getChatReadPosition(chatId!),
    enabled,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: 30 * 60_000,
    retry: 0,
  });

  const [timedOutChat, setTimedOutChat] = useState<string | null>(null);
  useEffect(() => {
    setTimedOutChat(null);
    if (!enabled) return;
    const timer = window.setTimeout(() => setTimedOutChat(chatId!), WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, chatId]);

  const fetched = query.isFetchedAfterMount || query.isError;
  const ready = !enabled || fetched || timedOutChat === chatId;

  // Frozen at open: our own saves must not move the line under the reader.
  const openingRef = useRef<{ chatId: string | null | undefined; spot: ReadSpot | null; taken: boolean }>({ chatId, spot: null, taken: false });
  if (openingRef.current.chatId !== chatId) openingRef.current = { chatId, spot: null, taken: false };
  if (enabled && !openingRef.current.taken && ready) {
    const data = query.data as ChatReadPosition | null | undefined;
    openingRef.current = { chatId, spot: data ? { messageId: data.messageId, at: data.at } : null, taken: true };
  }

  // Saving: keep the furthest line seen, send it once things settle.
  const furthestRef = useRef<ReadSpot | null>(null);
  const sentRef = useRef<ReadSpot | null>(null);
  const timerRef = useRef<number | null>(null);
  const chatRef = useRef(chatId);

  const flush = useCallback(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    const id = chatRef.current;
    const spot = furthestRef.current;
    if (!id || !spot || !isLaterSpot(spot, sentRef.current)) return;
    sentRef.current = spot;
    queryClient.setQueryData(keyFor(id), (old: ChatReadPosition | null | undefined) =>
      old && !isLaterSpot(spot, old) ? old : { chatId: id, messageId: spot.messageId, at: spot.at, savedAt: new Date().toISOString() });
    void saveChatReadPosition(id, spot.messageId, spot.at).catch(() => {
      // Let the next report try again.
      if (sentRef.current === spot) sentRef.current = null;
    });
  }, [queryClient]);

  useEffect(() => {
    // New chat: send what the last one had, start clean.
    if (chatRef.current !== chatId) flush();
    chatRef.current = chatId;
    const server = query.data as ChatReadPosition | null | undefined;
    furthestRef.current = server ? { messageId: server.messageId, at: server.at } : null;
    sentRef.current = furthestRef.current;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // A spot saved on another device that is further on than this one.
  useEffect(() => {
    const server = query.data as ChatReadPosition | null | undefined;
    if (!server) return;
    const spot = { messageId: server.messageId, at: server.at };
    if (isLaterSpot(spot, furthestRef.current)) furthestRef.current = spot;
    if (isLaterSpot(spot, sentRef.current)) sentRef.current = spot;
  }, [query.data]);

  const report = useCallback((messageId: string, at: string) => {
    if (!enabled || !messageId || !at) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const spot = { messageId, at };
    if (!isLaterSpot(spot, furthestRef.current)) return;
    furthestRef.current = spot;
    if (!timerRef.current) timerRef.current = window.setTimeout(flush, SAVE_EVERY_MS);
  }, [enabled, flush]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  return { opening: openingRef.current.spot, ready, report, enabled };
}
