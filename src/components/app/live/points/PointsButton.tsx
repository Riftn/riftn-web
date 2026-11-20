/**
 * Channel points on a live stream: the viewer's balance with this creator as
 * a small button, and the creator's rewards in a sheet behind it.
 *
 * Two looks. `chip` sits in the chat panel's header beside "N watching";
 * `inline` sits inside the full-bleed composer, at the end of the empty
 * message box, which is where the thumb already is on a phone. Only for a
 * signed-in viewer of a stream that is on air; the creator manages theirs in
 * Live Studio.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getMyStreamPoints, getStreamRewards, compactPoints } from '@/lib/api/dehub/live-rewards';
import { watchLiveRoomEvents } from '@/lib/api/dehub/stream-presence';
import { PointsIcon } from './PointsIcon';
import { RewardsSheet } from './RewardsSheet';

interface Props {
  /** The stream's ObjectId (the /api/live/{id} one, not the tokenId). */
  streamId?: string;
  variant: 'chip' | 'inline';
  className?: string;
}

export function PointsButton({ streamId, variant, className }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { isAuthenticated, walletAddress } = useAuth();
  const enabled = !!streamId && isAuthenticated;

  const balance = useQuery({
    queryKey: ['live-points', streamId],
    queryFn: () => getMyStreamPoints(streamId!),
    enabled,
    // A point a minute: once a minute is as often as the number can move.
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  const rewards = useQuery({
    queryKey: ['live-rewards', streamId],
    queryFn: () => getStreamRewards(streamId!),
    enabled,
    staleTime: 60_000,
  });

  // The creator edits their rewards mid-stream: refetch rather than offer a stale one.
  useEffect(() => {
    if (!streamId) return;
    const room = watchLiveRoomEvents(streamId, (event) => {
      if (event.type === 'rewardsUpdated') void qc.invalidateQueries({ queryKey: ['live-rewards', streamId] });
    });
    return () => room.leave();
  }, [streamId, qc]);

  const data = balance.data;
  // Nothing to show on your own stream, or on one that is not on air.
  if (!enabled || !data || !data.live || (!!walletAddress && walletAddress.toLowerCase() === data.creator)) return null;

  const label = t('livePoints.buttonLabel', { count: data.balance, formatted: data.balance.toLocaleString(i18n.language) });
  const button =
    variant === 'chip' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        data-filter-chip
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/30 bg-gradient-to-br from-white/20 via-white/10 to-white/5 py-[5px] pl-2 pr-2.5 text-xs font-medium tabular-nums text-white shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)] backdrop-blur-xl transition-all hover:border-white/50',
          className,
        )}
      >
        <PointsIcon className="h-3.5 w-3.5" />
        <span>{compactPoints(data.balance, i18n.language)}</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        data-live-points
        className={cn(
          'inline-flex h-[30px] items-center gap-1 rounded-lg px-2 text-xs font-semibold tabular-nums text-white/90 transition-colors hover:bg-white/10',
          className,
        )}
      >
        <PointsIcon className="h-4 w-4" />
        <span>{compactPoints(data.balance, i18n.language)}</span>
      </button>
    );

  return (
    <>
      {button}
      <RewardsSheet
        open={open}
        onOpenChange={setOpen}
        streamId={streamId!}
        balance={data}
        rewards={rewards.data?.rewards ?? []}
        loadingRewards={rewards.isLoading}
      />
    </>
  );
}
