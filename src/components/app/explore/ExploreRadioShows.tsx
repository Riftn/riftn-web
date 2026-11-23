/**
 * Explore's Radio row: radio shows on air now, then the ones coming up.
 *
 * A radio show is a stage its host opened as "Radio show" (see
 * lib/stage-radio-show.ts): mic, uploaded songs or playlists, and listeners
 * drop in any time. Live ones join in place; upcoming ones open their page,
 * where people can set a reminder. With nothing on, the row offers to start
 * one, so the feature can be found before anyone uses it.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ExploreListSection } from '@/components/app/explore/ExploreListSection';
import { LiveRipple } from '@/components/app/LiveRipple';
import { useStage, useLiveSpaces, useScheduledSpaces } from '@/contexts/StageContext';
import { useStableNavigate } from '@/hooks/use-stable-navigate';
import { isRadioShow } from '@/lib/stage-radio-show';
import { formatCount } from '@/lib/format-count';
import { dehubLinkFor } from '@/lib/dehub-links';
import Music from '@/components/ui/cut-icons/music';
import { cn } from '@/lib/utils';

const MAX_ROWS = 6;

export function ExploreRadioShows({ boxed = false }: { boxed?: boolean }) {
  const { t } = useTranslation();
  const navigate = useStableNavigate();
  const { joinSpace, openModal } = useStage();
  const live = useLiveSpaces();
  const scheduled = useScheduledSpaces();

  const rows = useMemo(() => {
    const onAir = live.filter(isRadioShow).map((s) => ({ space: s, live: true as const }));
    const soon = scheduled
      .filter(isRadioShow)
      .sort((a, b) => Date.parse(a.scheduled_at || '') - Date.parse(b.scheduled_at || ''))
      .map((s) => ({ space: s, live: false as const }));
    return [...onAir, ...soon].slice(0, MAX_ROWS);
  }, [live, scheduled]);

  const open = (row: (typeof rows)[number]) => {
    if (row.live) void joinSpace(row.space.id);
    else {
      const link = dehubLinkFor.stage(row.space);
      try {
        navigate(new URL(link).pathname);
      } catch {
        navigate(link);
      }
    }
  };

  return (
    <ExploreListSection
      icon="audio"
      title={t('stages.radioShow.row')}
      action={t('stages.radioShow.start')}
      onAction={() => openModal('create')}
      className={cn(boxed && 'rounded-2xl bg-zinc-900 px-4 sm:px-6')}
      data-explore-radio
    >
      {rows.length === 0 ? (
        <p className="py-2 text-[13px] text-zinc-500">{t('stages.radioShow.empty')}</p>
      ) : (
        rows.map((row) => {
          const s = row.space;
          const when = !row.live && s.scheduled_at ? format(new Date(s.scheduled_at), 'EEE d MMM, p') : null;
          return (
            <button key={s.id} type="button" onClick={() => open(row)} className="flex w-full items-center gap-3 py-2 text-left" data-radio-show-row>
              <LiveRipple live={row.live} size="sm" className="rounded-full">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
                  {s.cover_image_url || s.host_avatar ? (
                    <img src={s.cover_image_url || s.host_avatar || ''} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <Music className="h-4 w-4 text-zinc-300" />
                  )}
                </span>
              </LiveRipple>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-white">{s.title}</span>
                <span className="block truncate text-[12.5px] text-zinc-500">
                  {s.host_username ? `@${s.host_username}` : ''}
                  {row.live
                    ? ` · ${t('stages.radioShow.listening', { count: s.listener_count || 0, formatted: formatCount(s.listener_count || 0) })}`
                    : when ? ` · ${when}` : ''}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase',
                  row.live ? 'bg-red-500 text-white' : 'bg-white/10 text-zinc-300',
                )}
              >
                {row.live ? t('stages.radioShow.onAir') : t('stages.radioShow.soon')}
              </span>
            </button>
          );
        })
      )}
    </ExploreListSection>
  );
}
