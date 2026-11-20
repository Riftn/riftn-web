/**
 * The creator's rewards, paid for with the points a viewer earned watching
 * them. Tap a reward to pick it; one that asks for a message opens a box;
 * Redeem spends the points and puts a line in the stream's chat.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  redeemErrorKey,
  redeemReward,
  REWARD_TEXT_MAX,
  type LiveReward,
  type PointsBalance,
} from '@/lib/api/dehub/live-rewards';
import { PointsIcon } from './PointsIcon';

import { formatCount } from '@/lib/format-count';
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streamId: string;
  balance: PointsBalance;
  rewards: LiveReward[];
  loadingRewards?: boolean;
}

export function RewardsSheet({ open, onOpenChange, streamId, balance, rewards, loadingRewards }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState('');
  const fmt = (n: number) => formatCount(n);

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setText('');
    }
  }, [open]);

  const reward = rewards.find((r) => r.id === picked) ?? null;
  const redeem = useMutation({
    mutationFn: () => redeemReward(streamId, reward!.id, reward!.needsText ? text.trim() : undefined),
    onSuccess: (res) => {
      qc.setQueryData(['live-points', streamId], (prev: PointsBalance | undefined) =>
        prev ? { ...prev, balance: res.balance, spent: prev.spent + (reward?.cost ?? 0) } : prev,
      );
      void qc.invalidateQueries({ queryKey: ['live-points', streamId] });
      toast.success(t('livePoints.redeemed', { title: reward?.title ?? '' }));
      onOpenChange(false);
    },
    onError: (err) => toast.error(t(redeemErrorKey(err))),
  });

  const canAfford = (r: LiveReward) => balance.balance >= r.cost;
  const ready = !!reward && canAfford(reward) && (!reward.needsText || !!text.trim()) && !redeem.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[85dvh] px-4 pb-8" data-live-rewards-sheet>
        <DrawerHeader className="mb-3 border-b border-white/10 px-0">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <PointsIcon className="h-5 w-5" />
            {t('livePoints.title')}
          </DrawerTitle>
        </DrawerHeader>
        <div data-vaul-no-drag className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <span className="text-xs text-zinc-400">{t('livePoints.yourPoints')}</span>
            <span className="inline-flex items-center gap-1.5 text-base font-semibold tabular-nums text-white">
              <PointsIcon className="h-4 w-4" />
              {fmt(balance.balance)}
            </span>
          </div>

          {loadingRewards ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-zinc-400" />
          ) : rewards.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">{t('livePoints.noRewards')}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2" role="listbox" aria-label={t('livePoints.rewards')}>
              {rewards.map((r) => {
                const affordable = canAfford(r);
                const selected = r.id === picked;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => setPicked(selected ? null : r.id)}
                      data-reward-tile
                      className={cn(
                        'relative flex h-full min-h-[84px] w-full flex-col justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                        selected ? 'border-white/60 bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
                        !affordable && 'opacity-60',
                      )}
                    >
                      {/* The pick is a ring of the theme's ink on its own layer: themes repaint a button's fill and border. */}
                      <span
                        aria-hidden
                        data-reward-ring
                        className={cn(
                          'pointer-events-none absolute inset-0 rounded-xl text-white ring-2 ring-current transition-opacity duration-200',
                          selected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="line-clamp-2 text-sm font-medium text-white">{r.title}</span>
                      <span className="inline-flex items-center gap-1 text-xs tabular-nums text-zinc-300">
                        <PointsIcon className="h-3.5 w-3.5" />
                        {fmt(r.cost)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {reward?.needsText && (
            <div>
              <label htmlFor="live-reward-text" className="mb-1.5 block text-xs text-zinc-400">
                {t('livePoints.messageLabel')}
              </label>
              <Textarea
                id="live-reward-text"
                value={text}
                maxLength={REWARD_TEXT_MAX}
                rows={2}
                placeholder={t('livePoints.messagePlaceholder')}
                onChange={(e) => setText(e.target.value)}
                className="resize-none rounded-xl border-white/10 bg-white/5 text-sm text-white placeholder:text-zinc-500"
              />
            </div>
          )}

          {reward && (
            <button
              type="button"
              data-kit-button="primary"
              disabled={!ready}
              onClick={() => redeem.mutate()}
              className="flex w-full items-center justify-center gap-2 disabled:opacity-50"
            >
              {redeem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PointsIcon className="h-4 w-4" />}
              {canAfford(reward)
                ? t('livePoints.redeemFor', { cost: fmt(reward.cost) })
                : t('livePoints.needMore', { count: reward.cost - balance.balance, formatted: fmt(reward.cost - balance.balance) })}
            </button>
          )}

          <p className="text-xs leading-relaxed text-zinc-500">{t('livePoints.howToEarn')}</p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
