/**
 * Auto-translate budget
 * =====================
 * How many translations one device may start on its own in an hour.
 *
 * Auto-translate runs on every foreign line a reader sees: posts, room chats,
 * and messages they receive. A normal session uses a few dozen an hour. A
 * busy foreign-language group or a script left scrolling could ask for
 * thousands, and each cache miss can reach a paid tier. Past the budget the
 * app stops translating unasked until the hour rolls over; the Translate
 * button still works, since a person pressing it is not a runaway loop.
 *
 * The server keeps its own per-IP limit and daily cap; this keeps honest
 * clients from getting anywhere near them.
 *
 * @module lib/auto-translate-budget
 */

export const AUTO_TRANSLATE_HOURLY_BUDGET = 150;
const WINDOW_MS = 60 * 60 * 1000;
const KEY = 'riftn-auto-translate-budget';

let memory: number[] = [];

function read(now: number): number[] {
  let stamps = memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stamps = JSON.parse(raw);
  } catch {
    // Storage unavailable: the in-memory copy still limits this tab.
  }
  return Array.isArray(stamps) ? stamps.filter((t) => typeof t === 'number' && now - t < WINDOW_MS && t <= now) : [];
}

/** Claims one automatic translation. False once this hour's budget is spent. */
export function takeAutoTranslateSlot(now = Date.now()): boolean {
  const stamps = read(now);
  if (stamps.length >= AUTO_TRANSLATE_HOURLY_BUDGET) {
    memory = stamps;
    return false;
  }
  stamps.push(now);
  memory = stamps;
  try {
    localStorage.setItem(KEY, JSON.stringify(stamps));
  } catch {
    // Not persisted; the in-memory copy still counts.
  }
  return true;
}

/** Tests only. */
export function __resetAutoTranslateBudget() {
  memory = [];
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
