import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

/** How long after boot the socket opens, so it never competes with the first paint. */
export const LIVE_LIST_CONNECT_DELAY_MS = 2_500;
/**
 * Every open tab hears the same ping at the same moment. Spreading the re-read
 * over a second keeps a go-live from landing as one burst on `/api/live`,
 * and still reads as instant to anyone looking at the row.
 */
export const LIVE_LIST_REFRESH_SPREAD_MS = 900;

/**
 * Keep every live surface current the moment someone goes live or ends.
 *
 * The Moments row's live tiles, the Live now chip, the Livestreams row, the
 * Live tab and the live ring on faces all read the one `dehub-live` query.
 * It used to learn about a new live only from its one-minute poll, so a live
 * that started showed up to a minute late and an ended one kept its LIVE tile
 * as long. The backend now pings every socket when the list changes, and this
 * re-reads it. The Moments row follows by itself: a new set of live hosts
 * refetches the shelf in place.
 *
 * Session-wide and for signed-out visitors too; the poll stays as the backstop.
 */
export function useLiveListRealtime() {
  const queryClient = useQueryClient();
  const { walletAddress } = useAuth();

  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void queryClient.invalidateQueries({ queryKey: ['dehub-live'] });
      }, Math.floor(Math.random() * LIVE_LIST_REFRESH_SPREAD_MS));
    };

    const connectTimer = setTimeout(() => {
      void import('@/lib/api/dehub/live-list-socket')
        .then(({ watchLiveList }) => {
          if (disposed) return;
          stop = watchLiveList(refresh);
        })
        .catch(() => { /* realtime is a bonus; the poll still runs */ });
    }, LIVE_LIST_CONNECT_DELAY_MS);

    return () => {
      disposed = true;
      clearTimeout(connectTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      stop?.();
    };
    // A sign-in rotates the shared stream socket; follow it so a live being
    // watched and this ping keep sharing one connection.
  }, [queryClient, walletAddress]);
}
