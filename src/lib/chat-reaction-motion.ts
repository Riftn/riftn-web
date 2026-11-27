/**
 * Chat reaction motion
 * ====================
 * The painter behind `ReactionGlyph` (components/app/chat/ReactionArrival).
 * Everything here is transform/opacity on throwaway nodes, run with the Web
 * Animations API, on a fixed layer attached to <body> so no chat list,
 * bubble or panel edge can clip it.
 *
 * The look follows Settings (lib/chat-reaction-style, Fly in by default):
 *   pop   - the chip springs in place, the emoji plays once.
 *   fly   - the emoji flies to the chip: from where you tapped for your own,
 *           up from below the line for everyone else's.
 *   burst - your own reaction blooms big over the line with a ring and
 *           sparks, then drops into its chip; other people's get a small
 *           ring and sparks around the chip.
 */

import { getChatReactionStyle, type ChatReactionStyle } from '@/lib/chat-reaction-style';

export type ReactionMotionStyle = ChatReactionStyle;

export function reactionMotionStyle(): ReactionMotionStyle {
  return getChatReactionStyle();
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Noto animated emoji we host (CC BY 4.0, 72px animated WebP in
 * public/emoji/animated/chat/, named by codepoint like Google's set).
 */
/** Codepoint -> length of one loop in ms (capped), so a play stops on its last frame. */
const ANIMATED: Record<string, number> = {
  '1f308': 1810, '1f31a': 2890, '1f37f': 2290, '1f389': 1270, '1f38a': 2170, '1f3af': 2110, '1f3c6': 2050, '1f410': 1870, '1f440': 1360, '1f44b': 1390, '1f44c': 820, '1f44d': 730, '1f44e': 790, '1f44f': 670, '1f47b': 2140, '1f47d': 2740, '1f480': 4240, '1f48e': 1210, '1f494': 2980, '1f496': 910, '1f499': 1660, '1f49a': 1660, '1f49b': 1660, '1f49c': 1660, '1f4a5': 1150, '1f4a9': 2170, '1f4aa': 1420, '1f4af': 1360, '1f4b8': 730, '1f525': 1000, '1f5a4': 1660, '1f600': 2110, '1f601': 2350, '1f602': 1780, '1f605': 1810, '1f606': 2800, '1f607': 2950, '1f608': 3160, '1f609': 1750, '1f60a': 2200, '1f60b': 1300, '1f60d': 1540, '1f60e': 2080, '1f60f': 1540, '1f610': 2260, '1f618': 1600, '1f61c': 1420, '1f621': 2710, '1f622': 1660, '1f624': 1360, '1f62c': 2380, '1f62d': 1810, '1f62e': 2020, '1f631': 1540, '1f633': 1810, '1f634': 1810, '1f636_200d_1f32b_fe0f': 2590, '1f643': 1390, '1f644': 2860, '1f64c': 1420, '1f64f': 760, '1f680': 610, '1f90c': 1930, '1f913': 2710, '1f914': 1810, '1f916': 2470, '1f917': 1600, '1f919': 2320, '1f91d': 1090, '1f91e': 1690, '1f920': 1360, '1f921': 1870, '1f922': 2290, '1f923': 910, '1f924': 1960, '1f928': 1150, '1f929': 1810, '1f92a': 1660, '1f92c': 2260, '1f92d': 1630, '1f92e': 3490, '1f92f': 2500, '1f970': 1480, '1f973': 1630, '1f975': 1270, '1f976': 1840, '1f97a': 3100, '1f9e1': 1660, '1fae0': 3460, '1fae1': 1810, '1fae3': 3490, '1faf6': 1300, '26a1': 1270, '270a': 1210, '270c_fe0f': 1660, '2728': 1840, '2764_fe0f': 1690, '2764_fe0f_200d_1f525': 910, '2b50': 2200,
};

export function animatedChatEmojiSrc(emoji: string): string | null {
  const cps = Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16));
  const tries = [cps.join('_'), cps.filter((c) => c !== 'fe0f').join('_'), `${cps.join('_')}_fe0f`];
  const hit = tries.find((t) => t in ANIMATED);
  return hit ? `/emoji/animated/chat/${hit}.webp` : null;
}

