/**
 * One poll of a live's co-stream room for everything a viewer sees of it:
 * the invite card on the picture and the Ask to join button in the action
 * row read the same query, so the room is fetched once however many parts
 * show it. Every 15s for an ordinary viewer, every 3s once they have asked,
 * been asked, or a battle is running.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { battlePhase, getCoStreamForStream, type CoStreamState } from '@/lib/live/costream-api';

const IDLE_POLL_MS = 15_000;
const ACTIVE_POLL_MS = 3000;

export function coStreamViewerKey(streamId: string, owner?: string | null) {
  return ['costream-viewer', streamId, owner?.toLowerCase() ?? null] as const;
}

function isPending(state: CoStreamState | null | undefined, me: string | null) {
  if (!state) return false;
  const seat = me ? state.seats.find((s) => s.wallet === me) : undefined;
  return seat?.status === 'requested' || seat?.status === 'invited' || seat?.status === 'accepted'
    || battlePhase(state.room) !== 'idle';
}

export function useCoStreamViewer(streamId: string | undefined, owner?: string | null, paused = false) {
  const { walletAddress } = useAuth();
  const me = walletAddress?.toLowerCase() ?? null;
  const queryClient = useQueryClient();
  const key = coStreamViewerKey(streamId ?? '', owner);

  const query = useQuery({
    queryKey: key,
    queryFn: () => getCoStreamForStream(streamId!, owner).catch(() => null),
    enabled: !!streamId && !paused,
    staleTime: 2000,
    refetchInterval: (q) => (isPending(q.state.data as CoStreamState | null | undefined, me) ? ACTIVE_POLL_MS : IDLE_POLL_MS),
    refetchIntervalInBackground: false,
  });

  const state = query.data ?? null;
  const seat = me && state ? state.seats.find((s) => s.wallet === me) ?? null : null;
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, streamId, owner],
  );

  return { state, seat, me, refresh };
}
