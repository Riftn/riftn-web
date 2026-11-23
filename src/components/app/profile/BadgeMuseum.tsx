/**
 * Badge Museum
 * ============
 * Milestone badges on a profile (Requests c8a73e8c): first 1K views, 50
 * videos uploaded, 1K followers and so on. The server works out which steps
 * are earned from stats it already keeps; this draws them.
 *
 * - `MilestoneChips` sits in the chip row beside the name: the three rarest
 *   earned badges, one per kind. Tapping one opens the museum. On your own
 *   profile, with nothing earned yet, a single "Badge Museum" chip opens it so
 *   you can see what's ahead.
 * - `BadgeMuseumPanel` sits under the follower counts (Requests a63c7686): a
 *   framed panel of every earned badge as hexagon tiles, six to a row on a
 *   phone. Locked steps stay out of it; tapping a tile or the title opens the
 *   museum. Nothing renders until something is earned.
 * - `BadgeMuseumSheet` lists every step: earned ones lit, locked ones dimmed
 *   with a progress bar ("640 / 1K").
 *
 * The owner can hide all of it from other people in Edit profile (Requests
 * f493327b, `customs.badgeMuseumVisibility`); the server then sends other
 * viewers no badges, and the owner sees a "Hidden from others" note.
 *
 * @module components/app/profile/BadgeMuseum
 */

import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useMilestones, type Milestone } from '@/hooks/use-milestones';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';

/** One icon per step, so each badge reads apart from its neighbours. */
const ICONS: Record<string, string> = {
  views_1k: '👀',
  views_10k: '📈',
  views_100k: '🚀',
  views_1m: '🌟',
  videos_10: '🎬',
  videos_50: '🎞️',
  videos_200: '🏆',
  followers_100: '🤝',
  followers_1k: '🎉',
  followers_10k: '👑',
  likes_1k: '❤️',
  first_live: '📡',
  live_10h: '🎙️',
};

const milestoneIcon = (id: string) => ICONS[id] ?? '🏅';

/** "1M views", "50 videos", "First live". */
function milestoneName(t: TFunction, m: Pick<Milestone, 'id' | 'kind' | 'goal'>): string {
  const value = formatCount(m.goal);
  switch (m.kind) {
    case 'views':
      return t('badgeMuseum.name.views', { defaultValue: '{{value}} views', value });
    case 'videos':
      return t('badgeMuseum.name.videos', { defaultValue: '{{value}} videos', value });
    case 'followers':
      return t('badgeMuseum.name.followers', { defaultValue: '{{value}} followers', value });
    case 'likes':
      return t('badgeMuseum.name.likes', { defaultValue: '{{value}} likes', value });
    case 'lives':
      return t('badgeMuseum.name.firstLive', 'First live');
    case 'liveHours':
      return t('badgeMuseum.name.liveHours', { defaultValue: '{{value}} hours live', value });
    default:
      return m.id;
  }
}

function milestoneHint(t: TFunction, m: Milestone): string {
  switch (m.kind) {
    case 'views':
      return t('badgeMuseum.hint.views', 'Views across all posts');
    case 'videos':
      return t('badgeMuseum.hint.videos', 'Videos uploaded');
    case 'followers':
      return t('badgeMuseum.hint.followers', 'Followers');
    case 'likes':
      return t('badgeMuseum.hint.likes', 'Likes received');
    case 'lives':
      return t('badgeMuseum.hint.firstLive', 'Go live once');
    case 'liveHours':
      return t('badgeMuseum.hint.liveHours', 'Hours streamed live');
    default:
      return '';
  }
}

const CHIP = cn(
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md',
  'bg-white/[0.12] text-white/75 border border-white/[0.12] text-[10px] font-semibold leading-none whitespace-nowrap flex-shrink-0',
  'transition-colors duration-200 hover:bg-white/[0.18] hover:text-white',
);

interface MilestoneChipsProps {
  /** Wallet of the person whose profile is on screen. */
  address?: string | null;
  /** True on your own profile: shows the museum chip before anything is earned. */
  own?: boolean;
  className?: string;
}

