/**
 * Painting: the brush engine behind the composer's Painting canvas.
 *
 * Tools turn pointer movement into plain drawing ops (segments, dots, specks,
 * rings, rectangles, ellipses) and each platform draws those ops: the web on a
 * 2D canvas, the app with Skia. Nothing here touches a canvas, so a stroke is
 * drawn the same way on both, and the same file lives in riftn-web
 * (src/lib/painting/engine.ts) and riftn-mobile (libs/painting/engine.ts).
 * Change one, change both.
 *
 * Classic tools work like Paint: pencil, brush, eraser, fill bucket, line,
 * rectangle and ellipse. The art brushes are stamp based: oil drags a row of
 * bristles that dry out along the stroke, pastel and charcoal scatter specks
 * that catch on the paper's tooth, and watercolour lays thin washes with a
 * darker rim.
 */

export type PaintTool =
  | 'pencil'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'oil'
  | 'pastel'
  | 'watercolor'
  | 'charcoal';

export const BASIC_TOOLS: PaintTool[] = ['pencil', 'brush', 'eraser', 'fill', 'line', 'rect', 'ellipse'];
export const ART_TOOLS: PaintTool[] = ['oil', 'pastel', 'watercolor', 'charcoal'];

export const isFreehand = (tool: PaintTool) => tool !== 'fill' && !isShape(tool);
export const isShape = (tool: PaintTool) => tool === 'line' || tool === 'rect' || tool === 'ellipse';

/** Paint's own 20 colours, dark row then light row. */
export const PAINT_PALETTE = [
  '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
];

/** The canvas starts as white paper on every theme. */
export const PAPER = '#ffffff';

export const SIZE_MIN = 1;
export const SIZE_MAX = 120;
export const DEFAULT_SIZE = 16;

export type PaintAspect = 'portrait' | 'square' | 'wide';
/** Pixel size of the painting; it posts at this size. */
export const PAINT_ASPECTS: Record<PaintAspect, { w: number; h: number }> = {
  portrait: { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
  wide: { w: 1344, h: 756 },
};

/** A painting file handed to the composer; it skips the photo editor. */
export const paintingFileName = (ext: 'png' | 'jpg', now = Date.now()) => `painting-${now}.${ext}`;
export const isPaintingFile = (name?: string | null) => !!name && /(^|\/)painting-\d+\.(png|jpe?g)$/i.test(name);

export type PaintOp =
  | { k: 'seg'; x1: number; y1: number; x2: number; y2: number; w: number; color: string; a: number; cap: 'round' | 'square' | 'butt' }
  | { k: 'dot'; x: number; y: number; r: number; color: string; a: number }
  | { k: 'speck'; x: number; y: number; s: number; color: string; a: number }
  | { k: 'ring'; x: number; y: number; r: number; w: number; color: string; a: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; lw: number; color: string; fill: boolean }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; lw: number; color: string; fill: boolean };

// ── colour ──────────────────────────────────────────────────────────

export function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Lighter toward white (amount > 0) or darker toward black (amount < 0). */
export function shade(hex: string, amount: number): string {
  if (!amount) return hex.toLowerCase();
  const rgb = parseHex(hex);
  const to = amount > 0 ? 255 : 0;
  const k = Math.min(1, Math.abs(amount));
  return toHex(rgb.map((v) => v + (to - v) * k) as [number, number, number]);
}

