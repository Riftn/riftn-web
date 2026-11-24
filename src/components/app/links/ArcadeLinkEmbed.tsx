/**
 * Arcade Link Embed
 * =================
 * A riftn.com/arcade/<game> link as a score card: the game's own art as the
 * thumbnail and, when the link names who shared it (`?by=<username>`), that
 * player's name and best score from the game's board laid over the bottom of
 * the art. Below the art, the game's name and a Play button.
 *
 * The score is read from the server (see lib/api/dehub/arcade-card), never
 * from the link, so a card can't claim a score nobody played.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { appPageLabel, appPageRow } from '@/components/app/navigation/app-page-rows';
import { arcadeCard } from '@/lib/api/dehub/arcade-card';
import { formatCount } from '@/lib/format-count';
import { buildAvatarUrl } from '@/lib/media-url';

/** First-party games: their names live under games.* */
const GAME_TITLES: Record<string, [string, string]> = {
  chestard: ['games.chestard.title', 'Chestard'],
  sillycoin: ['games.sillycoin.title', 'SillyCoin'],
  okey: ['games.okey.title', 'Okey 101'],
  gratitude: ['games.gratitude.title', 'Gratitude pen pals'],
  'correspondence-chess': ['games.chess.title', 'Correspondence chess'],
};

const humanize = (slug: string) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/**
 * What a shared link says about itself: `?by=` (who shared it, cleaned to
 * something that can be a username or address) and `?snap=1` (posted with a
 * snapshot of the game, so the post already has its picture and the card
 * drops the art).
 */
function sharedLink(path: string): { by: string | null; snap: boolean } {
  try {
    const q = new URL(path, 'https://riftn.com').searchParams;
    const by = q.get('by')?.trim().replace(/^@/, '') ?? '';
    return { by: /^[A-Za-z0-9_.-]{1,42}$/.test(by) ? by : null, snap: q.get('snap') === '1' };
  } catch {
    return { by: null, snap: false };
  }
}

interface ArcadeLinkEmbedProps {
  slug: string;
  pagePath: string;
  /** Where the link pointed, query and all. */
  path: string;
  fallback?: ReactNode;
}

export function ArcadeLinkEmbed({ slug, pagePath, path }: ArcadeLinkEmbedProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { by, snap } = sharedLink(path);
  const { data: card } = useQuery({
    queryKey: ['arcade-card', slug, by?.toLowerCase()],
    queryFn: () => arcadeCard(slug, by!),
    enabled: !!by,
    staleTime: 60_000,
  });

  const row = appPageRow(pagePath);
  const own = row && row.path.replace(/^\/app/, '') === pagePath.replace(/^\/app/, '');
  const known = GAME_TITLES[slug];
  const title = known
    ? (t(known[0], { defaultValue: known[1] }) as string)
    : own && row
      ? appPageLabel(row, (k, d) => t(k, d) as string)
      : humanize(slug);
  const Icon = row?.icon;

  const player = card?.player ?? null;
  const name = player ? (player.username ? `@${player.username}` : player.displayName || `${player.address.slice(0, 6)}…`) : null;
  const avatar = player ? buildAvatarUrl(player.address, player.avatarImageUrl) : null;
  const hasScore = card?.best != null && card.best > 0;
  const scoreLabel = card?.unit === 'coins'
    ? t('arcadeCard.mined', { defaultValue: 'Coins mined' })
    : t('arcadeCard.best', { defaultValue: 'Best score' });
  // The link without `by`: opening the card plays the game, it isn't a profile link.
  const playPath = path.split('?')[0];

  const avatarEl = avatar ? (
    <img src={avatar} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/30" />
  ) : (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-sm font-semibold text-white ring-1 ring-white/30">
      {(name ?? '?').replace('@', '').slice(0, 1).toUpperCase()}
    </span>
  );
  const scoreLine = hasScore
    ? card?.rank
      ? t('arcadeCard.rankLine', { defaultValue: '{{label}} · #{{rank}} on the board', label: scoreLabel, rank: formatCount(card.rank) })
      : scoreLabel
    : t('arcadeCard.shared', { defaultValue: 'Shared this game' });
  const play = (
    <span className="shrink-0 rounded-[10px] bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/[0.1]">
      {t('arcadeCard.play', { defaultValue: 'Play' })}
    </span>
  );
  const open = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    navigate(playPath);
  };

  // Posted with a snapshot: the picture is already on the post, so the card is
  // one row, the sharer and their best, and Play.
  if (snap && player) {
    return (
      <button
        type="button"
        onClick={open}
        data-no-navigate
        data-glass-embed
        data-page-embed
        data-arcade-embed
        className="mt-2 flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-white/[0.07]"
      >
        {avatarEl}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="truncate text-xs text-zinc-400">{hasScore && card?.rank ? `${title} · #${formatCount(card.rank)}` : title}</p>
        </div>
        {hasScore ? <p className="shrink-0 text-xl font-bold leading-none tabular-nums text-white">{formatCount(card!.best!)}</p> : null}
        {play}
      </button>
    );
  }

  // A div, not a <button>: theme rules repaint every descendant of a filled
  // button in light themes, which would turn the name and score on the art dark.
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(e);
        }
      }}
      data-no-navigate
      data-glass-embed
      data-page-embed
      data-arcade-embed
      className="mt-2 block w-full cursor-pointer overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04] text-left transition-colors [@media(hover:hover)]:hover:bg-white/[0.07]"
    >
      <div data-on-media data-keep-dark className="relative aspect-[1200/630] w-full overflow-hidden bg-black">
        <img
          src={`/og/arcade-${slug}.jpg`}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {player ? (
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 pb-3 pt-14">
            {avatarEl}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-white">{name}</p>
              <p className="mt-0.5 truncate text-xs leading-tight text-white/80">{scoreLine}</p>
            </div>
            {hasScore ? (
              <p className="shrink-0 text-2xl font-bold leading-none tabular-nums text-white">{formatCount(card!.best!)}</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {Icon ? <Icon className="h-5 w-5 shrink-0 text-white" /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          <p className="truncate text-xs text-zinc-500">riftn.com{playPath}</p>
        </div>
        {play}
      </div>
    </div>
  );
}
