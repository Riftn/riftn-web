/**
 * Games with friends
 * ==================
 * Correspondence chess (days per move, a push when it is your turn) and
 * Okey 101 tables (four seats, bots fill the empty ones). The server is the
 * only judge of moves; these pages draw what it says and send what you tap.
 * Nothing here moves money.
 *
 * @module lib/api/dehub/games
 */
import { apiCall } from './core';

export interface GamePlayer {
  address: string;
  username: string | null;
  displayName: string | null;
  avatarImageUrl: string | null;
}

export interface ChessGame {
  id: string;
  status: 'pending' | 'active' | 'finished' | 'declined' | 'cancelled';
  createdBy: GamePlayer | null;
  invitee: GamePlayer | null;
  white: GamePlayer | null;
  black: GamePlayer | null;
  creatorColor: 'white' | 'black' | 'random';
  daysPerMove: number;
  fen: string;
  moves: string[];
  lastMove: { from: string; to: string } | null;
  turn: 'w' | 'b';
  inCheck: boolean;
  moveDeadline: string | null;
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  endReason: string | null;
  drawOfferBy: string | null;
  you: 'w' | 'b' | null;
  yourTurn: boolean;
  legal?: Array<{ from: string; to: string; promotion?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ChessList {
  games: ChessGame[];
  open: ChessGame[];
  myTurn: number;
  dayChoices: number[];
}

export const chessList = () => apiCall<ChessList>('/api/games/chess', { requiresAuth: true });
export const chessGet = (id: string, signedIn: boolean) =>
  apiCall<{ game: ChessGame }>(`/api/games/chess/${encodeURIComponent(id)}`, { requiresAuth: signedIn });
export const chessCreate = (body: { opponent?: string; days: number; color: 'white' | 'black' | 'random' }) =>
  apiCall<{ game: ChessGame }>('/api/games/chess', { method: 'POST', body, requiresAuth: true });
export const chessAction = (id: string, action: 'accept' | 'decline' | 'resign') =>
  apiCall<{ game: ChessGame }>(`/api/games/chess/${encodeURIComponent(id)}/${action}`, { method: 'POST', requiresAuth: true });
export const chessMove = (id: string, move: { from: string; to: string; promotion?: string }) =>
  apiCall<{ game: ChessGame }>(`/api/games/chess/${encodeURIComponent(id)}/move`, { method: 'POST', body: move, requiresAuth: true });
export const chessDraw = (id: string, action: 'offer' | 'accept' | 'decline') =>
  apiCall<{ game: ChessGame }>(`/api/games/chess/${encodeURIComponent(id)}/draw`, { method: 'POST', body: { action }, requiresAuth: true });

/** Board squares from a FEN, a8 first. */
export function fenBoard(fen: string): Array<{ square: string; piece: string | null }> {
  const rows = fen.split(' ')[0].split('/');
  const out: Array<{ square: string; piece: string | null }> = [];
  rows.forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) out.push({ square: `${'abcdefgh'[file++]}${8 - r}`, piece: null });
      } else {
        out.push({ square: `${'abcdefgh'[file++]}${8 - r}`, piece: ch });
      }
    }
  });
  return out;
}

// ------------------------------------------------------------------ okey

export interface OkeySeatView {
  seat: number;
  address: string | null;
  bot: boolean;
  name: string | null;
  username: string | null;
  avatarImageUrl: string | null;
  tiles: number;
  opened: false | 'melds' | 'pairs';
  openedPoints: number;
  discards: number[];
  total: number;
  idleTurns: number;
}

export interface OkeyMeld {
  id: number;
  seat: number;
  kind: 'run' | 'set' | 'pair';
  tiles: number[];
  points: number;
}

export interface OkeyTable {
  id: string;
  name: string;
  locked: boolean;
  status: 'waiting' | 'playing' | 'closed';
  host: string;
  youHost: boolean;
  version: number;
  seats: OkeySeatView[];
  mySeat: number | null;
  hand: number[] | null;
  round: {
    number: number;
    dealer: number;
    indicator: number;
    deckCount: number;
    turn: number;
    phase: 'draw' | 'play';
    takenDiscard: number | null;
    melds: OkeyMeld[];
    lastAction: { seat: number; type: string; tile?: number; at: number } | null;
    over: boolean;
    winner: number | null;
    scores: number[] | null;
    turnEndsAt: number | null;
  } | null;
  turnSeconds: number;
  serverTime: number;
}

export interface OkeyLobbyRow {
  id: string;
  name: string;
  locked: boolean;
  status: 'waiting' | 'playing';
  round: number;
  players: number;
  bots: number;
  openSeats: number;
  seats: Array<{ seat: number; bot: boolean; name: string | null; avatarImageUrl: string | null; empty: boolean }>;
  mine: boolean;
  host: boolean;
}

export const okeyLobby = (signedIn: boolean) =>
  apiCall<{ tables: OkeyLobbyRow[]; turnSeconds: number }>('/api/games/okey/tables', { requiresAuth: signedIn });
export const okeyCreate = (body: { name?: string; password?: string; withBots?: boolean }) =>
  apiCall<{ table: OkeyTable }>('/api/games/okey/tables', { method: 'POST', body, requiresAuth: true });
