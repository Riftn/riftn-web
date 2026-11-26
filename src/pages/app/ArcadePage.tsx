import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Arcade Page
 * ===========
 * The front door to every playable game in the app, at `/arcade`.
 *
 * Before this page the games were unlistable: each one was welded to a single
 * theme and only offered when a player pressed an arrow key while that theme
 * was active. Nothing enumerated them, so nobody who had not stumbled into the
 * War or Jungle theme knew they existed. This page reads `config/arcade-games`
 * and shows all of them, and the theme launchers stay exactly as they were — a
 * second, more theatrical way in.
 *
 * Cards use each game's approved branding when available, otherwise a capture.
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Hourglass, Swords } from "lucide-react";
import Upload from "@/components/ui/cut-icons/upload";
import Hidden from '@/components/ui/cut-icons/hidden';
import Visibility from '@/components/ui/cut-icons/visibility';

import Play from "@/components/ui/cut-icons/play";

import { useReducedMotion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IslandAction, PageBody, PageIsland } from '@/components/app/page-kit/PageKit';
import { SEOHead } from '@/components/SEOHead';
import { ArcadeLeaderboard } from '@/components/app/arcade/ArcadeLeaderboard';
import { ArcadeSubmissionForm } from '@/components/app/arcade/ArcadeSubmissionForm';
import { useAuth } from '@/contexts/AuthContext';
import { ARCADE_GAMES, type ArcadeGame } from '@/config/arcade-games';
import { COCHRANIZ3R, groupArcadeGames } from '@/config/arcade-creators';
import { getAccountSummariesByUsernames } from '@/lib/api/dehub/users';
import { getArcadeListings, setArcadeListing, type ArcadeListingState } from '@/lib/api/dehub/games';
import { buildAvatarUrl } from '@/lib/media-url';
import { profilePath } from '@/lib/profile-path';

/** Arcade entries with their own routes outside the embedded-game registry. */
const LINK_GAMES = [
  {
    href: '/arcade/okey',
    listingSlug: 'okey',
    creator: { username: 'galatasaray' },
    art: '/og/arcade-okey.jpg',
    titleKey: 'games.okey.title',
    title: 'Okey 101',
    blurbKey: 'games.okey.cardBlurb',
    blurb: 'Four seats for friends, bots fill the rest. Open tables or lock one with a password.',
  },
  {
    href: '/arcade/sillycoin',
    listingSlug: 'sillycoin',
    creator: COCHRANIZ3R,
    art: '/og/arcade-sillycoin.jpg',
    titleKey: 'games.sillycoin.title',
    title: 'SillyCoin',
    blurbKey: 'games.sillycoin.cardBlurb',
    blurb: 'Tap to mine, buy upgrades, send coins to friends. Just for fun, no value.',
  },
  {
    href: '/arcade/chestard',
    listingSlug: 'chestard',
    creator: COCHRANIZ3R,
    art: '/og/arcade-chestard.jpg',
    titleKey: 'games.chestard.title',
    title: 'Chestard',
    blurbKey: 'games.chestard.cardBlurb',
    blurb: 'Roll the die, drop the checker, clear the bottom row. Retro arcade with a top 10.',
  },
  {
    href: '/arcade/splurge',
    listingSlug: 'splurge',
    creator: COCHRANIZ3R,
    art: '/arcade/splurge.webp',
    titleKey: 'games.splurge.title',
    title: 'Splurge',
    blurbKey: 'games.splurge.cardBlurb',
    blurb: 'Get a random budget and dream up what to buy in Modern or CRT.',
  },
  {
    href: '/music/binary-metal',
    listingSlug: 'binary-metal',
    creator: COCHRANIZ3R,
    art: '/og/music-binary-metal.jpg',
    titleKey: 'binaryMetal.title',
    title: 'Binary Metal',
    blurbKey: 'binaryMetal.cardBlurb',
    blurb: 'Type anything and hear it as a metal riff. Download WAV or MP3.',
  },
  {
    href: '/arcade/gratitude',
    listingSlug: 'gratitude',
    creator: COCHRANIZ3R,
    art: '/og/arcade-gratitude.jpg',
    titleKey: 'games.gratitude.title',
    title: 'Gratitude pen pals',
    blurbKey: 'games.gratitude.cardBlurb',
    blurb: 'Take turns saying what you are grateful for. No repeats. Miss your turn and they win.',
  },
  {
    href: '/arcade/spend',
    creator: COCHRANIZ3R,
    art: '/og/arcade-spend.jpg',
    titleKey: 'games.spend.title',
    title: 'SPEND!',
    blurbKey: 'games.spend.cardBlurb',
    blurb: 'Roll the die and dream up a purchase. Play by correspondence, at a live table, or against the computer.',
  },
] as const;

