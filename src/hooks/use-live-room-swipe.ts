import { useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDeHubLive } from '@/hooks/use-dehub-feed';
import { getBlockList } from '@/lib/api/dehub';
import { liveSwipeRoomIds } from '@/lib/live/room-swipe';

export function useLiveRoomSwipe(enabled: boolean, streamId: string | undefined, signedIn: boolean) {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { data } = useDeHubLive({ enabled });
  const { data: blockList } = useQuery({
    queryKey: ['block-list'],
    queryFn: getBlockList,
    enabled: enabled && signedIn,
    staleTime: 5 * 60_000,
  });
  const rooms = useMemo(() => {
    if (!enabled || !data || (signedIn && !blockList)) return [];
    const blocked = new Set(blockList?.map(user => user.address.toLowerCase()));
    return liveSwipeRoomIds(data.pages.flatMap(page => page.data), blocked);
  }, [blockList, data, enabled, signedIn]);
  const roomIndex = streamId ? rooms.indexOf(streamId) : -1;
  const canSwitchRoom = roomIndex >= 0 && rooms.length > 1;
  const switching = useRef(false);
  const switchRoom = useCallback((direction: 1 | -1, controlsHidden: boolean) => {
    if (!canSwitchRoom || switching.current) return;
    const destination = rooms[(roomIndex + direction + rooms.length) % rooms.length];
    switching.current = true;
    navigate(`/app/post/${destination}`, {
      replace: true,
      state: { fromFeed: state?.fromFeed === true, liveControlsHidden: controlsHidden },
    });
  }, [canSwitchRoom, navigate, roomIndex, rooms, state]);
  return { canSwitchRoom, switchRoom };
}
