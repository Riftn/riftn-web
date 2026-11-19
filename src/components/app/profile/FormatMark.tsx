/**
 * FormatMark
 * ==========
 * One small custom icon per post format (photo, video, short, comic, song,
 * stage, poll...), drawn in the same top-right spot on every grid tile. It
 * replaces the old text pills ("Comic", "Short", "Earn") and the stock icons
 * in glass circles, so a grid reads by shape instead of by words.
 *
 * Every glyph is our own: 24-unit square, round line ends, one detail that
 * tells it apart (the photo's viewfinder corners, the short's swipe-up
 * chevron, the comic's slanted gutter). Parts marked `fill` take the duotone
 * wash in the glass look.
 *
 * @module components/app/profile/FormatMark
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SpotifyLogo } from '@/components/app/cards/SpotifyCard';
import type { GridCardKind } from '@/lib/grid-card';

export type FormatKind = GridCardKind | 'photo' | 'photos' | 'video' | 'replay' | 'audio' | 'article' | 'text';

/** Each glyph: the shape that takes the duotone wash, then the lines on top. */
const GLYPHS: Record<FormatKind, { wash?: ReactNode; lines: ReactNode }> = {
  photo: {
    wash: <path d="M7 17.5l3.6-4.2 2.7 2.7 1.9-1.9 2.8 3.4z" />,
    lines: (
      <>
        <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
        <circle cx="9.3" cy="8.8" r="1.5" />
        <path d="M7 17.5l3.6-4.2 2.7 2.7 1.9-1.9 2.8 3.4" />
      </>
    ),
  },
  photos: {
    wash: <rect x="3" y="7" width="14" height="14" rx="3" />,
    lines: (
      <>
        <path d="M7.5 3H18a3 3 0 0 1 3 3v10.5" />
        <rect x="3" y="7" width="14" height="14" rx="3" />
        <path d="M6 18l3.2-3.4 2.3 2.3 1.4-1.4 1.6 2.5" />
      </>
    ),
  },
  video: {
    wash: <rect x="2.5" y="4.5" width="19" height="15" rx="4" />,
    lines: (
      <>
        <rect x="2.5" y="4.5" width="19" height="15" rx="4" />
        <path d="M10.2 8.6v4.8l4-2.4z" fill="currentColor" />
        <path d="M6.5 16.3h3.5" />
      </>
    ),
  },
  short: {
    wash: <rect x="6" y="2.5" width="12" height="19" rx="3.5" />,
    lines: (
      <>
        <rect x="6" y="2.5" width="12" height="19" rx="3.5" />
        <path d="M10.6 10.3v4.4l3.6-2.2z" fill="currentColor" />
        <path d="M10.3 6.4L12 5.2l1.7 1.2" />
      </>
    ),
  },
  replay: {
    wash: <circle cx="12" cy="12" r="3" />,
    lines: (
      <>
        <path d="M4.4 9.2A8 8 0 1 1 4 12" />
        <path d="M3.6 5.2v4.3h4.3" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </>
    ),
  },
  audio: {
    wash: <circle cx="12" cy="12" r="9" />,
    lines: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="2.4" />
        <path d="M12 6.2a5.8 5.8 0 0 1 5.8 5.8" />
      </>
    ),
  },
  article: {
    wash: <path d="M6.5 2.5H14l5 5v11.5a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 4 19V5a2.5 2.5 0 0 1 2.5-2.5z" />,
    lines: (
      <>
        <path d="M6.5 2.5H14l5 5v11.5a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 4 19V5a2.5 2.5 0 0 1 2.5-2.5z" />
        <path d="M14 2.5v5h5" />
        <path d="M7.5 12h7M7.5 15.3h8M7.5 18.5h4.5" />
      </>
    ),
  },
  text: {
    wash: <path d="M6.5 3.5h11a3 3 0 0 1 3 3V14a3 3 0 0 1-3 3H11.5L7 20.8V17h-.5a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3z" />,
    lines: (
      <>
        <path d="M6.5 3.5h11a3 3 0 0 1 3 3V14a3 3 0 0 1-3 3H11.5L7 20.8V17h-.5a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3z" />
        <path d="M8.6 7.8h6.8M12 7.8v5.4" />
      </>
    ),
  },
  comic: {
    wash: <path d="M12 3h6a3 3 0 0 1 3 3v5h-9z" />,
    lines: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M12 3v8M3 11h18M14.5 11l-2.8 10" />
      </>
    ),
  },
  earn: {
    wash: <circle cx="10.5" cy="13.5" r="7.5" />,
    lines: (
      <>
        <circle cx="10.5" cy="13.5" r="7.5" />
        <circle cx="10.5" cy="13.5" r="3.6" />
        <path d="M19.5 2.5v4.6M17.2 4.8h4.6" />
      </>
    ),
  },
  stage: {
    wash: <rect x="9" y="2.5" width="6" height="11" rx="3" />,
    lines: (
      <>
        <rect x="9" y="2.5" width="6" height="11" rx="3" />
        <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M9 21h6" />
      </>
    ),
  },
  event: {
    wash: <path d="M3 9.5h18V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" />,
    lines: (
      <>
        <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        <circle cx="12" cy="15.2" r="2" fill="currentColor" />
      </>
    ),
  },
  poll: {
    wash: <rect x="3" y="10" width="18" height="4" rx="2" />,
    lines: (
      <>
        <rect x="3" y="4" width="11" height="4" rx="2" />
        <rect x="3" y="10" width="18" height="4" rx="2" />
        <rect x="3" y="16" width="7" height="4" rx="2" />
      </>
    ),
  },
  quote: {
    wash: (
      <>
        <circle cx="7" cy="14.5" r="3" />
        <circle cx="17" cy="14.5" r="3" />
      </>
    ),
    lines: (
      <>
        <circle cx="7" cy="14.5" r="3" />
        <circle cx="17" cy="14.5" r="3" />
        <path d="M4 14.5c0-4.2 2-7.2 5.5-8.3M14 14.5c0-4.2 2-7.2 5.5-8.3" />
      </>
    ),
  },
  sharedPost: {
    wash: <rect x="3" y="7.5" width="12" height="13.5" rx="2.5" />,
    lines: (
      <>
        <path d="M15 13.5V18.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 3 18.5v-8.5A2.5 2.5 0 0 1 5.5 7.5H10" />
        <path d="M11 13L20.5 3.5M14.8 3.5h5.7v5.7" />
      </>
    ),
  },
  link: {
    lines: (
      <>
        <path d="M10 14a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 0 0 5.7 5.7l1-1" />
      </>
    ),
  },
  community: {
    wash: <circle cx="12" cy="8" r="3.2" />,
    lines: (
      <>
        <circle cx="12" cy="8" r="3.2" />
        <circle cx="5" cy="10" r="2.2" />
        <circle cx="19" cy="10" r="2.2" />
        <path d="M6.5 20.5a5.5 5.5 0 0 1 11 0M1.8 18.6a3.4 3.4 0 0 1 4.2-3.2M22.2 18.6a3.4 3.4 0 0 0-4.2-3.2" />
      </>
    ),
  },
  shop: {
    wash: <path d="M5 8h14l-1 12.4a1.6 1.6 0 0 1-1.6 1.4H7.6A1.6 1.6 0 0 1 6 20.4z" />,
    lines: (
      <>
        <path d="M5 8h14l-1 12.4a1.6 1.6 0 0 1-1.6 1.4H7.6A1.6 1.6 0 0 1 6 20.4z" />
        <path d="M9 10.5V6.5a3 3 0 0 1 6 0v4" />
      </>
    ),
  },
  profile: {
    wash: <rect x="2.5" y="5" width="19" height="14" rx="3" />,
    lines: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="3" />
        <circle cx="8.5" cy="10.6" r="2.1" />
        <path d="M5.5 15.8a3 3 0 0 1 6 0M14.2 10h4.3M14.2 13.4h2.8" />
      </>
    ),
  },
  film: {
    wash: <rect x="3" y="9.5" width="18" height="11.5" rx="2.5" />,
    lines: (
      <>
        <rect x="3" y="9.5" width="18" height="11.5" rx="2.5" />
        <path d="M3.3 9.4l-.5-2.8a1.5 1.5 0 0 1 1.2-1.7l13.6-2.4a1.5 1.5 0 0 1 1.7 1.2l.5 2.6M8 4.8l2.4 3.6M13.3 3.9l2.4 3.6" />
      </>
    ),
  },
  bounty: {
    wash: <circle cx="12" cy="12" r="5.5" />,
    lines: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5.5" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      </>
    ),
  },
  app: {
    wash: <circle cx="17.5" cy="17.5" r="3.5" />,
    lines: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2.2" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2" />
        <circle cx="17.25" cy="17.25" r="3.75" />
      </>
    ),
  },
  proposal: {
    wash: <path d="M3.5 13.5h17v6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
    lines: (
      <>
        <path d="M3.5 13.5h17v6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM7.5 13.5V4a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 16.5 4v9.5" />
        <path d="M10 8l1.6 1.6L14.4 6.8" />
      </>
    ),
  },
  spotify: { lines: null },
};

