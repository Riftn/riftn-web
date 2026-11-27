import { useTranslation as _useCopy } from 'react-i18next';
/**
 * SuperPowers
 * ===========
 * What a badge buys beyond the art next to your name. Your tier, the boosts it
 * grants this cycle, what you have spent them on, and the whole thirteen-rung
 * ladder lit against where you stand.
 *
 * The page is deliberately readable **signed out and badgeless**. Somebody who
 * has not staked is the entire audience for it — a page that greets them with
 * "connect a wallet" tells them nothing about why they would want to. So the
 * ladder renders for everyone from the public endpoint, and the allowance
 * panel is the part that needs an account.
 *
 * All twelve powers are listed in unlock order. Great White Shark remains a badge
 * tier with a stronger allowance, but it does not add a separate power.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBadgeTierLabel } from '@/i18n/badge-tier-label';
import { localizeSuperPower } from '@/i18n/superpower-copy';
import { Link } from 'react-router-dom';
import { Loader2, Clock } from "lucide-react";
import Lock from "@/components/ui/cut-icons/privacy";
import History from "@/components/ui/cut-icons/history";

import ChevronRight from "@/components/ui/cut-icons/next";
import X from "@/components/ui/cut-icons/close";

import { SuperPowerIcon } from '@/components/app/SuperPowerIcon';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { PageBody, PageIsland } from '@/components/app/page-kit/PageKit';
import { BadgeProgress } from '@/components/app/BadgeProgress';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { useCleanPhone } from '@/components/app/clean/CleanKit';
import { SuperPowersOrbit, type OrbitPower } from '@/components/app/superpowers/SuperPowersOrbit';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { badgeImage } from '@/lib/staking-badges';
import {
  useCancelBoost,
  useSuperpowerLadder,
  useSuperpowers,
} from '@/hooks/use-superpowers';
import { SpendPowerDrawer } from '@/components/app/modals/SpendPowerDrawer';
import type { SuperPowerInfo } from '@/lib/api/dehub/superpowers';
import { TeamUpDrawer } from '@/components/app/TeamUpDrawer';
import { LiveGiftBuyDrawer } from '@/components/app/live/LiveGiftBuyDrawer';

/** Chrome type, the brand's one accent. */
const CHROME_TEXT = cn(
  'bg-[linear-gradient(180deg,#fff_0%,#cfd3d8_38%,#7d838b_52%,#e9ecef_70%,#9aa0a7_100%)] bg-clip-text text-transparent',
  '[html:is([data-theme=light],[data-system-tone=light])_&]:bg-none',
  '[html:is([data-theme=light],[data-system-tone=light])_&]:text-foreground',
);

const POWER_ACTION_FOCUS = cn(
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
  '[html:is([data-theme=light],[data-system-tone=light])_&]:focus-visible:outline-ring',
);
const POWER_ACTION = `min-w-0 flex-1 whitespace-normal px-4 text-center sm:flex-none ${POWER_ACTION_FOCUS}`;

/** Total slot minutes a tier holds per cycle — the number worth comparing. */
function cycleMinutes(boosts: number, minutes: number): number {
  return boosts * minutes;
}

