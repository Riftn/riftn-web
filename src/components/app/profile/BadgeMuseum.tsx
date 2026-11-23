/**
 * Badge Museum
 * ============
 * Milestone badges (Requests c8a73e8c): first 1K views, 50 videos uploaded,
 * 1K followers and so on. The server works out which steps are earned from
 * stats it already keeps; this draws them as a medal wall.
 *
 * The museum is off by default and lives in Settings (`BadgeMuseumSetting`).
 * Only someone who switches "Show Badge Museum on my profile" on gets it on
 * their profile; while it is off the profile shows nothing museum-related to
 * anyone, the owner included (`customs.badgeMuseumVisibility`, server-side).
 *
 * - `MilestoneChips` sits in the chip row beside the name: the three rarest
 *   earned badges. Tapping one opens the museum.
 * - `BadgeMuseumPanel` sits under the follower counts: the three rarest
 *   earned medals on a small podium, and a "See all" that opens the museum.
 * - `BadgeMuseumSheet` is the museum: the podium, then every other badge as
 *   a medal. Locked ones are engraved outlines with a progress ring.
 *
 * Medals take the theme's one accent (white on System, ink on System Light),
 * and every glyph is from the icon set: no emoji.
 *
 * @module components/app/profile/BadgeMuseum
 */

import { useState, type CSSProperties } from 'react';
import {
  Award,
  Clapperboard,
  Crown,
  Eye,
  EyeOff,
  Film,
  Heart,
  Landmark,
  Mic,
  Radio,
  Rocket,
  Star,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { earnedByRarity, useMilestones, type Milestone } from '@/hooks/use-milestones';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';
import '@/styles/badge-museum.css';

/** One glyph per step, so each medal reads apart from its neighbours. */
const ICONS: Record<string, LucideIcon> = {
  views_1k: Eye,
  views_10k: TrendingUp,
  views_100k: Rocket,
  views_1m: Star,
  videos_10: Clapperboard,
  videos_50: Film,
  videos_200: Trophy,
  followers_100: UserPlus,
  followers_1k: Users,
  followers_10k: Crown,
  likes_1k: Heart,
  first_live: Radio,
  live_10h: Mic,
};

const iconFor = (id: string): LucideIcon => ICONS[id] ?? Award;

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

const progressPct = (m: Milestone) => Math.max(0, Math.min(100, Math.round((m.value / m.goal) * 100)));

interface MedalProps {
  m: Milestone;
  size: number;
  /** Locked medals draw how far along they are as a ring. */
  ring?: boolean;
  /** Stagger slot for the entrance. */
  index?: number;
  className?: string;
}

/** A round medal in the theme accent; locked ones are an engraved outline. */
export function Medal({ m, size, ring, index, className }: MedalProps) {
  const Icon = iconFor(m.id);
  const r = size / 2 - 1.5;
  const c = 2 * Math.PI * r;
  const pct = progressPct(m);
  return (
    <span
      aria-hidden
      data-medal={m.id}
      data-earned={m.earned || undefined}
      className={cn('bm-medal', index !== undefined && 'bm-rise', className)}
      style={{ width: size, height: size, '--bm-i': index ?? 0, '--bm-arc': c, '--bm-arc-to': c * (1 - pct / 100) } as CSSProperties}
    >
      {ring && !m.earned && (
        <svg className="bm-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle className="bm-ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={2.5} />
          {pct > 0 && (
            <circle
              className="bm-ring-arc"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct / 100)}
            />
          )}
        </svg>
      )}
      <Icon className="bm-medal-icon" style={{ width: Math.round(size * 0.42), height: Math.round(size * 0.42) }} strokeWidth={2} />
    </span>
  );
}

/**
 * The three rarest earned medals, the rarest raised in the middle on the
 * tallest plinth. Fewer than three earned: the ones there are, still centred.
 */
export function MedalPodium({
  medals,
  sizes,
  labels,
  t,
  stagger,
}: {
  medals: Milestone[];
  sizes: [number, number];
  labels?: boolean;
  t?: TFunction;
  stagger?: boolean;
}) {
  const [first, second, third] = medals;
  const slots = [second, first, third].filter((m): m is Milestone => !!m);
  const plinth = labels ? [16, 28, 10] : [5, 10, 3];
  return (
    <div data-medal-podium className={cn('flex items-end justify-center', labels ? 'gap-3.5' : 'gap-1.5')}>
      {slots.map((m) => {
        const place = m === first ? 1 : m === second ? 0 : 2;
        const size = place === 1 ? sizes[1] : sizes[0];
        return (
          <div key={m.id} className={cn('flex flex-col items-center', labels ? 'gap-2' : 'gap-1')}>
            <Medal m={m} size={size} index={stagger ? place : undefined} />
            {labels && t && (
              <span className="max-w-[96px] text-center text-xs font-semibold leading-tight text-white">{milestoneName(t, m)}</span>
            )}
            <span
              aria-hidden
              className="bm-plinth"
              style={{ width: size + (labels ? 16 : 6), height: plinth[place], borderRadius: labels ? '6px 6px 0 0' : '2px 2px 0 0' }}
            />
          </div>
        );
      })}
    </div>
  );
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

  // Off (the default): nothing by the name, for anyone.
  if (!data || data.hidden) return null;
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
            const Icon = iconFor(m.id);
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
                <Icon aria-hidden className="h-3 w-3" strokeWidth={2.25} />
                {name}
              </button>
            );
          })
        ) : (
          <button type="button" data-milestone-chip="museum" onClick={() => setOpen(true)} title={openLabel} className={CHIP}>
            <Landmark aria-hidden className="h-3 w-3" strokeWidth={2.25} />
            {t('badgeMuseum.title', 'Badge Museum')}
          </button>
        )}
      </span>
      <BadgeMuseumSheet address={address} open={open} onOpenChange={setOpen} />
    </>
  );
}

