export const SPEND_PATH = '/arcade/spend';

// The 19 stops are ordered clockwise from START, as on Jesse Cochran's board.
export const SPEND_BOARD = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export const SPEND_PAWNS = ['#12713e', '#1c56b0', '#8328ae', '#a83b19', '#a11656', '#246577'] as const;

export const SPEND_LEVELS = ['easy', 'normal', 'hard'] as const;
export const SPEND_PALS_DAYS = [1, 2, 3, 5, 7] as const;
export const SPEND_LIVE_SECONDS = [30, 60, 90] as const;
export const SPEND_COMPUTER_SECONDS = [60, 300, 86_400] as const;

export type SpendLevel = typeof SPEND_LEVELS[number];
export type SpendMode = 'pals' | 'live' | 'computer';
export type SpendCreate =
  | { mode: 'pals'; days: number; opponent?: string }
  | { mode: 'live'; turnSeconds: number }
  | { mode: 'computer'; turnSeconds: number; level: SpendLevel };
export type SpendAction =
  | { name: 'join' | 'leave' | 'start' | 'roll' | 'save' | 'give-up' }
  | { name: 'buy'; body: { text: string } }
  | { name: 'computer'; body: { level: SpendLevel } | { remove: string } };

export interface SpendPlayer {
  address: string;
  username: string | null;
  displayName: string | null;
  computer?: SpendLevel;
}

export interface SpendGame {
  id: string;
  mode: 'pals' | 'live';
  status: 'pending' | 'active' | 'finished' | 'declined' | 'cancelled';
  createdBy: SpendPlayer | null;
  invitee: SpendPlayer | null;
  seats: {
    index: number;
    player: SpendPlayer;
    pos: number;
    out: boolean;
    outReason: string | null;
    saved: boolean;
  }[];
  turnSeconds: number;
  phase: 'roll' | 'buy';
  amount: number;
  acting: number;
  you: number;
  yourTurn: boolean;
  host: boolean;
  million: { lander: number; queue: number[] } | null;
  lastRoll: { seat: number; value: number; from: number; to: number } | null;
  buys?: { n: number; seat: number; amount: number; text: string; saved: boolean }[];
  turnDeadline: string | null;
  winner: SpendPlayer | null;
  maxSeats: number;
  maxChars: number;
  board: readonly number[];
  serverNow: string;
}

export interface SpendLobby {
  games: SpendGame[];
  open: SpendGame[];
}

export function spendSpace(index: number) {
  if (index === 0) return { column: 5, row: 4, height: 2 };
  if (index < 6) return { column: 5 - index, row: 5, height: 1 };
  if (index < 10) return { column: 0, row: 10 - index, height: 1 };
  if (index < 16) return { column: index - 10, row: 0, height: 1 };
  return { column: 5, row: index - 15, height: 1 };
}

export function spendName(player: SpendPlayer | null | undefined) {
  if (!player) return '';
  return player.displayName || (player.username ? '@' + player.username : player.address.slice(0, 8));
}

export function spendMoney(amount: number) {
  return '$' + amount.toLocaleString('en-US');
}

export function spendPoll(game: SpendGame | undefined) {
  if (!game) return false;
  if (game.mode === 'live' && (game.status === 'pending' || game.status === 'active')) return 2_000;
  if (game.status === 'pending') return 8_000;
  if (game.status !== 'active') return false;
  return game.turnSeconds <= 300 || game.seats[game.acting]?.player.computer ? 2_000 : 8_000;
}

export function spendSecondsLeft(game: SpendGame, receivedAt: number, now: number) {
  if (!game.turnDeadline) return null;
  const duration = Date.parse(game.turnDeadline) - Date.parse(game.serverNow);
  return Math.max(0, Math.ceil((duration - Math.max(0, now - receivedAt)) / 1_000));
}

export function spendTime(seconds: number) {
  if (seconds >= 86_400) return Math.floor(seconds / 86_400) + 'd ' + Math.floor(seconds % 86_400 / 3_600) + 'h';
  if (seconds >= 3_600) return Math.floor(seconds / 3_600) + 'h ' + Math.floor(seconds % 3_600 / 60) + 'm';
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