export const okeyGet = (id: string, signedIn: boolean) =>
  apiCall<{ table: OkeyTable }>(`/api/games/okey/tables/${encodeURIComponent(id)}`, { requiresAuth: signedIn });
export const okeyJoin = (id: string, body: { password?: string; seat?: number }) =>
  apiCall<{ table: OkeyTable }>(`/api/games/okey/tables/${encodeURIComponent(id)}/join`, { method: 'POST', body, requiresAuth: true });
export const okeyLeave = (id: string) =>
  apiCall<{ ok: boolean }>(`/api/games/okey/tables/${encodeURIComponent(id)}/leave`, { method: 'POST', requiresAuth: true });
export const okeyStart = (id: string) =>
  apiCall<{ table: OkeyTable }>(`/api/games/okey/tables/${encodeURIComponent(id)}/start`, { method: 'POST', requiresAuth: true });
export const okeyNext = (id: string) =>
  apiCall<{ table: OkeyTable }>(`/api/games/okey/tables/${encodeURIComponent(id)}/next`, { method: 'POST', requiresAuth: true });
export type OkeyAction =
  | { type: 'draw'; from: 'deck' | 'discard' }
  | { type: 'putback' }
  | { type: 'lay'; groups: number[][] }
  | { type: 'layoff'; tile: number; meld: number }
  | { type: 'discard'; tile: number };
export const okeyAct = (id: string, action: OkeyAction) =>
  apiCall<{ table: OkeyTable }>(`/api/games/okey/tables/${encodeURIComponent(id)}/action`, { method: 'POST', body: action as unknown as Record<string, unknown>, requiresAuth: true });

/** Colour index 0..3 (red, yellow, blue, black) and number, or a false joker. */
export function tileFace(tile: number): { c: number; n: number; falseJoker: boolean } {
  if (tile >= 104) return { c: -1, n: 0, falseJoker: true };
  return { c: Math.floor(tile / 26), n: (tile % 13) + 1, falseJoker: false };
}

export function okeyOf(indicator: number): { c: number; n: number } {
  const f = tileFace(indicator);
  return { c: f.c, n: f.n === 13 ? 1 : f.n + 1 };
}

export function isOkeyTile(tile: number, indicator: number): boolean {
  if (tile >= 104) return false;
  const f = tileFace(tile);
  const o = okeyOf(indicator);
  return f.c === o.c && f.n === o.n;
}

/** Sort for the rack: by colour then number (runs), or number then colour (sets). */
export function sortTiles(tiles: number[], by: 'runs' | 'sets', indicator?: number): number[] {
  const key = (t: number) => {
    if (indicator !== undefined && t >= 104) {
      const o = okeyOf(indicator);
      return by === 'runs' ? o.c * 100 + o.n : o.n * 10 + o.c;
    }
    const f = tileFace(t);
    if (indicator !== undefined && isOkeyTile(t, indicator)) return 9999;
    return by === 'runs' ? f.c * 100 + f.n : f.n * 10 + f.c;
  };
  return [...tiles].sort((a, b) => key(a) - key(b) || a - b);
}

// ------------------------------------------------------------------ markets

export interface TickerItem {
  id: 'btc' | 'eth' | 'gold';
  label: string;
  price: number;
  change24h: number | null;
}

export const marketTicker = () => apiCall<{ items: TickerItem[]; updatedAt: string }>('/api/markets/ticker');

/**
 * Points of a run or set as the server will count them (preview only; the
 * server decides). Mirrors riftn-backend src/games/okey.engine.ts scoreMeld.
 */
export function meldPoints(tiles: number[], indicator: number): number | null {
  if (tiles.length < 3) return null;
  const wild = tiles.filter((t) => isOkeyTile(t, indicator)).length;
  const fixed = tiles.filter((t) => !isOkeyTile(t, indicator)).map((t) => (t >= 104 ? okeyOf(indicator) : tileFace(t)));
  if (!fixed.length) return null;
  let best: number | null = null;
  if (tiles.length <= 4 && fixed.every((f) => f.n === fixed[0].n) && new Set(fixed.map((f) => f.c)).size === fixed.length) {
    best = fixed[0].n * tiles.length;
  }
  if (fixed.every((f) => f.c === fixed[0].c) && tiles.length <= 13) {
    for (let start = 1; start + tiles.length - 1 <= 14; start++) {
      const free = new Set(Array.from({ length: tiles.length }, (_, i) => start + i));
      let ok = true;
      for (const f of fixed) {
        const slot = f.n === 1 && !free.has(1) && free.has(14) ? 14 : f.n;
        if (!free.has(slot)) { ok = false; break; }
        free.delete(slot);
      }
      if (!ok || free.size !== wild) continue;
      const pts = Array.from({ length: tiles.length }, (_, i) => start + i).reduce((s, v) => s + (v === 14 ? 1 : v), 0);
      if (best === null || pts > best) best = pts;
    }
  }
  return best;
}

export function isPairTiles(tiles: number[], indicator: number): boolean {
  if (tiles.length !== 2) return false;
  const [a, b] = tiles;
  if (isOkeyTile(a, indicator) || isOkeyTile(b, indicator)) return true;
  const fa = a >= 104 ? okeyOf(indicator) : tileFace(a);
  const fb = b >= 104 ? okeyOf(indicator) : tileFace(b);
  return fa.c === fb.c && fa.n === fb.n;
}
