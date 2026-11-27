/**
 * Give some of your channel points to another viewer.
 *
 * Only on a channel whose creator switched giving on in Live Studio, and only
 * up to their daily limit. Opened from a viewer's name in the live chat (the
 * name comes filled in) or from the points sheet (type a handle).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format-count';
import { giveErrorKey, givePoints, type PointsBalance } from '@/lib/api/dehub/live-rewards';
import { PointsIcon } from './PointsIcon';

const QUICK_AMOUNTS = [10, 50, 100, 250];

export interface GiveTarget {
  /** Handle or address the server resolves. */
  to: string;
  /** What to show for them. */
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streamId: string;
  balance?: number;
  dailyCap: number;
  target?: GiveTarget | null;
}

export function GivePointsSheet({ open, onOpenChange, streamId, balance, dailyCap, target }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState(50);

  useEffect(() => {
    if (open) {
      setTo(target?.to ?? '');
      setAmount(Math.min(50, dailyCap));
    }
  }, [open, target, dailyCap]);

  const give = useMutation({
    mutationFn: () => givePoints(streamId, to.trim(), amount),
    onSuccess: (res) => {
      qc.setQueryData(['live-points', streamId], (prev: PointsBalance | undefined) =>
        prev ? { ...prev, balance: res.balance } : prev,
      );
      void qc.invalidateQueries({ queryKey: ['live-points', streamId] });
      toast.success(
        t('livePoints.give.sent', {
          amount: formatCount(amount),
          name: target?.name || to.trim(),
        }),
      );
      onOpenChange(false);
    },
    onError: (err) => {
      const key = giveErrorKey(err);
      toast.error(key === 'livePoints.give.limit' ? (err as Error).message : t(key));
    },
  });

  const max = Math.min(dailyCap, balance ?? dailyCap);
  const valid = !!to.trim() && amount >= 1 && amount <= dailyCap && (balance == null || amount <= balance);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[85dvh] px-4 pb-8" data-give-points-sheet>
        <DrawerHeader className="mb-3 border-b border-white/10 px-0">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <PointsIcon className="h-5 w-5" />
            {target ? t('livePoints.give.titleTo', { name: target.name }) : t('livePoints.give.title')}
          </DrawerTitle>
        </DrawerHeader>
        <div data-vaul-no-drag className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
          {balance != null && (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <span className="text-xs text-zinc-400">{t('livePoints.yourPoints')}</span>
              <span className="inline-flex items-center gap-1.5 text-base font-semibold tabular-nums text-white">
                <PointsIcon className="h-4 w-4" />
                {formatCount(balance)}
              </span>
            </div>
          )}

          {!target && (
            <div>
              <label htmlFor="give-points-to" className="mb-1.5 block text-xs text-zinc-400">
                {t('livePoints.give.who')}
              </label>
              <Input
                id="give-points-to"
                value={to}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="@username"
                onChange={(e) => setTo(e.target.value)}
                className="rounded-xl border-white/10 bg-white/5 text-sm text-white placeholder:text-zinc-500"
              />
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-xs text-zinc-400">{t('livePoints.give.howMany')}</span>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.filter((n) => n <= dailyCap).map((n) => (
                <button
                  key={n}
                  type="button"
                  data-filter-chip
                  data-active={amount === n ? 'true' : undefined}
                  onClick={() => setAmount(n)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm tabular-nums text-white transition-colors',
                    amount === n ? 'border-white/60 bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
                  )}
                >
                  <PointsIcon className="h-3.5 w-3.5" />
                  {formatCount(n)}
                </button>
              ))}
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                value={amount || ''}
                aria-label={t('livePoints.give.howMany')}
                onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                className="h-[34px] w-24 rounded-lg border-white/10 bg-white/5 text-sm tabular-nums text-white"
              />
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">{t('livePoints.give.limitNote', { cap: formatCount(dailyCap) })}</p>
          </div>

          <button
            type="button"
            data-kit-button="primary"
            disabled={!valid || give.isPending}
            onClick={() => give.mutate()}
            className="flex w-full items-center justify-center gap-2 disabled:opacity-50"
          >
            {give.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PointsIcon className="h-4 w-4" />}
            {t('livePoints.give.button', { amount: formatCount(amount || 0) })}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