/** Hue 0..360, saturation and value 0..1, to hex. */
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [r, g, b] = parseHex(hex).map((x) => x / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

// ── randomness ──────────────────────────────────────────────────────

/** Small seeded generator, so a stroke's texture is the same every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The paper's tooth at a point, 0..1; fixed for the page, so dry media skip the same pits. */
export function tooth(x: number, y: number): number {
  let h = (Math.floor(x / 2.5) * 374761393 + Math.floor(y / 2.5) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const q = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ── strokes ─────────────────────────────────────────────────────────

interface Bristle {
  off: number;
  w: number;
  color: string;
  a: number;
  x?: number;
  y?: number;
}

export interface Stroke {
  tool: PaintTool;
  color: string;
  size: number;
  rng: () => number;
  x: number;
  y: number;
  /** Distance since the last stamp. */
  carry: number;
  /** Length drawn so far. */
  dist: number;
  dx: number;
  dy: number;
  bristles?: Bristle[];
}

/** Pen pressure 0..1 to a width factor; a mouse or finger is full width. */
const pressureFactor = (p: number) => (p > 0 && p < 1 ? 0.3 + 0.7 * p : 1);

/** How far apart a stamping brush puts its stamps. */
function spacing(tool: PaintTool, size: number) {
  if (tool === 'watercolor') return Math.max(1, size * 0.1);
  if (tool === 'charcoal') return Math.max(1, size * 0.15);
  return Math.max(1, size * 0.2);
}

export function startStroke(tool: PaintTool, color: string, size: number, x: number, y: number, pressure = 1, seed = Date.now()): { stroke: Stroke; ops: PaintOp[] } {
  const rng = seeded(seed);
  const stroke: Stroke = { tool, color, size: clamp(size, SIZE_MIN, SIZE_MAX), rng, x, y, carry: 0, dist: 0, dx: 0, dy: 0 };
  if (tool === 'oil') stroke.bristles = makeBristles(stroke);
  const ops: PaintOp[] = [];
  const pf = pressureFactor(pressure);
  const s = stroke.size;
  switch (tool) {
    case 'pencil': {
      const w = Math.max(1, (s / 4) * pf);
      ops.push({ k: 'speck', x, y, s: w, color, a: 1 });
      break;
    }
    case 'brush':
      ops.push({ k: 'dot', x, y, r: (s * pf) / 2, color, a: 1 });
      break;
    case 'eraser':
      ops.push({ k: 'speck', x, y, s, color: PAPER, a: 1 });
      break;
    case 'oil':
      // Nothing until the brush moves, so bristles line up with the stroke;
      // a tap is drawn by endStroke.
      break;
    default:
      stamp(stroke, x, y, pf, ops);
  }
  return { stroke, ops };
}

export function moveStroke(stroke: Stroke, x: number, y: number, pressure = 1): PaintOp[] {
  const dx = x - stroke.x;
  const dy = y - stroke.y;
  const len = Math.hypot(dx, dy);
  // Wait for real movement; a jittery hand would otherwise pile up stamps.
  if (len < Math.max(0.75, stroke.size * 0.04)) return [];
  const ops: PaintOp[] = [];
  const pf = pressureFactor(pressure);
  const s = stroke.size;
  const ux = dx / len;
  const uy = dy / len;
  // Direction eases round corners, so bristles and streaks turn smoothly.
  if (!stroke.dx && !stroke.dy) {
    stroke.dx = ux;
    stroke.dy = uy;
  } else {
    const mx = stroke.dx * 0.6 + ux * 0.4;
    const my = stroke.dy * 0.6 + uy * 0.4;
    const m = Math.hypot(mx, my) || 1;
    stroke.dx = mx / m;
    stroke.dy = my / m;
  }
  switch (stroke.tool) {
    case 'pencil':
      ops.push({ k: 'seg', x1: stroke.x, y1: stroke.y, x2: x, y2: y, w: Math.max(1, (s / 4) * pf), color: stroke.color, a: 1, cap: 'square' });
      break;
    case 'brush':
      ops.push({ k: 'seg', x1: stroke.x, y1: stroke.y, x2: x, y2: y, w: s * pf, color: stroke.color, a: 1, cap: 'round' });
      break;
    case 'eraser':
      ops.push({ k: 'seg', x1: stroke.x, y1: stroke.y, x2: x, y2: y, w: s, color: PAPER, a: 1, cap: 'square' });
      break;
    case 'oil':
      oilMove(stroke, x, y, pf, ops);
      break;
    default: {
      // Stamp along the way at even spacing, carrying the remainder over.
      const step = spacing(stroke.tool, s);
      let d = step - stroke.carry;
      while (d <= len) {
        stamp(stroke, stroke.x + ux * d, stroke.y + uy * d, pf, ops);
        d += step;
      }
      stroke.carry = len - (d - step);
    }
  }
  stroke.dist += len;
  stroke.x = x;
  stroke.y = y;
  return ops;
}

/** Finish a stroke: a tap with the oil brush leaves a blob. */
export function endStroke(stroke: Stroke): PaintOp[] {
  if (stroke.tool === 'oil' && stroke.dist === 0) return [{ k: 'dot', x: stroke.x, y: stroke.y, r: stroke.size / 2, color: stroke.color, a: 1 }];
  return [];
}

function makeBristles(stroke: Stroke): Bristle[] {
  const { size, rng, color } = stroke;
  const n = clamp(Math.round(size / 3), 3, 28);
  const out: Bristle[] = [];
  for (let i = 0; i < n; i++) {
    const off = ((i + 0.5) / n - 0.5) * size + (rng() - 0.5) * (size / n) * 0.8;
    out.push({
      off,
      w: Math.max(1, (size / n) * (1.1 + rng() * 0.9)),
      color: shade(color, q((rng() - 0.5) * 0.5, 0.02)),
      a: 1,
    });
  }
  return out;
}

/** Oil: each bristle draws its own line, and the brush runs dry along the stroke. */
function oilMove(stroke: Stroke, x: number, y: number, pf: number, ops: PaintOp[]) {
  const nx = -stroke.dy;
  const ny = stroke.dx;
  const load = Math.max(0.22, 1 - stroke.dist / (stroke.size * 28 + 500));
  // The body of the paint, under the bristles' streaks, until it runs thin.
  // Flat ends, so it never paints back over the streaks already laid.
  if (load > 0.45) ops.push({ k: 'seg', x1: stroke.x, y1: stroke.y, x2: x, y2: y, w: stroke.size * 0.8 * pf, color: stroke.color, a: 1, cap: 'butt' });
  for (const b of stroke.bristles!) {
    const off = b.off * pf;
    const tx = x + nx * off;
    const ty = y + ny * off;
    if (b.x === undefined || b.y === undefined) {
      b.x = stroke.x + nx * off;
      b.y = stroke.y + ny * off;
    }
    // A dry brush skips: gaps open up as the paint runs out.
    if (stroke.rng() <= load + 0.4) {
      ops.push({ k: 'seg', x1: b.x, y1: b.y, x2: tx, y2: ty, w: b.w * pf, color: b.color, a: b.a, cap: 'round' });
    }
    b.x = tx;
    b.y = ty;
  }
}

/** One stamp of a stamping brush (pastel, charcoal, watercolour). */
function stamp(stroke: Stroke, x: number, y: number, pf: number, ops: PaintOp[]) {
  const { rng, color, tool } = stroke;
  const s = stroke.size * pf;
  const r = s / 2;
  if (tool === 'watercolor') {
    const jx = x + (rng() - 0.5) * s * 0.08;
    const jy = y + (rng() - 0.5) * s * 0.08;
    const rr = r * (0.9 + rng() * 0.2);
    ops.push({ k: 'dot', x: jx, y: jy, r: rr, color: shade(color, q((rng() - 0.5) * 0.08, 0.04)), a: 0.045 });
    // Pigment gathers at the edge of a wash as it dries.
    ops.push({ k: 'ring', x: jx, y: jy, r: rr, w: Math.max(1, s * 0.03), color: shade(color, -0.2), a: 0.015 });
    if (rng() < 0.08) ops.push({ k: 'dot', x: jx, y: jy, r: rr * 1.3, color, a: 0.02 });
    return;
  }
  const charcoal = tool === 'charcoal';
  const count = clamp(Math.round(r * r * (charcoal ? 0.5 : 0.6)), 6, charcoal ? 300 : 260);
  const grain = Math.max(1, s * (charcoal ? 0.07 : 0.1));
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = r * Math.sqrt(rng()) * (charcoal ? 1 + rng() * 0.15 : 1);
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad;
    // The paper's tooth: pits stay white until worked over.
    const keep = charcoal ? tooth(px, py) * 0.9 + rng() * 0.3 > 0.5 : tooth(px, py) * 0.8 + rng() * 0.4 > 0.45;
    if (!keep) continue;
    const tone = charcoal ? [-0.25, -0.12, 0][Math.floor(rng() * 3)] : [-0.06, 0, 0.06][Math.floor(rng() * 3)];
    ops.push({
      k: 'speck',
      x: px,
      y: py,
      s: q(grain * (charcoal ? 0.6 + rng() : 0.7 + rng() * 0.8), 0.5) || 0.5,
      color: shade(color, tone),
      a: q(charcoal ? 0.35 + rng() * 0.45 : 0.45 + rng() * 0.4, 0.1),
    });
  }
  if (charcoal && (stroke.dx || stroke.dy)) {
    // Scratchy streaks along the stroke.
    for (let i = 0; i < 2; i++) {
      const o = (rng() - 0.5) * s;
      const sx = x - stroke.dy * o;
      const sy = y + stroke.dx * o;
      const l = s * 0.3;
      ops.push({ k: 'seg', x1: sx, y1: sy, x2: sx + stroke.dx * l, y2: sy + stroke.dy * l, w: Math.max(1, q(s * 0.04, 0.5)), color: shade(color, -0.2), a: 0.3, cap: 'round' });
    }
  }
}

// ── shapes ──────────────────────────────────────────────────────────

/**
 * Line, rectangle or ellipse from a drag. `even` (Shift on a keyboard) keeps
 * lines to 45° steps and makes squares and circles.
 */
export function shapeOp(tool: PaintTool, x0: number, y0: number, x1: number, y1: number, size: number, color: string, fill: boolean, even = false): PaintOp | null {
  let ex = x1;
  let ey = y1;
  if (even) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (tool === 'line') {
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      ex = x0 + Math.cos(ang) * len;
      ey = y0 + Math.sin(ang) * len;
    } else {
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      ex = x0 + Math.sign(dx || 1) * m;
      ey = y0 + Math.sign(dy || 1) * m;
    }
  }
  const lw = clamp(size, SIZE_MIN, SIZE_MAX);
  if (tool === 'line') return { k: 'seg', x1: x0, y1: y0, x2: ex, y2: ey, w: lw, color, a: 1, cap: 'round' };
  const x = Math.min(x0, ex);
  const y = Math.min(y0, ey);
  const w = Math.abs(ex - x0);
  const h = Math.abs(ey - y0);
  if (w < 1 && h < 1) return null;
  if (tool === 'rect') return { k: 'rect', x, y, w, h, lw, color, fill };
  if (tool === 'ellipse') return { k: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, lw, color, fill };
  return null;
}

// ── fill bucket ─────────────────────────────────────────────────────

/**
 * Flood fill RGBA pixels in place from (sx, sy) with `hex`. Colours within
 * `tolerance` of the clicked one are filled, so soft brush edges fill too,
 * and the antialiased fringe just outside is blended half way so no pale halo
 * is left against a line. Returns false when nothing changed.
 */
export function floodFill(px: Uint8Array | Uint8ClampedArray, w: number, h: number, sx: number, sy: number, hex: string, tolerance = 48): boolean {
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false;
  const [fr, fg, fb] = parseHex(hex);
  const at = (sy * w + sx) * 4;
  const tr = px[at];
  const tg = px[at + 1];
  const tb = px[at + 2];
  if (tr === fr && tg === fg && tb === fb) return false;
  const diff = (i: number) => Math.max(Math.abs(px[i] - tr), Math.abs(px[i + 1] - tg), Math.abs(px[i + 2] - tb));
  const filled = new Uint8Array(w * h);
  const match = (p: number) => !filled[p] && diff(p * 4) <= tolerance;
  const stack: number[] = [sy * w + sx];
  while (stack.length) {
    const p = stack.pop()!;
    if (!match(p)) continue;
    const y = Math.floor(p / w);
    let l = p;
    const rowStart = y * w;
    while (l > rowStart && match(l - 1)) l--;
    let r = p;
    const rowEnd = rowStart + w - 1;
    while (r < rowEnd && match(r + 1)) r++;
    let upOpen = false;
    let downOpen = false;
    for (let i = l; i <= r; i++) {
      filled[i] = 1;
      if (y > 0) {
        const u = i - w;
        if (match(u)) {
          if (!upOpen) { stack.push(u); upOpen = true; }
        } else upOpen = false;
      }
      if (y < h - 1) {
        const d = i + w;
        if (match(d)) {
          if (!downOpen) { stack.push(d); downOpen = true; }
        } else downOpen = false;
      }
    }
  }
  // Paint, then soften the fringe: neighbours that are close-ish to the old
  // colour (an antialiased edge) take half of the new one.
  const fringe = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!filled[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0 && !filled[p - 1]) fringe[p - 1] = 1;
    if (x < w - 1 && !filled[p + 1]) fringe[p + 1] = 1;
    if (y > 0 && !filled[p - w]) fringe[p - w] = 1;
    if (y < h - 1 && !filled[p + w]) fringe[p + w] = 1;
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (filled[p]) {
      px[i] = fr;
      px[i + 1] = fg;
      px[i + 2] = fb;
      px[i + 3] = 255;
    } else if (fringe[p] && diff(i) <= 140) {
      px[i] = (px[i] + fr) >> 1;
      px[i + 1] = (px[i + 1] + fg) >> 1;
      px[i + 2] = (px[i + 2] + fb) >> 1;
    }
  }
  return true;
}

// ── history ─────────────────────────────────────────────────────────

/** Undo / redo over snapshots, keeping at most `limit` of them. */
export class PaintHistory<T> {
  private items: T[];
  private at = 0;
  constructor(first: T, private readonly limit: number) {
    this.items = [first];
  }
  push(item: T) {
    this.items = this.items.slice(0, this.at + 1);
    this.items.push(item);
    if (this.items.length > this.limit) this.items.shift();
    this.at = this.items.length - 1;
  }
  reset(first: T) {
    this.items = [first];
    this.at = 0;
  }
  undo(): T | null {
    if (this.at === 0) return null;
    this.at -= 1;
    return this.items[this.at];
  }
  redo(): T | null {
    if (this.at >= this.items.length - 1) return null;
    this.at += 1;
    return this.items[this.at];
  }
  get current(): T {
    return this.items[this.at];
  }
  get canUndo() {
    return this.at > 0;
  }
  get canRedo() {
    return this.at < this.items.length - 1;
  }
}