/** How long one loop of that file runs (the file itself is the last word, see `EmojiClip.ms`). */
export function animatedChatEmojiMs(src: string): number {
  const cp = src.slice(src.lastIndexOf('/') + 1, -5);
  return ANIMATED[cp] ?? 2000;
}

/**
 * One animated emoji, ready to play.
 *
 * The hosted files loop for ever, and an <img> gives no way to ask where its
 * animation is, so "play it once, then show the still emoji" used to be a
 * timer racing the picture: a slow start or a busy frame and the swap cut
 * the motion short (or caught the start of a second loop). Here the same
 * bytes are also kept with the loop count set to one, so a play runs
 * to its last frame and rests there until the hand-off, whenever that comes.
 */
export interface EmojiClip {
  src: string;
  /** One full run, added up from the file's own frame times. */
  ms: number;
  /** As hosted: loops for ever (the Messages rows). */
  loop: Blob;
  /** The same frames set to run once and rest on the last. */
  once: Blob;
  /** The first frame, for a copy that has to hold still (in flight). */
  poster: ImageBitmap | null;
}

const chunkId = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

/** Reads an animated WebP: its length, and a copy that plays a single time. */
export function readEmojiClip(buf: ArrayBuffer): { ms: number; once: Uint8Array } | null {
  const once = new Uint8Array(buf.slice(0));
  if (once.length < 20 || chunkId(once, 0) !== 'RIFF' || chunkId(once, 8) !== 'WEBP') return null;
  const view = new DataView(once.buffer);
  let ms = 0;
  let animated = false;
  for (let at = 12; at + 8 <= once.length;) {
    const id = chunkId(once, at);
    const size = view.getUint32(at + 4, true);
    if (id === 'ANIM' && size >= 6) {
      // Background colour (4 bytes), then the loop count: 0 is for ever.
      view.setUint16(at + 12, 1, true);
      animated = true;
    } else if (id === 'ANMF' && size >= 16 && at + 24 <= once.length) {
      ms += once[at + 20] | (once[at + 21] << 8) | (once[at + 22] << 16);
    }
    at += 8 + size + (size & 1);
  }
  return animated && ms > 0 ? { ms, once } : null;
}

const clips = new Map<string, Promise<EmojiClip | null>>();
const clipsReady = new Map<string, EmojiClip>();

async function fetchEmojiClip(src: string): Promise<EmojiClip | null> {
  const res = await fetch(src);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  const read = readEmojiClip(buf);
  if (!read) return null;
  const loop = new Blob([buf], { type: 'image/webp' });
  let poster: ImageBitmap | null = null;
  try {
    poster = typeof createImageBitmap === 'function' ? await createImageBitmap(loop) : null;
  } catch {
    poster = null;
  }
  return { src, ms: read.ms, loop, once: new Blob([read.once as BlobPart], { type: 'image/webp' }), poster };
}

/** The clip for an animated emoji file, downloaded once per visit. */
export function loadEmojiClip(src: string): Promise<EmojiClip | null> {
  let p = clips.get(src);
  if (!p) {
    p = fetchEmojiClip(src).catch(() => null).then((clip) => {
      if (clip) clipsReady.set(src, clip);
      // A failed download may work next time.
      else clips.delete(src);
      return clip;
    });
    clips.set(src, p);
  }
  return p;
}

/** The clip if it is already here, without waiting. */
export function peekEmojiClip(src: string): EmojiClip | null {
  return clipsReady.get(src) ?? null;
}

/** A clip that takes longer than this to download plays its arrival without it. */
const CLIP_WAIT_MS = 300;

/**
 * Hands over the clip for `src` as soon as it can: at once when it is cached
 * (or there is no file), else when the download lands, or `null` after a
 * short wait so a slow network never holds a reaction back. `late` then gets
 * the clip if it does arrive. Returns true when it answered synchronously.
 */
export function withEmojiClip(src: string | null, ready: (clip: EmojiClip | null) => void, late?: (clip: EmojiClip) => void): boolean {
  const have = src ? peekEmojiClip(src) : null;
  if (!src || have) {
    ready(have);
    return true;
  }
  let answered = false;
  const timer = window.setTimeout(() => { answered = true; ready(null); }, CLIP_WAIT_MS);
  void loadEmojiClip(src).then((clip) => {
    if (answered) { if (clip) late?.(clip); return; }
    answered = true;
    clearTimeout(timer);
    ready(clip);
  });
  return false;
}

