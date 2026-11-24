/**
 * Chestard snapshot
 * =================
 * "Post a snapshot of your game": the board exactly as it stands when you
 * share, drawn in the game's own retro look on a 1200x630 picture (the size
 * feeds and link previews show whole). Drawn from the game state rather than
 * screen-grabbed, so it looks the same on every phone and browser.
 * The app draws the same picture (riftn-mobile libs/chestardSnapshot.ts).
 */
import { COLS, ROWS, type ChestardBoard } from '@/lib/chestard';
import { formatCount } from '@/lib/format-count';

const CYAN = '#55ffff';
const MAGENTA = '#ff55ff';
const WHITE = '#e8e8e8';
const FONT = "'Press Start 2P', ui-monospace, monospace";

export const SNAP_W = 1200;
export const SNAP_H = 630;

const scoreText = (n: number) => (n < 1000 ? String(n).padStart(6, '0') : formatCount(n));

export interface ChestardSnapshotInput {
  board: ChestardBoard;
  best: number;
  /** "@name", shown under the stats. */
  name: string | null;
  labels: { score: string; hi: string; lines: string; drops: string; perDrop: string; gameOver: string };
}

export async function drawChestardSnapshot(input: ChestardSnapshotInput): Promise<File | null> {
  try {
    await document.fonts?.load(`20px ${FONT}`).catch(() => undefined);
  } catch { /* fall back to monospace */ }
  const canvas = document.createElement('canvas');
  canvas.width = SNAP_W;
  canvas.height = SNAP_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { board, best, name, labels } = input;

  // Screen
  const bg = ctx.createRadialGradient(SNAP_W * 0.3, SNAP_H * 0.5, 40, SNAP_W * 0.5, SNAP_H * 0.5, SNAP_W * 0.75);
  bg.addColorStop(0, '#120814');
  bg.addColorStop(1, '#050505');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SNAP_W, SNAP_H);

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const text = (s: string, x: number, y: number, size: number, color: string) => {
    ctx.font = `${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  };

  // Title with a soft glow
  ctx.save();
  ctx.shadowColor = MAGENTA;
  ctx.shadowBlur = 18;
  text('CHESTARD', 64, 64, 44, MAGENTA);
  ctx.restore();

  // Stats
  const stats: Array<[string, string, string]> = [
    [labels.score, scoreText(board.score), WHITE],
    [labels.hi, scoreText(best), WHITE],
    [labels.lines, String(board.lines).padStart(2, '0'), WHITE],
    [labels.drops, String(board.drops).padStart(3, '0'), WHITE],
    [labels.perDrop, `X${1 + board.lines}`, MAGENTA],
  ];
  let y = 150;
  for (const [label, value, color] of stats) {
    text(label.toUpperCase(), 64, y, 16, CYAN);
    text(value, 64, y + 26, 28, color);
    y += 76;
  }
  if (name) text(name, 64, SNAP_H - 92, 18, WHITE);
  text('RIFTN.COM/ARCADE/CHESTARD', 64, SNAP_H - 56, 12, 'rgba(85,255,255,0.7)');

  // Board
  const cell = 56;
  const bw = COLS * cell;
  const bh = ROWS * cell;
  const bx = 600;
  const by = (SNAP_H - bh) / 2 - 10;
  ctx.fillStyle = '#000';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 3;
  ctx.strokeRect(bx - 6, by - 6, bw + 12, bh + 12);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const cx = bx + c * cell + cell / 2;
      const cy = by + bh - r * cell - cell / 2;
      if (r < (board.heights[c] ?? 0)) {
        const g = ctx.createRadialGradient(cx - 8, cy - 8, 3, cx, cy, cell * 0.45);
        g.addColorStop(0, '#ffc2ff');
        g.addColorStop(0.35, MAGENTA);
        g.addColorStop(1, '#b02ab0');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(cx - 8, cy - 9, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(85,255,255,0.55)';
        ctx.fillRect(cx - 2, cy - 2, 4, 4);
      }
    }
  }
  ctx.textAlign = 'center';
  for (let c = 0; c < COLS; c++) text(String(c + 1), bx + c * cell + cell / 2, by + bh + 18, 16, CYAN);

  // Stacks meter, like the game's right rail
  const mx = bx + bw + 56;
  ctx.textAlign = 'left';
  for (let c = 0; c < COLS; c++) {
    const h = board.heights[c] ?? 0;
    const x = mx + c * 30;
    ctx.fillStyle = 'rgba(85,255,255,0.12)';
    ctx.fillRect(x, by + bh - 180, 22, 180);
    ctx.fillStyle = CYAN;
    const fill = (180 * h) / ROWS;
    ctx.fillRect(x, by + bh - fill, 22, fill);
  }

  if (board.over) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(bx, by + bh / 2 - 50, bw, 100);
    ctx.textAlign = 'center';
    text(labels.gameOver.toUpperCase(), bx + bw / 2, by + bh / 2 - 30, 26, MAGENTA);
    text(scoreText(board.score), bx + bw / 2, by + bh / 2 + 10, 20, WHITE);
  }

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ? new File([blob], 'chestard-snapshot.png', { type: 'image/png' }) : null), 'image/png'),
  );
}
