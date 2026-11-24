/**
 * Arcade score cards
 * ==================
 * A game shared from the Arcade carries who shared it
 * (`riftn.com/arcade/chestard?by=jesse`). The feed card asks the server for
 * that player's best on the game's own board (riftn-backend
 * src/games/arcade-card.service.ts), so the score on a card is one the server
 * saw played, never a number typed into a link.
 */
import { apiCall } from './core';

export interface ArcadeCardPlayer {
  address: string;
  username: string | null;
  displayName: string | null;
  avatarImageUrl: string | null;
}

export interface ArcadeCard {
  game: string;
  player: ArcadeCardPlayer | null;
  best: number | null;
  rank: number | null;
  unit: 'points' | 'coins' | null;
}

export const arcadeCard = (game: string, player: string) =>
  apiCall<ArcadeCard>('/api/games/card', { params: { game, player } });

/** Arcade games with a share card of their own in public/og. */
export const ARCADE_CARD_SLUGS = new Set([
  'chestard', 'claude-of-duty', 'correspondence-chess', 'gods-eye', 'gratitude', 'jungle-trail',
  'kings-gambit', 'love-lock-bridge', 'okey', 'sillycoin', 'street-slayer', 'trenchstar',
]);

/** The game slug a `/arcade/<slug>` page path names, or null. */
export function arcadeSlugOf(pagePath: string): string | null {
  const m = /^\/(?:app\/)?arcade\/([a-z0-9-]{1,40})$/i.exec(pagePath);
  const slug = m?.[1]?.toLowerCase() ?? null;
  return slug && ARCADE_CARD_SLUGS.has(slug) ? slug : null;
}

/** The share link for a game, naming the sharer so the card can show their best. */
export function arcadeShareUrl(slug: string, username?: string | null): string {
  const base = `https://riftn.com/arcade/${slug}`;
  return username ? `${base}?by=${encodeURIComponent(username)}` : base;
}