/** Where the last tap or click happened, so your own reaction can fly from it. */
let lastPointer: { x: number; y: number; at: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY, at: Date.now() }; }, { capture: true, passive: true });
}

let layer: HTMLDivElement | null = null;
function getLayer(): HTMLDivElement {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.reactionLayer = '';
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483000', overflow: 'visible' });
  document.body.appendChild(layer);
  return layer;
}

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

type Pt = { x: number; y: number };

/**
 * Whether a point of `el` is on screen: inside the viewport and inside every
 * scroll box or clipped panel around it. A chip in a hidden tab, a collapsed
 * side panel or a line scrolled out of its list has nowhere to land on.
 */
function onScreen(el: HTMLElement, at: Pt): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  if (at.x < 0 || at.y < 0 || at.x > window.innerWidth || at.y > window.innerHeight) return false;
  for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
    const cs = getComputedStyle(up);
    if (!/auto|scroll|hidden|clip/.test(`${cs.overflowX} ${cs.overflowY}`)) continue;
    const b = up.getBoundingClientRect();
    if (at.x < b.left - 1 || at.x > b.right + 1 || at.y < b.top - 1 || at.y > b.bottom + 1) return false;
  }
  return true;
}

/**
 * Keeps a flight pinned to its chip while it is in the air.
 *
 * The landing spot used to be read once, the moment the reaction arrived. But
 * the chip keeps moving after that: a chat that follows the newest line
 * scrolls up a frame later to make room for the new chip row (the side panel
 * chat does this on every fresh reaction), other chips wrap, the count rolls,
 * a panel slides. The emoji then landed where the chip used to be.
 *
 * Every moving piece sits in `group`, and each frame the group is shifted by
 * how far the chip has moved since take-off, weighted by `weight(progress)`:
 * 0 keeps a point fixed on screen (where you tapped), 1 moves it with the
 * chip. At the end the weight is always 1, so it lands exactly on the chip.
 * `now()` hands the landing effects the chip's current spot.
 */