function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export default function SuperPowersPage() {
  const { t: _copy } = _useCopy();
  const { t, i18n } = useTranslation();
  const badgeLabel = useBadgeTierLabel();
  const { data: status, isLoading: loadingStatus, isError, refetch: refetchStatus } = useSuperpowers();
  const { data: ladder, isLoading: loadingLadder } = useSuperpowerLadder();
  const cancelBoost = useCancelBoost();

  // The public ladder carries every power; the signed-in one adds `unlocked`.
  // Prefer the personal copy so the page lights up without a second render.
  const powers = [...(status?.powers ?? ladder?.powers ?? [])]
    .filter(power => String(power.key) !== 'golden_hour')
    .sort((a, b) => Number(b.key === 'team_up') - Number(a.key === 'team_up'))
    .map(power => localizeSuperPower(power, i18n?.language));

  const refillsOn = useMemo(() => {
    const iso = status?.cycleEndsAt ?? ladder?.cycleEndsAt;
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }, [status?.cycleEndsAt, ladder?.cycleEndsAt]);

  // One drawer for every spendable power. It resolves the target a power needs — a
  // post, a comment, a Stage, a category — and books it; the server re-checks
  // every one of those, so this only decides what is worth offering.
  const [spending, setSpending] = useState<SuperPowerInfo | null>(null);
  const [historyPower, setHistoryPower] = useState<SuperPowerInfo | null>(null);
  const [teamUpOpen, setTeamUpOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  const clean = useCleanPhone();

  // Team up is public; every other power is held when the account's tier
  // reaches it. The public ladder has no `unlocked`, so signed out it is all dim.
  const orbitPowers: OrbitPower[] = powers.map(power => ({
    power,
    unlocked: power.key === 'team_up' || !!power.unlocked,
  }));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const bookedPowers = new Set(status?.bookings.map(booking => booking.power));
  // Keep existing bookings within reach when the account no longer has a tier.
  const selected =
    orbitPowers.find(entry => entry.power.key === selectedKey) ??
    orbitPowers.find(entry => entry.unlocked && entry.power.available && entry.power.key !== 'team_up') ??
    orbitPowers.find(entry => bookedPowers.has(entry.power.key)) ??
    orbitPowers[0] ??
    null;

  const ladderTiers = (ladder?.tiers ?? []).filter(
    (tier): tier is typeof tier & { name: string } => !!tier.name,
  );
  const myTierIndex = ladderTiers.findIndex(tier => tier.name === status?.tier);
  const historyBookings = historyPower
    ? (status?.bookings.filter(booking => booking.power === historyPower.key) ?? [])
    : [];

  return (
    <>
      <SEOHead
        title={_copy("copy.f57d7f82c107", { defaultValue: "SuperPowers: Spend Your Riftn Badge on Reach" })}
        description={_copy("copy.eb510e32623c", { defaultValue: "Use badge-powered boosts, or Team up with as many as seven others to unlock a higher shared badge." })}
        url="https://riftn.com/app/superpowers"
        image="https://riftn.com/og/superpowers.jpg"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Riftn SuperPowers',
          description:
            _copy("copy.91c129f862f5", { defaultValue: "Riftn SuperPowers include badge-powered boosts and Team up, which combines wallet power for a higher shared badge." }),
          url: 'https://riftn.com/app/superpowers',
          isPartOf: { '@type': 'WebSite', name: 'Riftn', url: 'https://riftn.com' },
        }}
      />

      <PageIsland className="max-w-3xl mx-auto" icon="superpowers" title={t('superpowers.title')} />

      <PageBody className="max-w-3xl mx-auto">
        <header className="flex flex-col gap-2">
          <p className="text-sm text-zinc-400 max-w-prose">
            {t('superpowers.currentIntro', {
              defaultValue:
                'Badge holders get fresh boosts every fortnight. Team up is open to everyone: combine wallet power with up to seven others and every member gets the badge your total unlocks.',
            })}
          </p>
        </header>

        {/* ── The orbit ──────────────────────────────────────────────── */}
        <section
          data-kit-section={clean ? undefined : true}
          className={cn(
            'flex flex-col gap-5 overflow-hidden',
            clean ? 'px-1 py-2' : 'bg-zinc-950 p-4 sm:p-6',
          )}
        >
          <SuperPowersOrbit
            powers={orbitPowers}
            selectedKey={selected?.power.key ?? null}
            onSelect={power => setSelectedKey(power.key)}
            core={
              loadingStatus ? (
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              ) : status?.tier ? (
                <>
                  {badgeImage(status.tier) && (
                    <img
                      src={badgeImage(status.tier) ?? undefined}
                      alt=""
                      className="w-[40%] max-w-[120px] object-contain drop-shadow-[0_0_28px_rgba(255,255,255,0.18)]"
                    />
                  )}
                  <span className="mt-1 text-base sm:text-2xl font-extrabold text-white leading-tight">{badgeLabel(status.tier)}</span>
                  <span className={cn(CHROME_TEXT, 'mt-1 sm:mt-2 text-3xl sm:text-5xl font-extrabold tracking-tight leading-none tabular-nums')}>
                    {t('superpowers.orbit.boostsLeft', {
                      count: status.boostsLeft,
                      defaultValue: status.boostsLeft === 1 ? '{{count}} boost' : '{{count}} boosts',
                    })}
                  </span>
                  <span className="mt-1.5 text-[10px] sm:text-[12px] font-mono text-zinc-500 leading-snug">
                    {refillsOn
                      ? t('superpowers.orbit.leftRefills', {
                          date: refillsOn,
                          defaultValue: 'left this cycle · refills {{date}}',
                        })
                      : t('superpowers.orbit.left', { defaultValue: 'left this cycle' })}
                  </span>
                </>
              ) : (
                <>
                  <ThemedIcon icon="superpowers" alt="" className="w-[34%] max-w-[110px] object-contain" />
                  <span className={cn(CHROME_TEXT, 'mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight leading-none')}>
                    {t('superpowers.orbit.twelve', { defaultValue: '12 powers' })}
                  </span>
                  <span className="mt-1.5 text-[10px] sm:text-[12px] font-mono text-zinc-500 leading-snug">
                    {t('superpowers.orbit.teamUpOpen', { defaultValue: 'Team up is open to everyone' })}
                  </span>
                </>
              )
            }
          />

          {selected && (() => {
            const { power, unlocked } = selected;
            const isTeamUp = power.key === 'team_up';
            const usable = unlocked && power.available;
            const canViewHistory = !isTeamUp && (!!status?.tier || bookedPowers.has(power.key));
            const unlockBadge = badgeImage(power.tier);
            const unlockTier = power.tier ? badgeLabel(power.tier) : '';
            const allowance =
              power.key === 'signal_flare' || power.key === 'harpoon'
                ? (status?.signalsLeft ?? status?.boostsLeft)
                : status?.boostsLeft;
            return (
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <SuperPowerIcon
                  power={power.key}
                  alt=""
                  className={cn('h-14 w-14 sm:h-16 sm:w-16 shrink-0 object-contain', !unlocked && 'opacity-40 grayscale')}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <h2 className={cn('text-lg sm:text-xl font-bold', unlocked ? 'text-white' : 'text-zinc-300')}>{power.label}</h2>
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      {isTeamUp ? (
                        _copy("copy.9a4e2cc5cbdc", { defaultValue: "Open to everyone" })
                      ) : !power.available ? (
                        t('superpowers.comingSoon')
                      ) : (
                        <>
                          {!unlocked && <Lock className="h-3 w-3" />}
                          {unlocked
                            ? t('superpowers.orbit.unlockedAt', { tier: unlockTier, defaultValue: 'Unlocked at {{tier}}' })
                            : t('superpowers.orbit.unlocksAt', { tier: unlockTier, defaultValue: 'Unlocks at {{tier}}' })}
                          {unlockBadge && <img src={unlockBadge} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />}
                        </>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] sm:text-sm text-zinc-400 leading-snug">{power.summary}</p>
                  {!isTeamUp && usable && allowance !== undefined && (
                    <p className="mt-1.5 font-mono text-[11px] text-zinc-500 tabular-nums">
                      {_copy("copy.ff1e56a487ea", { defaultValue: "Remaining uses: {{value1}}", value1: allowance, value2: allowance === 1 ? _copy("copy.a3b142af6e97", { defaultValue: "use" }) : _copy("copy.f480ffb2979d", { defaultValue: "uses" }) })}
                    </p>
                  )}
                </div>
                <div className="flex w-full sm:w-auto shrink-0 items-center gap-2">
                  {canViewHistory && (
                    <Button size="lg"
                      type="button"
                      onClick={() => {
                        setHistoryPower(power);
                        void refetchStatus();
                      }}
                      variant="secondary"
                      className={cn("group", POWER_ACTION)}
                    >{_copy("copy.504282c0611d", { defaultValue: "Past usage" })}<ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  )}
                  {isTeamUp ? (
                    <Button size="lg"
                      type="button"
                      onClick={() => setTeamUpOpen(true)}
                      className={POWER_ACTION}
                    >
                      {t('superpowers.orbit.openTeamUp', { defaultValue: 'Open Team up' })}
                    </Button>
                  ) : usable ? (
                    <Button size="lg"
                      type="button"
                      onClick={() => setSpending(power)}
                      className={POWER_ACTION}
                    >
                      {t('superpowers.orbit.use', { defaultValue: 'Use' })}
                    </Button>
                  ) : !status?.tier && !loadingStatus && !isError ? (
                    <Button size="lg"
                      type="button"
                      onClick={() => setBuyOpen(true)}
                      variant="secondary"
                      className={POWER_ACTION}
                    >
                      {t('nav.buyDhb')}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })()}

          {isError && !status ? (
            // A failed request is not the same as no badge. Telling a Megalodon
            // to go and stake because the API blipped is worse than saying
            // nothing, and the ring still renders from the public ladder.
            <p className="text-white text-sm">{t('superpowers.loadFailed')}</p>
          ) : !loadingStatus ? (
            <BadgeProgress variant="rail" />
          ) : null}
        </section>

        {/* ── The ladder ─────────────────────────────────────────────── */}
        <section data-kit-section={clean ? undefined : true} className={cn('flex flex-col gap-3', clean ? 'px-1 py-2' : 'bg-zinc-950 p-4 sm:p-6')}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
              {t('superpowers.ladderHeading')}
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              {t('superpowers.orbit.perCycle', { defaultValue: 'Boost time per cycle' })}
            </span>
          </div>

          {loadingLadder ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
          ) : (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              {ladderTiers.map((tier, index) => {
                const isMine = index === myTierIndex;
                const above = myTierIndex >= 0 && index > myTierIndex;
                const badge = badgeImage(tier.name);
                const label = badgeLabel(tier.name);
                return (
                  <div
                    key={tier.name}
                    title={`${label}: ${tier.boostsPerCycle} × ${tier.minutesPerBoost}m`}
                    className={cn(
                      'flex min-w-[76px] flex-1 flex-col items-center gap-1 rounded-xl border px-1.5 py-2.5 text-center',
                      isMine ? 'border-white bg-white/[0.06] text-white' : 'border-white/10 text-zinc-400',
                    )}
                  >
                    {badge && (
                      <img src={badge} alt="" aria-hidden="true" className={cn('h-8 w-8 object-contain', above && 'grayscale brightness-50')} />
                    )}
                    <span className="w-full text-pretty text-[10px] font-semibold">{label}</span>
                    <span className="font-mono text-[11px] tabular-nums">
                      {formatMinutes(cycleMinutes(tier.boostsPerCycle, tier.minutesPerBoost))}
                    </span>
                    <span className="font-mono text-[9px] text-zinc-600 tabular-nums">
                      {tier.boostsPerCycle} × {tier.minutesPerBoost}m
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* The honest sentence, once, where the numbers are. */}
          <p className="text-[12px] text-zinc-500 max-w-prose">{t('superpowers.shareOfVoice')}</p>
        </section>
      </PageBody>

      {/* Literal DrawerContent lives inside this component, so vaul's deferred
          Root still sees it — see the note in ui/drawer.tsx. */}
      <SpendPowerDrawer power={spending} onOpenChange={open => !open && setSpending(null)} />
      <TeamUpDrawer open={teamUpOpen} onOpenChange={setTeamUpOpen} />
      <LiveGiftBuyDrawer open={buyOpen} onOpenChange={setBuyOpen} neededDhb={1} returnTo="SuperPowers" onFunded={() => { setBuyOpen(false); void refetchStatus(); }} />

      <Drawer open={!!historyPower} onOpenChange={open => !open && setHistoryPower(null)}>
        <DrawerContent scrollable column glass className="px-4 pb-6">
          <DrawerHeader className="pb-3 flex flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <DrawerTitle className="text-white text-lg flex items-center gap-2">
                {historyPower && (
                  <SuperPowerIcon power={historyPower.key} alt="" className="w-8 h-8 shrink-0 object-contain" />
                )}
                {historyPower?.label}{_copy("copy.54ead07b0a79", { defaultValue: " usage" })}</DrawerTitle>
              <p className="text-[12px] text-zinc-500 mt-1">{_copy("copy.90c3fd22b403", { defaultValue: "This cycle and anything still active." })}</p>
            </div>
            <button
              type="button"
              onClick={() => setHistoryPower(null)}
              aria-label={t('common.close', { defaultValue: 'Close' })}
              className="text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </DrawerHeader>

          <div className="max-h-[62vh] overflow-y-auto flex flex-col gap-2">
            {historyBookings.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 flex flex-col items-center text-center gap-2">
                <History className="w-6 h-6 text-zinc-500" aria-hidden="true" />
                <p className="text-sm text-zinc-300">{_copy("copy.a7a3e94141c9", { defaultValue: "No past usage for this power yet." })}</p>
              </div>
            ) : (
              historyBookings.map(booking => {
                const notificationPower = booking.power === 'signal_flare' || booking.power === 'harpoon';
                const result = notificationPower
                  ? booking.signalDeliveryStatus === 'sent'
                    ? `${booking.signalRecipients ?? 0} notified`
                    : booking.signalDeliveryStatus === 'failed'
                      ? _copy("copy.ed2c694616cc", { defaultValue: "Delivery retrying" })
                      : booking.power === 'harpoon' ? _copy("copy.9cae0c163a3b", { defaultValue: "Notifying badge holders" }) : _copy("copy.67bd3636b2de", { defaultValue: "Notifying followers" })
                  : t('superpowers.seenCount', {
                      count: booking.served,
                      defaultValue: `${booking.served} seen`,
                    });
                const subject = booking.tokenId != null
                  ? `Post #${booking.tokenId}`
                  : booking.category || historyPower?.label || booking.power;

                return (
                  <div
                    key={booking.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 flex items-center gap-3"
                  >
                    <Clock className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      {booking.tokenId != null ? (
                        <Link to={`/app/post/${booking.tokenId}`} className="text-sm text-white hover:underline truncate block">
                          {subject}
                        </Link>
                      ) : (
                        <p className="text-sm text-white truncate">{subject}</p>
                      )}
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {new Date(booking.startsAt).toLocaleString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[12px] font-medium text-zinc-200 tabular-nums">{result}</p>
                      {!notificationPower && (
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {booking.live
                            ? _copy("copy.b64ac05f17e6", { defaultValue: "Live" })
                            : booking.status === 'active'
                              ? t('superpowers.queued')
                              : _copy("copy.7804f7a79a9e", { defaultValue: "Finished" })}
                        </p>
                      )}
                    </div>
                    {booking.status === 'active' && !notificationPower && (
                      <Button variant="ghost" size="sm"
                        type="button"
                        onClick={() =>
                          cancelBoost.mutate(booking.id, {
                            onSuccess: ({ refunded }) =>
                              toast.success(
                                refunded
                                  ? t('superpowers.cancelledRefunded')
                                  : t('superpowers.cancelledSpent'),
                              ),
                            onError: (error: unknown) =>
                              toast.error(
                                error instanceof Error ? error.message : t('superpowers.cancelFailed'),
                              ),
                          })
                        }
                        disabled={cancelBoost.isPending}
                        loading={cancelBoost.isPending && cancelBoost.variables === booking.id}
                        className={cn("relative shrink-0 pl-9 [&>[data-dehub-loader]]:absolute [&>[data-dehub-loader]]:left-3", POWER_ACTION_FOCUS)}
                      >
                        {t('common.cancel')}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
