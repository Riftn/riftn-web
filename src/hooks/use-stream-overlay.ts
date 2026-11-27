import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { PublicOverlay } from '@/lib/live-overlay/types';

export const streamOverlayKey = (streamId: string | null | undefined) => ['stream-overlay', streamId] as const;

/**
 * The creator's overlay for a stream. Refetched when they save (the layer
 * invalidates the key), never polled. The API loads inside the query because
 * the live card is on the boot path.
 */
export function useStreamOverlay(streamId: string | null | undefined, enabled: boolean) {
  return useQuery<PublicOverlay>({
    queryKey: streamOverlayKey(streamId),
    queryFn: async () => (await import('@/lib/api/dehub/live-overlay')).getStreamOverlay(String(streamId)),
    enabled: !!streamId && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/**
 * Streams whose creator turned the vertical view off. Same key and fetch as
 * useStreamOverlay, so the tiles read these from cache: the feed drops the
 * stream from both the grid and the swipe viewer, rather than the tile hiding
 * itself while the viewer still swiped onto a letterboxed slide.
 */
export function useVerticalOptOuts(streamIds: readonly string[]): ReadonlySet<string> {
  // Joined to a string so the result only changes when the set does: a new
  // Set every render would rebuild the feed's live list on every render.
  const offKey = useQueries({
    queries: streamIds.map((id) => ({
      queryKey: streamOverlayKey(id),
      queryFn: async () => (await import('@/lib/api/dehub/live-overlay')).getStreamOverlay(id),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
    combine: (results) =>
      results
        .map((r, i) => {
          const crop = (r.data as PublicOverlay | undefined)?.verticalCrop;
          return crop && !crop.enabled ? streamIds[i] : '';
        })
        .filter(Boolean)
        .join('\n'),
  });
  return useMemo(() => new Set(offKey ? offKey.split('\n') : []), [offKey]);
}
