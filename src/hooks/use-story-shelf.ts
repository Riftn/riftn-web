import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getStoryShelf } from '@/lib/api/dehub/stories';
import { isHomeFeedRoute } from '@/lib/home-routes';

export const STORY_SHELF_KEY = 'story-shelf';

/** The Glass Shelf for whoever is reading: refreshed every minute while Home is on screen. */
export function useStoryShelf(liveHosts: string, canSeeMature: boolean, enabled = true) {
  const { walletAddress, isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const onHome = isHomeFeedRoute(pathname);
  return useQuery({
    queryKey: [STORY_SHELF_KEY, isAuthenticated ? walletAddress?.toLowerCase() : null, canSeeMature, liveHosts],
    queryFn: () => getStoryShelf(liveHosts, isAuthenticated),
    enabled,
    staleTime: 30_000,
    refetchInterval: onHome ? 60_000 : false,
    retry: 1,
  });
}

export function useRefreshStoryShelf() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: [STORY_SHELF_KEY] }), [qc]);
}