function followChip(glyph: HTMLElement, start: Pt, toLayer: (p: Pt) => Pt, total: number, weight: (t: number) => number) {
  const group = document.createElement('div');
  Object.assign(group.style, { position: 'absolute', left: '0', top: '0', width: '0', height: '0', overflow: 'visible', willChange: 'transform' });
  getLayer().appendChild(group);
  let last: Pt = start;
  const read = (): Pt => {
    if (glyph.isConnected) {
      const r = glyph.getBoundingClientRect();
      // Gone from layout mid-flight (tab hidden, list re-rendered): keep the last good spot.
      if (r.width > 0 || r.height > 0) last = toLayer(center(r));
    }
    return last;
  };
  const t0 = performance.now();
  const end = total + LAND_COVER_MS + 20;
  let frame = 0;
  const tick = () => {
    const ms = performance.now() - t0;
    if (ms >= end || !group.isConnected) { group.remove(); return; }
    const p = read();
    const k = weight(Math.min(1, ms / total));
    group.style.transform = `translate(${(p.x - start.x) * k}px, ${(p.y - start.y) * k}px)`;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  window.setTimeout(() => { cancelAnimationFrame(frame); group.remove(); }, end + 50);
  return { group, now: read };
}

/** Eases a fixed start into following the chip: 0 at take-off, 1 on landing. */
const easeIn = (t: number) => t * t * (3 - 2 * t);
const always = () => 1;

/** The moving emoji sits in a box this many times the still one's font size. */
export const CLIP_BOX_EM = 1.35;
/** A flying emoji is drawn with a font this share of its box. */
const TEXT_FILL = 0.82;

/**
 * A floating copy of the emoji. With a clip it is the same art the chip is
 * about to play: `still` holds its first frame (so nothing plays out of
 * sight in flight), `once` plays it through and rests on the last frame.
 */
function makeEmoji(emoji: string, clip: EmojiClip | null, size: number, mode: 'still' | 'once' = 'still'): HTMLElement {
  const node = document.createElement('div');
  Object.assign(node.style, {
    position: 'absolute', left: '0', top: '0', width: `${size}px`, height: `${size}px`,
    marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px`, display: 'grid', placeItems: 'center',
    fontSize: `${Math.round(size * TEXT_FILL)}px`, lineHeight: '1', willChange: 'transform, opacity',
  });
  if (clip?.poster) {
    const canvas = document.createElement('canvas');
    canvas.width = clip.poster.width;
    canvas.height = clip.poster.height;
    canvas.getContext('2d')?.drawImage(clip.poster, 0, 0);
    Object.assign(canvas.style, { width: '100%', height: '100%', gridArea: '1 / 1' });
    node.appendChild(canvas);
    if (mode === 'once') {
      const url = URL.createObjectURL(clip.once);
      const img = new Image();
      img.alt = '';
      Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain', gridArea: '1 / 1' });
      img.src = url;
      // The first frame is already drawn; the moving copy takes over on top of it.
      (img.decode?.() ?? Promise.resolve()).catch(() => {}).then(() => {
        if (!node.isConnected) return;
        node.appendChild(img);
        canvas.style.visibility = 'hidden';
      });
      window.setTimeout(() => URL.revokeObjectURL(url), clip.ms + 6000);
    }
    return node;
  }
  node.textContent = emoji;
  return node;
}

function done(anim: Animation, node: Element) {
  anim.onfinish = () => node.remove();
  anim.oncancel = () => node.remove();
}

function chipBump(chip: HTMLElement, strength = 1) {
  const s = 1 + 0.24 * strength;
  chip.animate(
    [{ transform: 'scale(1)' }, { transform: `scale(${s})`, offset: 0.35 }, { transform: 'scale(0.96)', offset: 0.7 }, { transform: 'scale(1)' }],
    { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' },
  );
}

/** Keeps the chip's own emoji out of sight until its flying copy is on top of it. */
function hideFor(glyph: HTMLElement, ms: number) {
  glyph.animate([{ opacity: 0 }, { opacity: 0 }], { duration: Math.max(1, ms), easing: 'linear' });
}

/** Fades a flying copy in at the start and out over its last moments, on real time (not the path's easing). */
function fadeInOut(node: HTMLElement, total: number, inMs: number, outMs: number) {
  node.animate(
    [{ opacity: 0 }, { opacity: 1, offset: inMs / total }, { opacity: 1, offset: 1 - outMs / total }, { opacity: 0 }],
    { duration: total, easing: 'linear', fill: 'forwards' },
  );
}

function sparks(at: { x: number; y: number }, color: string, count: number, reach: number, emoji?: { char: string; size: number }) {
  const host = getLayer();
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    const dist = reach * (0.75 + Math.random() * 0.4);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const node = document.createElement('div');
    if (emoji) {
      node.textContent = emoji.char;
      Object.assign(node.style, { position: 'absolute', left: '0', top: '0', fontSize: `${emoji.size}px`, lineHeight: '1', marginLeft: `${-emoji.size / 2}px`, marginTop: `${-emoji.size / 2}px` });
    } else {
      Object.assign(node.style, { position: 'absolute', left: '0', top: '0', width: '5px', height: '5px', marginLeft: '-2.5px', marginTop: '-2.5px', borderRadius: '2px', background: color });
    }
    host.appendChild(node);
    const a = node.animate(
      [
        { transform: `translate(${at.x}px, ${at.y}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${at.x + dx * 0.55}px, ${at.y + dy * 0.55}px) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${at.x + dx}px, ${at.y + dy + 6}px) scale(.6) rotate(${(Math.random() - 0.5) * 60}deg)`, opacity: 0 },
      ],
      { duration: 620 + Math.random() * 160, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    done(a, node);
  }
}

function ring(at: { x: number; y: number }, color: string, from: number, to: number, ms = 520) {
  const node = document.createElement('div');
  Object.assign(node.style, {
    position: 'absolute', left: '0', top: '0', width: `${to}px`, height: `${to}px`, marginLeft: `${-to / 2}px`, marginTop: `${-to / 2}px`,
    borderRadius: '9999px', border: `2px solid ${color}`, boxSizing: 'border-box',
  });
  getLayer().appendChild(node);
  const a = node.animate(
    [
      { transform: `translate(${at.x}px, ${at.y}px) scale(${from / to})`, opacity: 0.9 },
      { transform: `translate(${at.x}px, ${at.y}px) scale(1)`, opacity: 0 },
    ],
    { duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)' },
  );
  done(a, node);
}

/** A path through three points, sampled so WAAPI can draw a curve. */
function arc(from: { x: number; y: number }, ctrl: { x: number; y: number }, to: { x: number; y: number }, steps = 14) {
  const pts: Array<{ x: number; y: number; t: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push({ x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x, y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y, t });
  }
  return pts;
}

export interface ArrivalInput {
  chip: HTMLElement;
  glyph: HTMLElement;
  emoji: string;
  mine: boolean;
  /** The animated art, when this emoji has it and it is downloaded. */
  clip: EmojiClip | null;
  /** The emoji was not on screen before this reaction: keep its place empty until the flying copy lands. */
  fresh?: boolean;
  /** How big the moving emoji is drawn where it lands, when that is not the chip's usual 1.35em. */
  artPx?: number;
}

export interface ArrivalPlan {
  /** When the emoji is in its chip, in ms from now (0: it never left). */
  landMs: number;
  /** The flying copy already played the clip to its end, so the chip should not play it again. */
  played: boolean;
}

/** The flying copy lands this long before it is gone: the chip's own emoji is swapped in underneath it. */
export const LAND_COVER_MS = 80;

export function paintReactionArrival({ chip, glyph, emoji, mine, clip, fresh = true, artPx }: ArrivalInput): ArrivalPlan {
  const none: ArrivalPlan = { landMs: 0, played: false };
  if (prefersReducedMotion() || typeof document === 'undefined') return none;
  const style = reactionMotionStyle();
  if (style === 'off') return none;
  const color = getComputedStyle(chip).color || 'rgb(255,255,255)';
  // The layer can sit under CSS zoom; rects and pointers come in screen pixels.
  const z = (getLayer() as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
  const toLayer = (p: { x: number; y: number }) => ({ x: p.x / z, y: p.y / z });
  const glyphAt = center(glyph.getBoundingClientRect());
  // Nowhere visible to land: just count it, never fly to a corner or off the panel.
  if (!onScreen(glyph, glyphAt)) return none;
  const target = toLayer(glyphAt);
  // The size the flying copy has to shrink to so it lands exactly on the chip's emoji.
  const fontPx = parseFloat(getComputedStyle(glyph).fontSize) || 16;
  const art = clip?.poster ? clip : null;
  const landScale = (size: number) => (art ? (artPx ?? fontPx * CLIP_BOX_EM) / size : fontPx / (size * TEXT_FILL));

  if (style === 'pop') {
    chip.animate(
      [{ transform: 'scale(.35)', opacity: 0.2 }, { transform: 'scale(1.28)', opacity: 1, offset: 0.4 }, { transform: 'scale(.94)', offset: 0.72 }, { transform: 'scale(1)' }],
      { duration: 560, easing: 'cubic-bezier(.3,1.3,.5,1)' },
    );
    return none;
  }

  if (style === 'fly') {
    const size = mine ? 34 : 26;
    const recent = lastPointer && Date.now() - lastPointer.at < 2500 ? lastPointer : null;
    const box = (chip.closest('[data-chat-wallpaper], [data-reaction-scope]') as HTMLElement | null)?.getBoundingClientRect();
    const from = mine
      ? (recent ? toLayer(recent) : { x: target.x + 40, y: target.y - 70 })
      : { x: target.x + (Math.random() < 0.5 ? -1 : 1) * (24 + Math.random() * 30), y: Math.min((box ? box.bottom - 8 : window.innerHeight) / z, target.y + 120) };
    const ctrl = { x: (from.x + target.x) / 2 + (mine ? -30 : 0), y: Math.min(from.y, target.y) - (mine ? 60 : 40) };
    const pts = arc(from, ctrl, target);
    const total = mine ? 640 : 760;
    // Yours leaves from your finger (fixed) and is pulled onto the chip; theirs rises with it.
    const pin = followChip(glyph, target, toLayer, total, mine && recent ? easeIn : always);
    const lead = makeEmoji(emoji, art, size);
    pin.group.appendChild(lead);
    const end = landScale(size);
    const a = lead.animate(
      pts.map((p) => ({
        transform: `translate(${p.x}px, ${p.y}px) scale(${p.t < 0.15 ? 0.5 + p.t * 3.4 : 1 - (1 - end) * Math.max(0, (p.t - 0.55) / 0.45)})`,
      })),
      { duration: total, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' },
    );
    // It stays whole until it is sitting on the chip, then melts into the emoji under it.
    fadeInOut(lead, total + LAND_COVER_MS, 70, LAND_COVER_MS);
    window.setTimeout(() => lead.remove(), total + LAND_COVER_MS + 20);
    a.oncancel = () => lead.remove();
    // A faint trail on other people's, so it reads as "came from someone".
    if (!mine) {
      [90, 170].forEach((delay, i) => {
        const ghostSize = size * (0.6 - i * 0.15) / TEXT_FILL;
        const ghost = makeEmoji(emoji, art, ghostSize);
        ghost.style.opacity = '0';
        pin.group.appendChild(ghost);
        const g = ghost.animate(
          pts.map((p) => ({ transform: `translate(${p.x}px, ${p.y}px)`, opacity: p.t > 0.85 ? 0 : 0.35 - i * 0.12 })),
          { duration: total, delay, easing: 'cubic-bezier(.45,.05,.35,1)' },
        );
        done(g, ghost);
      });
    }
    if (fresh) hideFor(glyph, total);
    window.setTimeout(() => {
      chipBump(chip, mine ? 1 : 0.7);
      sparks(pin.now(), color, mine ? 6 : 4, mine ? 18 : 13);
    }, total - 30);
    return { landMs: total, played: false };
  }

  // burst
  if (mine) {
    const size = 58;
    const bloom = { x: target.x, y: Math.max(size, target.y - 44) };
    const big = makeEmoji(emoji, art, size, 'once');
    // It blooms, plays its whole motion up there, then drops into the chip.
    const dropAt = Math.max(850, art ? art.ms + 140 : 0);
    const total = dropAt + 400;
    const end = landScale(size);
    const at = (ms: number) => ms / total;
    // The bloom hangs over the chip, so the whole thing moves with it.
    const pin = followChip(glyph, target, toLayer, total, always);
    pin.group.appendChild(big);
    const a = big.animate(
      [
        { transform: `translate(${bloom.x}px, ${bloom.y}px) scale(.2)`, easing: 'cubic-bezier(.3,1.2,.5,1)' },
        { transform: `translate(${bloom.x}px, ${bloom.y}px) scale(1.18)`, offset: at(250), easing: 'ease-out' },
        { transform: `translate(${bloom.x}px, ${bloom.y}px) scale(1)`, offset: at(400) },
        { transform: `translate(${bloom.x}px, ${bloom.y}px) scale(1)`, offset: at(dropAt), easing: 'cubic-bezier(.5,0,.3,1)' },
        { transform: `translate(${target.x}px, ${target.y}px) scale(${end})` },
      ],
      { duration: total, easing: 'linear', fill: 'forwards' },
    );
    fadeInOut(big, total + LAND_COVER_MS, 180, LAND_COVER_MS);
    window.setTimeout(() => big.remove(), total + LAND_COVER_MS + 20);
    a.oncancel = () => big.remove();
    window.setTimeout(() => {
      const now = pin.now();
      const here = { x: bloom.x + now.x - target.x, y: bloom.y + now.y - target.y };
      ring(here, color, 24, 112, 620);
      sparks(here, color, 8, 54);
      sparks(here, color, 5, 70, { char: emoji, size: 13 });
    }, 220);
    if (fresh) hideFor(glyph, total);
    window.setTimeout(() => chipBump(chip, 1), total - 20);
    return { landMs: total, played: !!art };
  }
  chipBump(chip, 0.9);
  ring(target, color, 10, 46, 480);
  sparks(target, color, 5, 20);
  return none;
}
