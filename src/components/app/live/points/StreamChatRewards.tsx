import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getStreamRewards } from '@/lib/api/dehub/live-rewards';
import { watchLiveRoomEvents } from '@/lib/api/dehub/stream-presence';
import { PointsIcon } from './PointsIcon';

export function StreamChatRewards({ streamId }: { streamId: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['live-rewards', streamId],
    queryFn: () => getStreamRewards(streamId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const room = watchLiveRoomEvents(streamId, event => {
      if (event.type === 'rewardsUpdated' || event.type === 'reward') {
        void qc.invalidateQueries({ queryKey: ['live-rewards', streamId] });
      }
    });
    return () => room.leave();
  }, [streamId, qc]);

  const recent = data?.recentRedemptions ?? [];
  if (!data?.live || (!data.rewards.length && !recent.length)) return null;
  return (
    <section data-stream-chat-rewards aria-label={t('livePoints.title')}
      className="my-1 min-w-0 shrink-0 space-y-1 rounded-lg bg-black/55 px-2 py-1.5 text-xs text-white">
      {data.rewards.length > 0 && (
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-semibold">{t('livePoints.rewards')}</span>
          <ul aria-label={t('livePoints.rewards')} className="flex min-w-0 gap-3 overflow-x-auto">
            {data.rewards.map(r => (
              <li key={r.id} className="flex shrink-0 items-center gap-1">
                <span dir="auto">{r.title}</span>
                <PointsIcon className="h-3 w-3" />
                <span className="tabular-nums">{r.cost.toLocaleString(i18n.language)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recent.length > 0 && (
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-semibold">{t('livePoints.studio.queue')}</span>
          <ul aria-label={t('livePoints.studio.queue')} className="flex min-w-0 gap-3 overflow-x-auto">
            {recent.map(r => <li key={r.id} dir="auto" className="shrink-0">{r.title}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
