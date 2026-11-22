/**
 * Live Studio: let viewers give each other channel points.
 *
 * Off by default. When on, a viewer can tap another viewer's name in the live
 * chat and give them some of their points with this channel, up to the daily
 * limit set here, so points can't be farmed onto one account. The log below
 * shows who gave what.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SETTINGS_FIELD_CLASS } from '@/components/app/settings/SettingsRow';
import { buildAvatarUrl } from '@/lib/media-url';
import { formatCount } from '@/lib/format-count';
import {
  GIVING_CAP_MAX,
  getMyGifts,
  getMyGiving,
  personName,
  saveMyGiving,
  type PointsGiving,
} from '@/lib/api/dehub/live-rewards';
import { PointsIcon } from '../points/PointsIcon';

export function PointsGivingSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const saved = useQuery({ queryKey: ['my-points-giving'], queryFn: getMyGiving, staleTime: 60_000 });
  const [draft, setDraft] = useState<PointsGiving | null>(null);
  useEffect(() => {
    if (saved.data && draft === null) setDraft(saved.data);
  }, [saved.data, draft]);

  const save = useMutation({
    mutationFn: (next: PointsGiving) => saveMyGiving(next),
    onSuccess: (giving) => {
      qc.setQueryData(['my-points-giving'], giving);
      setDraft(giving);
      toast.success(t('livePoints.give.studio.saved'));
    },
    onError: (err) => toast.error((err as Error)?.message || t('livePoints.studio.saveFailed')),
  });

  const gifts = useQuery({
    queryKey: ['my-points-gifts'],
    queryFn: getMyGifts,
    enabled: !!draft?.enabled || !!saved.data?.enabled,
    refetchInterval: 15_000,
  });

  if (saved.isLoading || !draft) return <Loader2 className="mt-5 h-4 w-4 animate-spin text-zinc-400" />;
  const capValid = draft.dailyCap >= 1 && draft.dailyCap <= GIVING_CAP_MAX;
  const capDirty = !!saved.data && saved.data.dailyCap !== draft.dailyCap;

  return (
    <div className="mt-5" data-points-giving>
      <h4 className="mb-1 text-sm font-semibold text-white">{t('livePoints.give.studio.title')}</h4>
      <p className="mb-3 text-xs text-zinc-500">{t('livePoints.give.studio.intro')}</p>
      <div className="space-y-3 rounded-xl border border-zinc-800 p-3">
        <label className="flex items-center justify-between gap-3 text-sm text-white">
          <span>{t('livePoints.give.studio.switch')}</span>
          <Switch
            checked={draft.enabled}
            disabled={save.isPending}
            onCheckedChange={(enabled) => save.mutate({ ...draft, enabled })}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span className="flex-1">{t('livePoints.give.studio.cap')}</span>
          <div className="relative w-32 flex-none">
            <PointsIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={GIVING_CAP_MAX}
              value={draft.dailyCap || ''}
              aria-label={t('livePoints.give.studio.cap')}
              onChange={(e) => setDraft({ ...draft, dailyCap: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              className={`${SETTINGS_FIELD_CLASS} pl-8 tabular-nums`}
            />
          </div>
          <Button size="sm" disabled={!capDirty || !capValid || save.isPending} onClick={() => save.mutate(draft)}>
            {t('livePoints.studio.save')}
          </Button>
        </div>
      </div>

      {(draft.enabled || (gifts.data?.length ?? 0) > 0) && (
        <>
          <h4 className="mb-2 mt-4 text-sm font-semibold text-white">{t('livePoints.give.studio.log')}</h4>
          {gifts.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          ) : !gifts.data?.length ? (
            <p className="text-sm text-zinc-500">{t('livePoints.give.studio.logEmpty')}</p>
          ) : (
            <ul className="space-y-2" data-points-gift-log>
              {gifts.data.slice(0, 20).map((g) => (
                <li key={g.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 p-2.5 text-sm">
                  <img
                    src={buildAvatarUrl(g.from.address, g.from.avatarImageUrl)}
                    alt=""
                    className="h-7 w-7 flex-none rounded-full object-cover"
                    loading="lazy"
                  />
                  <p className="min-w-0 flex-1 truncate text-white">
                    <span className="font-semibold">{personName(g.from)}</span>{' '}
                    <span className="text-zinc-400">{t('livePoints.give.studio.gave')}</span>{' '}
                    <span className="font-semibold">{personName(g.to)}</span>
                  </p>
                  <span className="inline-flex flex-none items-center gap-1 text-xs tabular-nums text-zinc-300">
                    <PointsIcon className="h-3 w-3" />
                    {formatCount(g.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