const LABEL: Record<FormatKind, [string, string]> = {
  photo: ['profile.format.photo', 'Photo'],
  photos: ['profile.multiPhoto', 'Photos'],
  video: ['profile.tabs.videos', 'Video'],
  short: ['profile.gridCard.short', 'Short'],
  replay: ['profile.tabs.live', 'Live'],
  audio: ['profile.tabs.songs', 'Audio'],
  article: ['profile.tabs.articles', 'Article'],
  text: ['profile.tabs.posts', 'Post'],
  comic: ['profile.gridCard.comic', 'Comic'],
  earn: ['profile.gridCard.earn', 'Earn'],
  stage: ['profile.gridCard.stage', 'Stage'],
  event: ['profile.gridCard.event', 'Event'],
  poll: ['profile.gridCard.poll', 'Poll'],
  quote: ['profile.gridCard.quote', 'Quote'],
  sharedPost: ['profile.gridCard.shared', 'Shared'],
  link: ['profile.gridCard.link', 'Link'],
  community: ['profile.gridCard.community', 'Community'],
  shop: ['profile.gridCard.shop', 'Shop'],
  profile: ['profile.gridCard.profile', 'Profile'],
  film: ['profile.gridCard.film', 'Film'],
  bounty: ['profile.gridCard.bounty', 'Bounty'],
  app: ['profile.gridCard.app', 'App'],
  proposal: ['profile.gridCard.proposal', 'Proposal'],
  spotify: ['profile.gridCard.spotify', 'Spotify'],
};

/** Just the glyph, for places that draw their own frame. */
export function FormatGlyph({ kind, className }: { kind: FormatKind; className?: string }) {
  if (kind === 'spotify') return <SpotifyLogo className={className} />;
  const { wash, lines } = GLYPHS[kind];
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {wash && <g className="fmt-wash" fill="currentColor" stroke="none">{wash}</g>}
      {lines}
    </svg>
  );
}

/** The mark on a tile: glyph in its spot, named for screen readers. `live` adds the red dot. */
export function FormatMark({ kind, live, className }: { kind: FormatKind; live?: boolean; className?: string }) {
  const { t } = useTranslation();
  const [key, label] = LABEL[kind];
  const name = live ? t('profile.gridCard.liveStage', 'Live stage') : t(key, label);
  return (
    <span className={`pmg-fmt pmg-fmt--${kind}${live ? ' pmg-fmt--live' : ''}${className ? ` ${className}` : ''}`} role="img" aria-label={name} title={name}>
      <FormatGlyph kind={kind} className="pmg-fmt-glyph" />
      {live && <i className="pmg-fmt-dot" />}
    </span>
  );
}