const CREATOR_GROUPS = groupArcadeGames([...LINK_GAMES, ...ARCADE_GAMES]);
const CREATOR_USERNAMES = CREATOR_GROUPS.flatMap((group) => group.username ? [group.username] : []);

/** The games that are a competition, in registry order. */
const RANKED_GAMES = ARCADE_GAMES.filter((game) => game.leaderboard);

function GameCard({ game }: { game: ArcadeGame }) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  // Reduced motion gets the clip's poster as a plain image, never the loop.
  const reduceMotion = useReducedMotion();
  return (
    <div
      data-feed-item
      data-arcade-card
      className="group flex flex-1 flex-col overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/[0.06] transition-colors hover:ring-white/[0.14]"
    >
      <Link to={`/arcade/${game.slug}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
        <div data-arcade-art data-media-scrim={!game.brand || undefined} className="relative aspect-video overflow-hidden bg-black">
          {!game.brand && game.artVideo && !reduceMotion ? (
            <video
              src={game.artVideo}
              poster={game.art}
              aria-label={game.artAlt}
              width={1280}
              height={720}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <img
              src={game.brand ?? game.art}
              alt={game.brand ? game.title : game.artAlt}
              width={1280}
              height={720}
              loading="eager"
              decoding="async"
              className={`h-full w-full ${game.brand ? 'object-contain' : 'object-cover'} transition-transform duration-500 group-hover:scale-[1.03]`}
            />
          )}
          {/* Keeps the title legible over whatever the capture happens to be. */}
          {!game.brand && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />}
          <div className={game.brand ? 'sr-only' : 'pointer-events-none absolute inset-x-0 bottom-0 p-4'}>
            <h3 className="text-lg font-semibold leading-tight text-white">{game.title}</h3>
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-xs leading-relaxed text-zinc-400">{game.description}</p>

        <div className="mt-auto flex flex-col gap-2">
          <Link
            to={`/arcade/${game.slug}`}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90"
          >
            <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {game.action}
          </Link>
          {game.onlineHref ? (
            <Link
              to={game.onlineHref}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              <Swords className="h-3.5 w-3.5" />{_copy("copy.339071395687", { defaultValue: "Wager" })}</Link>
          ) : null}
          {game.slowHref ? (
            <Link
              to={game.slowHref}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              <Hourglass className="h-3.5 w-3.5" />{t('games.chess.slowButton', { defaultValue: 'Days per move, vs a friend' })}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LinkGameCard({ game }: { game: typeof LINK_GAMES[number] }) {
  const { t } = useTranslation();
  return (
    <Link
      to={game.href}
      data-feed-item
      data-arcade-card
      className="group flex flex-1 flex-col overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/[0.06] transition-colors hover:ring-white/[0.14]"
    >
      <div className="relative aspect-[1200/630] overflow-hidden bg-black">
        <img src={game.art} alt="" width={1200} height={630} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
      <div className="flex flex-col gap-1 p-4">
        <h3 className="text-sm font-semibold text-white">{t(game.titleKey, { defaultValue: game.title })}</h3>
        <p className="text-xs leading-relaxed text-zinc-400">{t(game.blurbKey, { defaultValue: game.blurb })}</p>
      </div>
    </Link>
  );
}

function CreatorShelves({ wallet }: { wallet: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const listingQueryKey = ['arcade-listings'];
  const listings = useQuery({
    queryKey: [...listingQueryKey, wallet],
    queryFn: () => getArcadeListings(Boolean(wallet)),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const changeListing = useMutation({
    mutationFn: ({ slug, hidden }: { slug: string; hidden: boolean }) => setArcadeListing(slug, hidden),
    onSuccess: async ({ slug, hidden }) => {
      await queryClient.cancelQueries({ queryKey: listingQueryKey });
      queryClient.setQueriesData<ArcadeListingState>({ queryKey: listingQueryKey }, (current) => current && ({
        ...current,
        hidden: hidden ? [...new Set([...current.hidden, slug])] : current.hidden.filter((id) => id !== slug),
      }));
      await queryClient.invalidateQueries({ queryKey: listingQueryKey });
    },
    onError: () => toast.error(t('arcade.listingUpdateError')),
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ['arcade-creator-profiles', CREATOR_USERNAMES],
    queryFn: () => getAccountSummariesByUsernames(CREATOR_USERNAMES),
    enabled: CREATOR_USERNAMES.length > 0,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-3">
      {listings.isError && !listings.data && (
        <p role="status" className="text-sm text-muted-foreground">{t('arcade.listingsLoadError')}</p>
      )}
      {CREATOR_GROUPS.map((group) => {
        const games = group.games.filter((game) => !('listingSlug' in game) || (
          listings.data && (!listings.data.hidden.includes(game.listingSlug) || listings.data.editable.includes(game.listingSlug))
        ));
        if (!games.length) return null;
        const editable = games.some((game) => 'listingSlug' in game && listings.data?.editable.includes(game.listingSlug));
        const profile = group.username ? profiles.find((entry) => entry.username?.toLowerCase() === group.username) : undefined;
        const name = profile?.displayName?.trim() || group.name || (
          group.id === 'riftn' ? t('arcade.riftnOriginals') : t('arcade.otherGames')
        );
        const avatarUrl = profile?.avatarImageUrl
          ? buildAvatarUrl(profile.address, profile.avatarImageUrl)
          : group.avatarUrl;
        const headingId = `arcade-creator-${group.id}`;
        const identity = (
          <>
            <Avatar className="size-8">
              <AvatarImage src={avatarUrl ?? undefined} className="object-cover" referrerPolicy="no-referrer" />
              <AvatarFallback aria-hidden="true" className="text-xs text-muted-foreground">
                {name.replace(/^@/, '').slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{name}</span>
          </>
        );

        return (
          <section key={group.id} aria-labelledby={headingId} className="min-w-0">
            <header className="mb-2 flex min-w-0 items-center justify-between gap-3">
              <h2 id={headingId} className="min-w-0 text-sm font-semibold text-white">
                {group.username ? (
                  <Link to={profilePath(group.username)} className="flex items-center gap-2 hover:underline">{identity}</Link>
                ) : group.profileUrl ? (
                  <a href={group.profileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">{identity}</a>
                ) : (
                  <span className="flex items-center gap-2">{identity}</span>
                )}
              </h2>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                {t('arcade.gameCount', { count: games.length })}
              </span>
            </header>
            {editable && <p className="mb-2 text-sm text-muted-foreground">{t('arcade.listingHint')}</p>}
            <ul className="-mx-1 flex min-w-0 snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain p-1">
              {games.map((game) => {
                const slug = 'listingSlug' in game ? game.listingSlug : null;
                const canEdit = slug !== null && listings.data?.editable.includes(slug);
                const hidden = slug !== null && Boolean(listings.data?.hidden.includes(slug));
                const loading = changeListing.isPending && changeListing.variables?.slug === slug;
                const action = t(hidden ? 'arcade.showListing' : 'arcade.hideListing');
                return (
                  <li
                    key={'slug' in game ? game.slug : game.href}
                    className="flex min-w-0 shrink-0 basis-[84%] flex-col items-stretch gap-2 snap-start sm:basis-[calc(50%_-_0.375rem)] lg:basis-[calc(33.333%_-_0.5rem)]"
                  >
                    {'slug' in game ? <GameCard game={game} /> : <LinkGameCard game={game} />}
                    {canEdit && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-11 max-w-full self-start whitespace-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        aria-label={t('arcade.listingActionLabel', { action, game: 'titleKey' in game ? t(game.titleKey) : game.title })}
                        disabled={changeListing.isPending && !loading}
                        loading={loading}
                        onClick={() => changeListing.mutate({ slug, hidden: !hidden })}
                      >
                        {!loading && (hidden ? <Visibility aria-hidden /> : <Hidden aria-hidden />)}
                        {action}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function ArcadePage() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const submissionOpen = searchParams.get('submit') === '1';
  const openSubmission = () => setSearchParams((previous) => { const next = new URLSearchParams(previous); next.set('submit', '1'); return next; });
  const closeSubmission = () => setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete('submit'); return next; });
  const { walletAddress } = useAuth();
  const wallet = walletAddress?.toLowerCase() ?? null;
  const [board, setBoard] = useState(RANKED_GAMES[0]?.slug ?? '');

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('arcade.seoTitle')}
        description={t('arcade.seoDescription')}
        // The same card CLOUDFLARE_WORKER_SEO.js serves crawlers for /arcade.
        // Both variants must name one image: the worker declares it 1200x630,
        // and a scraper that ran the SPA instead would inherit that claim for
        // whatever this said.
        image="https://riftn.com/og/arcade.jpg"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Riftn Arcade',
          url: 'https://riftn.com/arcade',
          hasPart: ARCADE_GAMES.map((game) => ({
            '@type': 'VideoGame',
            name: game.title,
            description: game.tagline,
            url: `https://riftn.com/arcade/${game.slug}`,
            image: `https://riftn.com${game.art}`,
            applicationCategory: 'Game',
            gamePlatform: 'Web browser',
            operatingSystem: 'Any',
          })),
        }}
      />

      <PageIsland
        className="mx-auto max-w-4xl"
        icon="arcade"
        title={t('arcade.title')}
        actions={
          <IslandAction label={_copy("copy.3bb8f2fe14a5", { defaultValue: "Submit a game" })} onClick={openSubmission}>
            <Upload className="h-[18px] w-[18px]" />
          </IslandAction>
        }
      >
        <p className="text-xs leading-relaxed text-zinc-400">
          {t('arcade.intro')}
        </p>
      </PageIsland>

      <PageBody className="mx-auto max-w-4xl">
        <CreatorShelves wallet={wallet} />

        {RANKED_GAMES.length > 0 ? (
          <section data-feed-item data-kit-section className="bg-zinc-900/60 p-4 ring-1 ring-white/[0.06]">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {RANKED_GAMES.map((game) => (
                <button
                  key={game.slug}
                  type="button"
                  onClick={() => setBoard(game.slug)}
                  aria-pressed={board === game.slug}
                  data-filter-chip
                  data-active={board === game.slug ? 'true' : 'false'}
                  className={
                    board === game.slug
                      ? 'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black'
                      : 'rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-700'
                  }
                >
                  {game.title}
                </button>
              ))}
            </div>
            <ArcadeLeaderboard slug={board} wallet={wallet} limit={10} />
          </section>
        ) : null}
      </PageBody>
      {submissionOpen && <ArcadeSubmissionForm onClose={closeSubmission} />}
    </div>
  );
}
