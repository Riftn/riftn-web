import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getStoryShelf } from '@/lib/api/dehub/stories';
import { isHomeFeedRoute } from '@/lib/home-routes';

export const STORY_SHELF_KEY = 'story-shelf';

type ShelfData = Awaited<ReturnType<typeof getStoryShelf>> & { askedHosts?: string };

/**
 * The Glass Shelf for whoever is reading: refreshed every minute while Home is on screen.
 *
 * One cache entry per viewer, not one per live list. The live list lands after
 * the feed, and keying on it started a second request with nothing to show, so
 * the row disappeared and dropped back in late, pushing the first post down.
 * Live hosts only ask which faces may show as Live tiles, so a new list
 * refetches in place while the row stays up. The single entry is also what
 * query-persist saves, so a return visit paints the shelf with the feed.
 */
export function useStoryShelf(liveHosts: string, canSeeMature: boolean, enabled = true) {
  const { walletAddress, isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const onHome = isHomeFeedRoute(pathname);
  const hostsRef = useRef(liveHosts);
  hostsRef.current = liveHosts;
  const viewer = isAuthenticated ? walletAddress?.toLowerCase() ?? null : null;
  const query = useQuery<ShelfData>({
    queryKey: [STORY_SHELF_KEY, viewer, canSeeMature],
    queryFn: async () => {
      const askedHosts = hostsRef.current;
      return { ...(await getStoryShelf(askedHosts, isAuthenticated)), askedHosts };
    },
    enabled,
    // Signing in or a mature-content switch changes the key: keep the row up
    // while the new shelf loads instead of blanking it.
    placeholderData: (previous, previousQuery) => keepShelf(previous, previousQuery?.queryKey[1], viewer),
    staleTime: 30_000,
    refetchInterval: onHome ? 60_000 : false,
    retry: 1,
  });
  const { data, isFetching, isPlaceholderData, refetch } = query;
  useEffect(() => {
    if (enabled && data && !isFetching && !isPlaceholderData && (data.askedHosts ?? '') !== liveHosts) void refetch();
  }, [enabled, data, isFetching, isPlaceholderData, liveHosts, refetch]);
  return query;
}

/** The last shelf, minus a "your day" that belongs to someone else. */
export function keepShelf<T extends { shelf: Array<{ own?: boolean }> }>(previous: T | undefined, previousViewer: unknown, viewer: string | null): T | undefined {
  if (!previous || (previousViewer ?? null) === viewer) return previous;
  return { ...previous, shelf: previous.shelf.filter(entry => !entry.own) };
}

export function useRefreshStoryShelf() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: [STORY_SHELF_KEY] }), [qc]);
}