export function MilestoneChips({ address, own, className }: MilestoneChipsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data } = useMilestones(address);

  if (!data || (data.hidden && !own)) return null;
  const top = data.top
    .map((id) => data.milestones.find((m) => m.id === id))
    .filter((m): m is Milestone => !!m);
  if (!top.length && !own) return null;

  const openLabel = t('badgeMuseum.open', 'Open Badge Museum');

  return (
    <>
      <span data-milestone-chips className={cn('contents', className)}>
        {top.length ? (
          top.map((m) => {
            const name = milestoneName(t, m);
            return (
              <button
                key={m.id}
                type="button"
                data-milestone-chip={m.id}
                onClick={() => setOpen(true)}
                title={`${name} · ${openLabel}`}
                aria-label={`${name}. ${openLabel}`}
                className={CHIP}
              >
                <span aria-hidden className="text-[11px] leading-none">{milestoneIcon(m.id)}</span>
                {name}
              </button>
            );
          })
        ) : (
          <button type="button" data-milestone-chip="museum" onClick={() => setOpen(true)} title={openLabel} className={CHIP}>
            <span aria-hidden className="text-[11px] leading-none">🏛️</span>
            {t('badgeMuseum.title', 'Badge Museum')}
          </button>
        )}
      </span>
      <BadgeMuseumSheet address={address} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * One colour per kind, so a row of tiles reads as families at a glance. Kept
 * soft (they sit on glass in every theme) and paired with the badge's own icon.
 */
const KIND_HUE: Record<string, number> = {
  views: 205,
  videos: 270,
  followers: 150,
  likes: 335,
  lives: 12,
  liveHours: 42,
};

interface BadgeMuseumPanelProps {
  /** Wallet of the person whose profile is on screen. */
  address?: string | null;
  /** True on your own profile: shows the "Hidden from others" note when it applies. */
  own?: boolean;
  className?: string;
}

export function BadgeMuseumPanel({ address, own, className }: BadgeMuseumPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data } = useMilestones(address);

  if (!data || (data.hidden && !own)) return null;
  const earned = data.milestones.filter((m) => m.earned).sort((a, b) => b.rarity - a.rarity);
  if (!earned.length) return null;

  const title = t('badgeMuseum.title', 'Badge Museum');
  const openLabel = t('badgeMuseum.open', 'Open Badge Museum');

  return (
    <section data-badge-museum-panel aria-label={title} className={cn('relative mt-5 pt-3', className)}>
      <div
        className={cn(
          'relative rounded-2xl border px-2.5 pb-3 pt-5 sm:px-4',
          'bg-white/[0.03] backdrop-blur-sm',
          'border-[color-mix(in_srgb,var(--tint-accent,rgb(161_161_170))_45%,transparent)]',
          'shadow-[0_0_18px_-4px_color-mix(in_srgb,var(--tint-accent,rgb(161_161_170))_55%,transparent),inset_0_0_14px_-6px_color-mix(in_srgb,var(--tint-accent,rgb(161_161_170))_45%,transparent)]',
        )}
      >
        <ul className="flex flex-wrap justify-center gap-y-2.5 [--gap:0.375rem] gap-x-[var(--gap)] sm:[--gap:0.75rem]">
          {earned.map((m) => {
            const name = milestoneName(t, m);
            return (
              <li key={m.id} className="w-[calc((100%-5*var(--gap))/6)] sm:w-[calc((100%-7*var(--gap))/8)]">
                <button
                  type="button"
                  data-milestone-tile={m.id}
                  onClick={() => setOpen(true)}
                  title={`${name} · ${openLabel}`}
                  aria-label={`${name}. ${openLabel}`}
                  className="group flex w-full flex-col items-center gap-1 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                >
                  <HexBadge m={m} />
                  <span className="line-clamp-2 w-full break-words text-center text-[9.5px] font-semibold leading-tight text-white/75 sm:text-[11px]">
                    {name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {own && data.hidden && (
          <p data-badge-museum-hidden className="mt-2.5 flex items-center justify-center gap-1 text-[11px] text-white/50">
            <EyeOff aria-hidden className="h-3 w-3" />
            {t('badgeMuseum.hiddenNote', 'Hidden from others')}
          </p>
        )}
      </div>
      {/* The title sits in a notch on the frame's top edge. */}
      <button
        type="button"
        data-badge-museum-title
        onClick={() => setOpen(true)}
        title={openLabel}
        className={cn(
          'absolute left-1/2 top-0 -translate-x-1/2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1',
          'text-xs font-semibold text-white transition-colors hover:text-white',
          'bg-[var(--float-solid,rgb(9_9_11))]',
          'border-[color-mix(in_srgb,var(--tint-accent,rgb(161_161_170))_55%,transparent)]',
          'shadow-[0_0_12px_-3px_color-mix(in_srgb,var(--tint-accent,rgb(161_161_170))_60%,transparent)]',
        )}
      >
        <span aria-hidden>🏆</span>
        {title}
        <span className="font-mono text-[10px] text-white/50">{formatCount(earned.length)}</span>
      </button>
      <BadgeMuseumSheet address={address} open={open} onOpenChange={setOpen} />
    </section>
  );
}

/** A hexagon tile in the badge's family colour with its icon in the middle. */
function HexBadge({ m }: { m: Milestone }) {
  const hue = KIND_HUE[m.kind] ?? 220;
  const hex = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';
  // The glow sits on a wrapper: a filter on the clipped shape would be clipped too.
  return (
    <span
      aria-hidden
      className="block w-full max-w-[56px] transition-transform duration-200 group-hover:scale-105"
      style={{ filter: `drop-shadow(0 0 5px hsl(${hue} 90% 60% / 0.45))` }}
    >
      <span
        className="relative block aspect-[0.9] w-full"
        style={{ clipPath: hex, background: `linear-gradient(160deg, hsl(${hue} 85% 64%), hsl(${hue} 70% 38%))` }}
      >
        <span
          className="absolute inset-[2px] flex items-center justify-center text-[18px] leading-none sm:text-[22px]"
          style={{
            clipPath: hex,
            background: `radial-gradient(circle at 50% 35%, hsl(${hue} 70% 34%), hsl(${hue} 60% 14%))`,
          }}
        >
          {milestoneIcon(m.id)}
        </span>
      </span>
    </span>
  );
}

interface BadgeMuseumSheetProps {
  address?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BadgeMuseumSheet({ address, open, onOpenChange }: BadgeMuseumSheetProps) {
  const { t } = useTranslation();
  const { data } = useMilestones(open ? address : null);

  // Earned first (rarest first), then locked ones closest to done.
  const rows = [...(data?.milestones ?? [])].sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    if (a.earned) return b.rarity - a.rarity;
    return b.value / b.goal - a.value / a.goal || a.rarity - b.rarity;
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[85dvh]" data-badge-museum>
        <DrawerHeader className="px-4 pb-2 text-left">
          <DrawerTitle className="text-white flex items-center gap-2">
            <span aria-hidden>🏛️</span>
            {t('badgeMuseum.title', 'Badge Museum')}
          </DrawerTitle>
          <DrawerDescription className="text-white/50 text-xs">
            {data
              ? t('badgeMuseum.summary', {
                  defaultValue: '{{earned}} of {{total}} badges earned',
                  earned: formatCount(data.earned),
                  total: formatCount(data.total),
                })
              : t('badgeMuseum.loading', 'Loading badges…')}
            {data?.hidden && (
              <span data-badge-museum-hidden className="ml-2 inline-flex items-center gap-1 align-middle">
                <EyeOff aria-hidden className="h-3 w-3" />
                {t('badgeMuseum.hiddenNote', 'Hidden from others')}
              </span>
            )}
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-8">
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-2xl mx-auto">
            {rows.map((m) => (
              <MuseumTile key={m.id} m={m} t={t} />
            ))}
          </ul>
          <p className="mt-4 text-center text-[11px] text-white/40">{t('badgeMuseum.footer', 'Badges unlock on their own as milestones are reached.')}</p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function MuseumTile({ m, t }: { m: Milestone; t: TFunction }) {
  const pct = Math.max(0, Math.min(100, Math.round((m.value / m.goal) * 100)));
  return (
    <li
      data-milestone={m.id}
      data-earned={m.earned || undefined}
      className={cn(
        'relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center',
        m.earned ? 'border-white/20 bg-white/[0.08]' : 'border-white/[0.08] bg-white/[0.03]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full text-2xl',
          m.earned ? 'bg-white/[0.12] shadow-[0_0_18px_2px_rgba(255,255,255,0.18)]' : 'bg-white/[0.04] grayscale opacity-40',
        )}
      >
        {milestoneIcon(m.id)}
      </span>
      <span className={cn('text-sm font-semibold leading-snug break-words', m.earned ? 'text-white' : 'text-white/60')}>
        {milestoneName(t, m)}
      </span>
      <span className="text-[11px] leading-snug text-white/45">{milestoneHint(t, m)}</span>
      {m.earned ? (
        <span className="mt-auto inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/80">
          {t('badgeMuseum.earned', 'Earned')}
        </span>
      ) : (
        <div className="mt-auto w-full">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="h-full rounded-full bg-white/60" style={{ width: `${pct}%` }} />
          </div>
          <span className="mt-1 block font-mono text-[10px] text-white/50">
            {t('badgeMuseum.progress', {
              defaultValue: '{{value}} / {{goal}}',
              value: formatCount(m.value),
              goal: formatCount(m.goal),
            })}
          </span>
        </div>
      )}
    </li>
  );
}