interface BadgeMuseumPanelProps {
  /** Wallet of the person whose profile is on screen. */
  address?: string | null;
  className?: string;
}

/**
 * Under the follower counts, only when the owner has switched the museum on
 * and earned something: the podium and a way into the full museum.
 */
export function BadgeMuseumPanel({ address, className }: BadgeMuseumPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data } = useMilestones(address);

  if (!data || data.hidden) return null;
  const earned = earnedByRarity(data.milestones);
  if (!earned.length) return null;

  const title = t('badgeMuseum.title', 'Badge Museum');

  return (
    <section data-badge-museum-panel aria-label={title} className={cn('mt-4', className)}>
      <button
        type="button"
        data-badge-museum-open
        onClick={() => setOpen(true)}
        aria-label={t('badgeMuseum.open', 'Open Badge Museum')}
        className={cn(
          'bm-panel flex w-full items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 pb-2.5 pt-3 text-left',
          'transition-colors duration-200 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60',
        )}
      >
        <MedalPodium medals={earned.slice(0, 3)} sizes={[40, 50]} stagger />
        <span className="ml-auto min-w-0 pb-1 text-right">
          <span className="block text-sm font-semibold text-white">{title}</span>
          <span className="mt-0.5 block text-xs text-white/50">
            {t('badgeMuseum.earnedCount', { defaultValue: '{{value}} earned', value: formatCount(earned.length) })}
            {' · '}
            {t('badgeMuseum.seeAll', 'See all')}
          </span>
        </span>
      </button>
      <BadgeMuseumSheet address={address} open={open} onOpenChange={setOpen} />
    </section>
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

  const earned = earnedByRarity(data?.milestones ?? []);
  const podium = earned.slice(0, 3);
  // The rest of the wall: earned ones (rarest first), then locked ones closest to done.
  const wall = [
    ...earned.slice(3),
    ...(data?.milestones ?? [])
      .filter((m) => !m.earned)
      .sort((a, b) => b.value / b.goal - a.value / a.goal || a.rarity - b.rarity),
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[88dvh]" data-badge-museum>
        <DrawerHeader className="px-4 pb-1 text-left">
          <DrawerTitle className="flex items-center gap-2 text-white">
            <Landmark aria-hidden className="h-5 w-5" />
            {t('badgeMuseum.title', 'Badge Museum')}
          </DrawerTitle>
          <DrawerDescription className="text-xs text-white/50">
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
                {t('badgeMuseum.hiddenNote', 'Only you can see it')}
              </span>
            )}
          </DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-8">
          {podium.length > 0 && (
            <div className="pb-1 pt-4">
              <MedalPodium medals={podium} sizes={[64, 80]} labels t={t} stagger />
            </div>
          )}
          {wall.length > 0 && (
            <ul
              className={cn(
                'mx-auto grid max-w-2xl grid-cols-4 gap-x-1.5 gap-y-4 sm:grid-cols-5',
                podium.length > 0 && 'border-t border-white/10 pt-4',
              )}
            >
              {wall.map((m, i) => (
                <WallMedal key={m.id} m={m} t={t} index={i + 3} />
              ))}
            </ul>
          )}
          <p className="mt-5 text-center text-[11px] text-white/40">{t('badgeMuseum.footer', 'Badges unlock on their own as milestones are reached.')}</p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function WallMedal({ m, t, index }: { m: Milestone; t: TFunction; index: number }) {
  const name = milestoneName(t, m);
  return (
    <li data-milestone={m.id} data-earned={m.earned || undefined} title={milestoneHint(t, m)} className="flex flex-col items-center gap-1.5 text-center">
      <Medal m={m} size={54} ring index={index} />
      <span className={cn('text-xs font-semibold leading-tight break-words', m.earned ? 'text-white' : 'text-white/60')}>{name}</span>
      {!m.earned && (
        <span className="-mt-1 font-mono text-[10px] leading-tight text-white/45">
          {t('badgeMuseum.progress', {
            defaultValue: '{{value}} / {{goal}}',
            value: formatCount(m.value),
            goal: formatCount(m.goal),
          })}
        </span>
      )}
    </li>
  );
}
