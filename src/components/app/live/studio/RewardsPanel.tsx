/**
 * Live Studio's channel points rewards: what viewers can spend the points they
 * earn watching you on, and the queue of what they redeemed.
 *
 * Rewards are things the creator does on stream. Points have no money value,
 * so nothing here pays out, sells or moves anything.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Trash2, Undo2 } from 'lucide-react';
import Plus from '@/components/ui/cut-icons/add';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { buildAvatarUrl } from '@/lib/media-url';
import {
  getMyRedemptions,
  getMyRewards,
  MAX_REWARDS,
  REWARD_COST_MAX,
  REWARD_TITLE_MAX,
  saveMyRewards,
  settleRedemption,
  type LiveReward,
} from '@/lib/api/dehub/live-rewards';
import { PointsIcon } from '../points/PointsIcon';

const draftId = () => Math.random().toString(36).slice(2, 10);

export function RewardsPanel() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const fmt = (n: number) => n.toLocaleString(i18n.language);

  const saved = useQuery({ queryKey: ['my-live-rewards'], queryFn: getMyRewards, staleTime: 60_000 });
  const [draft, setDraft] = useState<LiveReward[] | null>(null);
  useEffect(() => {
    if (saved.data && draft === null) setDraft(saved.data);
  }, [saved.data, draft]);
  const list = draft ?? [];
  const dirty = !!saved.data && JSON.stringify(saved.data) !== JSON.stringify(draft);
  const valid = list.every((r) => r.title.trim() && r.cost >= 1 && r.cost <= REWARD_COST_MAX);

  const save = useMutation({
    mutationFn: () => saveMyRewards(list.map((r) => ({ ...r, title: r.title.trim() }))),
    onSuccess: (rewards) => {
      qc.setQueryData(['my-live-rewards'], rewards);
      setDraft(rewards);
      toast.success(t('livePoints.studio.saved'));
    },
    onError: (err) => toast.error((err as Error)?.message || t('livePoints.studio.saveFailed')),
  });

  const queue = useQuery({ queryKey: ['my-live-redemptions'], queryFn: getMyRedemptions, refetchInterval: 10_000 });
  const settle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'done' | 'refund' }) => settleRedemption(id, action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-live-redemptions'] }),
    onError: () => toast.error(t('livePoints.studio.settleFailed')),
  });

  const update = (id: string, patch: Partial<LiveReward>) => setDraft((l) => (l ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = (reward?: Partial<LiveReward>) =>
    setDraft((l) => [...(l ?? []), { id: draftId(), title: '', cost: 100, needsText: false, enabled: true, ...reward }].slice(0, MAX_REWARDS));
  const starters = () =>
    setDraft([
      { id: draftId(), title: t('livePoints.starter.hi'), cost: 100, needsText: false, enabled: true },
      { id: draftId(), title: t('livePoints.starter.hydrate'), cost: 250, needsText: false, enabled: true },
      { id: draftId(), title: t('livePoints.starter.song'), cost: 500, needsText: true, enabled: true },
    ]);

  const pending = (queue.data ?? []).filter((r) => r.status === 'pending');
  const handled = (queue.data ?? []).filter((r) => r.status !== 'pending').slice(0, 5);

  return (
    <PageSection title={t('livePoints.studio.title')}>
      <p className="mb-3 text-xs text-zinc-500">{t('livePoints.studio.intro')}</p>

      {saved.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      ) : (
        <div className="space-y-2" data-rewards-editor>
          {list.length === 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-zinc-700 p-3">
              <span className="flex-1 text-sm text-zinc-400">{t('livePoints.studio.empty')}</span>
              <Button size="sm" variant="outline" onClick={starters}>
                {t('livePoints.studio.addStarters')}
              </Button>
            </div>
          )}
          {list.map((r) => (
            <div key={r.id} className="rounded-xl border border-zinc-800 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={r.title}
                  maxLength={REWARD_TITLE_MAX}
                  placeholder={t('livePoints.studio.namePlaceholder')}
                  aria-label={t('livePoints.studio.name')}
                  onChange={(e) => update(r.id, { title: e.target.value })}
                  className="min-w-0 flex-1"
                />
                <div className="relative w-28 flex-none">
                  <PointsIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={REWARD_COST_MAX}
                    value={r.cost || ''}
                    aria-label={t('livePoints.studio.cost')}
                    onChange={(e) => update(r.id, { cost: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                    className="pl-8 tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDraft((l) => (l ?? []).filter((x) => x.id !== r.id))}
                  aria-label={t('livePoints.studio.remove')}
                  className="flex-none rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-400">
                <label className="flex items-center gap-2">
                  <Switch checked={r.needsText} onCheckedChange={(v) => update(r.id, { needsText: v })} />
                  {t('livePoints.studio.needsText')}
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={r.enabled} onCheckedChange={(v) => update(r.id, { enabled: v })} />
                  {t('livePoints.studio.enabled')}
                </label>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={list.length >= MAX_REWARDS} onClick={() => add()}>
              <Plus className="mr-1 h-4 w-4" />
              {t('livePoints.studio.add')}
            </Button>
            <Button size="sm" disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('liveStudio.saving') : t('livePoints.studio.save')}
            </Button>
          </div>
        </div>
      )}

      <h4 className="mb-2 mt-5 text-sm font-semibold text-white">{t('livePoints.studio.queue')}</h4>
      {queue.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      ) : !pending.length && !handled.length ? (
        <p className="text-sm text-zinc-500">{t('livePoints.studio.queueEmpty')}</p>
      ) : (
        <ul className="space-y-2" data-redemption-queue>
          {[...pending, ...handled].map((r) => {
            const name = r.viewer.displayName || r.viewer.username || `${r.viewer.address.slice(0, 6)}…`;
            return (
              <li key={r.id} className={`flex items-start gap-3 rounded-xl border border-zinc-800 p-2.5 ${r.status === 'pending' ? '' : 'opacity-60'}`}>
                <img src={buildAvatarUrl(r.viewer.address, r.viewer.avatarImageUrl)} alt="" className="h-8 w-8 flex-none rounded-full object-cover" loading="lazy" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate text-white">
                    <span className="font-semibold">{name}</span> <span className="text-zinc-400">{t('livePoints.chatRedeemedShort')}</span>{' '}
                    <span className="font-medium">{r.title}</span>
                  </p>
                  {r.text && <p className="mt-0.5 break-words text-zinc-300">{r.text}</p>}
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs tabular-nums text-zinc-500">
                    <PointsIcon className="h-3 w-3" />
                    {fmt(r.cost)}
                    {r.status !== 'pending' && <span>· {t(r.status === 'done' ? 'livePoints.studio.done' : 'livePoints.studio.refunded')}</span>}
                  </p>
                </div>
                {r.status === 'pending' && (
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      disabled={settle.isPending}
                      onClick={() => settle.mutate({ id: r.id, action: 'done' })}
                      aria-label={t('livePoints.studio.markDone')}
                      title={t('livePoints.studio.markDone')}
                      className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={settle.isPending}
                      onClick={() => settle.mutate({ id: r.id, action: 'refund' })}
                      aria-label={t('livePoints.studio.refund')}
                      title={t('livePoints.studio.refund')}
                      className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageSection>
  );
}
