/**
 * Chestard rules
 * ==============
 * Word for word the same as riftn-backend src/games/chestard.engine.ts (and
 * the app's libs/chestard.ts), so the board on screen always matches what the
 * server counted. Signed-out players run these rules locally.
 *
 *  - 6 columns, 9 rows. Roll a die; the checker drops into that column.
 *  - Every drop scores the current Per drop (x1, then +1 for every line cleared).
 *  - A full bottom row clears like Tetris: everything above falls one row,
 *    and the clear pays a bonus of LINE_BONUS times the new line count.
 *  - The row clears before the height check, so the drop that fills the
 *    last gap of the bottom row is safe even if it tops a column out.
 *  - Any column reaching ROWS checkers ends the game.
 */
export const COLS = 6;
export const ROWS = 9;
export const LINE_BONUS = 10;

export interface ChestardBoard {
  heights: number[];
  score: number;
  lines: number;
  drops: number;
  over: boolean;
}

export interface ChestardDrop extends ChestardBoard {
  die: number;
  /** 0-based column the checker went into. */
  column: number;
  /** Height the checker landed at before any clear (0 = bottom row). */
  landedRow: number;
  points: number;
  cleared: boolean;
  bonus: number;
}

export const emptyBoard = (): ChestardBoard => ({ heights: Array(COLS).fill(0), score: 0, lines: 0, drops: 0, over: false });

export const perDrop = (lines: number) => 1 + lines;

export function drop(board: ChestardBoard, die: number): ChestardDrop {
  if (board.over) throw new Error('Game over');
  if (!Number.isInteger(die) || die < 1 || die > COLS) throw new Error('Bad die');
  const column = die - 1;
  const heights = board.heights.slice();
  const landedRow = heights[column];
  heights[column] += 1;
  let points = perDrop(board.lines);
  let lines = board.lines;
  let bonus = 0;
  const cleared = heights.every((h) => h > 0);
  if (cleared) {
    for (let i = 0; i < COLS; i++) heights[i] -= 1;
    lines += 1;
    bonus = LINE_BONUS * lines;
    points += bonus;
  }
  const over = heights.some((h) => h >= ROWS);
  return { heights, score: board.score + points, lines, drops: board.drops + 1, over, die, column, landedRow, points, cleared, bonus };
}
