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
 * - `BadgeMuseumSheet` lists every step: earned ones lit, locked ones dimmed
 *   with a progress bar ("640 / 1K").
 *
 * @module components/app/profile/BadgeMuseum
 */

import { useState } from 'react';
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

  if (!data) return null;
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
