import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Loader2 } from 'lucide-react';
import Coins from '@/components/ui/cut-icons/coins';
import Share2 from '@/components/ui/cut-icons/feedshare';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useCrossPostStore } from '@/store/crossPostStore';
import { MULTIPOST_PLATFORMS, PLATFORM_NAMES, type SocialAccount } from '@/lib/multipost';
import {
  BUNDLE_STOPS, CREDIT_PRICE_USD, DEFAULT_PLATFORM_CREDITS, bundleDiscount, bundlePriceUsd, creditsFor,
} from '@/lib/social-pricing';
import { PlatformIcon, useMultipostSetup } from '@/components/app/settings/MultiPostSettings';

const CARD = 'rounded-2xl border border-white/10 bg-white/[0.06] p-4';
const LABEL = 'mb-2 text-xs font-medium uppercase tracking-wide text-white/50';

interface MultiPostSheetViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: SocialAccount[];
  balance: number;
  loading?: boolean;
  failed?: boolean;
  selected: readonly string[];
  onToggle: (accountId: string) => void;
  connecting: string | null;
  onConnect: (platform: string) => void;
  buying: boolean;
  onBuy: (credits: number) => void;
}

/**
 * Multi-posting set up from inside the composer: connect accounts, switch them
 * on for this post and top up credits, then Done drops back onto the post
 * exactly as it was. Settings keeps the same controls as a page.
 */
export function MultiPostSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { selected, toggle } = useCrossPostStore();
  const { status, buying, connecting, handleConnect, handleBuy } = useMultipostSetup({ inPost: true });
  return (
    <MultiPostSheetView
      open={open}
      onOpenChange={onOpenChange}
      accounts={status.data?.accounts ?? []}
      balance={status.data?.credits ?? 0}
      loading={status.isLoading}
      failed={status.isError}
      selected={selected}
      onToggle={toggle}
      connecting={connecting}
      onConnect={handleConnect}
      buying={buying}
      onBuy={handleBuy}
    />
  );
}

export function MultiPostSheetView({
  open, onOpenChange, accounts, balance, loading, failed, selected, onToggle, connecting, onConnect, buying, onBuy,
}: MultiPostSheetViewProps) {
  const { t } = useTranslation();
  const [stopIndex, setStopIndex] = useState(2);
  const connectedPlatforms = new Set(accounts.filter((a) => !a.pending).map((a) => a.platform));
  const toConnect = MULTIPOST_PLATFORMS.filter((p) => !connectedPlatforms.has(p));
  const credits = BUNDLE_STOPS[stopIndex];
  const discount = bundleDiscount(credits);
  const total = bundlePriceUsd(credits);
  const using = accounts
    .filter((a) => !a.pending && selected.includes(a.id))
    .reduce((sum, a) => sum + creditsFor(a.platform), 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass data-multipost-sheet className="flex max-h-[88dvh] flex-col border-t border-white/10 text-white">
        <DrawerHeader className="shrink-0 border-b border-white/10 text-left">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Share2 className="h-5 w-5" />
            {t('multiPost.title')}
          </DrawerTitle>
          <DrawerDescription className="text-white/60">{t('multiPost.intro')}</DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
          <section aria-label={t('multiPost.connectedHeading')}>
            <div className={cn(LABEL, 'flex items-center justify-between gap-2')}>
              <span>{t('multiPost.alsoPostTo')}</span>
              {using > 0 && <span className="normal-case tracking-normal">{t('multiPost.creditsUsed', { count: using, balance })}</span>}
            </div>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-white/60" /></div>
            ) : failed ? (
              <p className="text-sm text-red-300">{t('multiPost.loadFailed')}</p>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-white/60">{t('multiPost.noAccounts')}</p>
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
                {accounts.map((account) => {
                  const on = !account.pending && selected.includes(account.id);
                  const name = PLATFORM_NAMES[account.platform] ?? account.platform;
                  return (
                    <div key={account.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10"><PlatformIcon platform={account.platform} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{name}</span>
                        <span className="block truncate text-xs text-white/50">
                          {account.pending ? t('multiPost.pendingApproval') : account.username ? `@${account.username.replace(/^@/, '')}` : t('multiPost.connectedLabel')}
                        </span>
                      </span>
                      {account.pending ? (
                        account.approvalUrl && (
                          <button type="button" onClick={() => window.open(account.approvalUrl, '_blank', 'noopener')}
                            className="flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs hover:bg-white/10">
                            <Clock className="h-3.5 w-3.5" />{t('multiPost.approve')}
                          </button>
                        )
                      ) : (
                        <Switch checked={on} onCheckedChange={() => onToggle(account.id)} aria-label={`${t('multiPost.alsoPostTo')} ${name}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-label={t('multiPost.connectMore')}>
            <div className={LABEL}>{t('multiPost.connectMore')}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {toConnect.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => onConnect(platform)}
                  disabled={connecting !== null}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/15 disabled:opacity-50"
                >
                  <PlatformIcon platform={platform} />
                  <span className="min-w-0 flex-1 truncate">{PLATFORM_NAMES[platform]}</span>
                  {connecting === platform
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <span className="text-xs text-white/50">{t('multiPost.connect')}</span>}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-white/50">{t('multiPost.platformNotes')}</p>
          </section>

          <section aria-label={t('multiPost.creditsHeading')}>
            <div className={LABEL}>{t('multiPost.creditsHeading')}</div>
            <div className={CARD}>
              <div className="mb-3 flex items-center gap-2">
                <Coins className="h-4 w-4" />
                <span className="text-sm font-medium">{t('multiPost.credits', { count: balance })}</span>
              </div>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-white/80">{t('multiPost.topUpTitle')}</span>
                <span className="text-emerald-300">
                  {discount > 0 ? t('multiPost.discount', { percent: Math.round(discount * 100) }) : t('multiPost.noDiscount')}
                </span>
              </div>
              <Slider
                min={0}
                max={BUNDLE_STOPS.length - 1}
                step={1}
                value={[stopIndex]}
                onValueChange={([v]) => setStopIndex(v)}
                aria-label={t('multiPost.topUpTitle')}
                aria-valuetext={t('multiPost.topUpCredits', { count: credits })}
              />
              <div className="mt-1 flex justify-between text-[11px] text-white/40">
                {BUNDLE_STOPS.map((s) => <span key={s}>{s >= 1000 ? `${s / 1000}k` : s}</span>)}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{t('multiPost.topUpCredits', { count: credits })}</div>
                  <div className="text-xs text-white/60">
                    {t('multiPost.total', { usd: total.toFixed(2) })} · {t('multiPost.perCredit', { price: (total / credits).toFixed(3) })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onBuy(credits)}
                  disabled={buying}
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  {buying ? t('multiPost.buying') : t('multiPost.buy')}
                </button>
              </div>
              <p className="mt-3 text-xs text-white/50">
                {t('multiPost.creditRules', { x: creditsFor('twitter'), farcaster: creditsFor('farcaster'), other: DEFAULT_PLATFORM_CREDITS })}{' '}
                {t('multiPost.payAsYouGoCredits', { price: CREDIT_PRICE_USD.toFixed(2) })}
              </p>
            </div>
          </section>
        </div>

        <div className="shrink-0 border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 w-full rounded-xl bg-white text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
          >
            {t('common.done')}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
