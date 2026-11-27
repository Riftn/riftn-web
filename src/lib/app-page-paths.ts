/**
 * Pages a riftn.com link can point at
 * ===================================
 * The link parser (`dehub-links`) cards a riftn.com link to one of these as
 * that page, so "riftn.com/app/leaderboard" in a message is a tappable card
 * that opens in the app rather than a grey URL.
 *
 * Paths only, on purpose: `dehub-links` sits on the boot path and must not pull
 * the menu's icons in with it. The card looks the label and icon up in the menu
 * lists itself. `src/test/app-page-paths.test.ts` fails if a menu row or a
 * search-only destination is missing from here.
 *
 * Written without the /app prefix where both forms route; `appPageFor` tries
 * the path as given and with /app added or removed.
 */
export const APP_PAGE_PATHS: readonly string[] = [
  '/app',
  '/app/profile',
  '/app/explore',
  '/app/notifications',
  '/app/messages',
  '/arcade',
  '/app/communities',
  '/app/assistant',
  '/app/settings',
  '/editor',
  '/creator',
  '/stages',
  '/app/bookmarks',
  '/app/command-centre',
  '/app/wallet',
  '/app/events',
  '/app/leaderboard',
  '/leaderboard',
  '/build',
  '/feedback',
  '/app/stake',
  '/app/superpowers',
  '/governance',
  '/dao',
  '/work',
  '/affiliate',
  '/app/jobs',
  '/app/fractions',
  '/stores',
  '/usernames',
  '/accounts',
  '/app/ads',
  '/tv',
  '/apps',
  '/prompt',
  '/converter',
  '/migrate-youtube',
  '/app/glossary',
  '/compare',
  '/guide',
  '/stats',
  '/docs',
  '/docs/blog',
  // Search-only destinations (nav-search SEARCH_ONLY_ITEMS).
  '/videos',
  '/shorts',
  '/music',
  '/app/buy',
  '/app/bridge',
  '/app/top-100',
  '/app/agents',
  '/work/history',
  '/premium',
  '/pricing',
  '/creators',
  '/apk',
  '/connect',
  '/packs',
  '/chat',
  '/planned',
  '/live-studio',
  '/launchpad',
  '/cinema',
];

/**
 * Pages whose children are one item of that page (a game, a pack, a token
 * launch, a live clip). They card as the parent page, with the link kept so a
 * tap still lands on the item.
 */
const ITEM_PARENTS: Record<string, string> = {
  arcade: '/arcade',
  packs: '/packs',
  launchpad: '/launchpad',
  clip: '/shorts',
};

const KNOWN = new Set(APP_PAGE_PATHS);

/**
 * The page a pathname belongs to, written as it appears in APP_PAGE_PATHS, or
 * null when it is not a page we know.
 */
export function appPageFor(pathname: string): string | null {
  let clean = (pathname.replace(/\/+$/, '') || '/').toLowerCase();
  // The Build board's older addresses still card as the board.
  if (/^(?:\/app)?\/(?:features|requests|build)$/.test(clean)) clean = '/build';
  if (KNOWN.has(clean)) return clean;
  const swapped = clean.startsWith('/app/') ? clean.slice(4) : `/app${clean}`;
  if (KNOWN.has(swapped)) return swapped;
  const parts = clean.split('/').filter(Boolean);
  const scoped = parts[0] === 'app' ? parts.slice(1) : parts;
  // One item of a page (/arcade/<game>, /packs/<slug>). Kept whole: the card
  // shows the item's own menu row when there is one (the arcade games are
  // listed) and the parent page's otherwise — see `appPageParent`.
  if (scoped.length === 2 && ITEM_PARENTS[scoped[0]] && /^[a-z0-9_-]{1,80}$/i.test(scoped[1])) {
    return `/${scoped.join('/')}`;
  }
  return null;
}

/** The page an item belongs to (`/packs/starter` -> `/packs`), or null. */
export function appPageParent(pagePath: string): string | null {
  const parts = pagePath.split('/').filter(Boolean);
  return parts.length === 2 ? ITEM_PARENTS[parts[0]] ?? null : null;
}
