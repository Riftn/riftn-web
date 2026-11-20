import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getChatReadPosition } from '@/lib/api/dehub/read-position';
import { createPublicChatUnreadStore, type PublicChatUnreadMessage } from '@/lib/public-chat-unread-store';

export const publicChatUnread = createPublicChatUnreadStore({
  read: (key) => localStorage.getItem(key),
  write: (key, value) => localStorage.setItem(key, value),
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key.startsWith('dehub_public_chat_unread:')) publicChatUnread.refresh();
  });
}

/** Same chat id and query key as the room's own read spot (useChatReadPosition). */
const PUBLIC_CHAT_ID = 'live:global';

const readers = new Map<string, number>();

export function recordPublicChatUnread(account: string, message: PublicChatUnreadMessage) {
  const added = publicChatUnread.record(account, message);
  if (!document.hidden && (readers.get(account.toLowerCase()) || 0) > 0) {
    publicChatUnread.markRead(account);
  }
  return added;
}

/**
 * Mounted once (next to the Public Chat alerts). The room opens on the spot
 * saved on the server, shared with the app, so the badge drops whatever was
 * already read there. Without it the row said 97 while the room said 19.
 */
export function usePublicChatReadSync() {
  const { isAuthenticated, walletAddress } = useAuth();
  const account = isAuthenticated ? walletAddress || '' : '';
  const { data } = useQuery({
    queryKey: ['chat-read-position', PUBLIC_CHAT_ID],
    queryFn: () => getChatReadPosition(PUBLIC_CHAT_ID),
    enabled: !!account,
    staleTime: 30_000,
    refetchInterval: 60_000,
    gcTime: 30 * 60_000,
    retry: 0,
  });
  const spotAt = Date.parse(data?.at || '');
  useEffect(() => {
    if (account && Number.isFinite(spotAt)) publicChatUnread.catchUp(account, spotAt);
  }, [account, spotAt]);
}

export function usePublicChatUnreadCount() {
  const { isAuthenticated, walletAddress } = useAuth();
  const account = isAuthenticated ? walletAddress || '' : '';
  return useSyncExternalStore(publicChatUnread.subscribe, () => publicChatUnread.count(account), () => 0);
}

/** Hidden cached pages and responsive sidebars must never acknowledge a room. */
export function usePublicChatReading(active: boolean, surface?: RefObject<HTMLElement>) {
  const { isAuthenticated, walletAddress } = useAuth();
  useEffect(() => {
    if (!active || !isAuthenticated || !walletAddress) return;
    const account = walletAddress.toLowerCase();
    let inView = !surface;
    let registered = false;
    const sync = () => {
      const reading = inView && !document.hidden;
      if (reading === registered) return;
      registered = reading;
      readers.set(account, Math.max(0, (readers.get(account) || 0) + (reading ? 1 : -1)));
      if (reading) publicChatUnread.markRead(account);
    };
    const observer = surface?.current ? new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    }) : null;
    if (surface?.current) observer?.observe(surface.current);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      if (registered) readers.set(account, Math.max(0, (readers.get(account) || 0) - 1));
    };
  }, [active, isAuthenticated, walletAddress, surface]);
}
