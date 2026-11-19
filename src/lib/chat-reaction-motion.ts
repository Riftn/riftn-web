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
  '1f308': 1810, '1f31a': 2890, '1f37f': 2290, '1f389': 1270, '1f38a': 2170, '1f3af': 2110, '1f3c6': 2050, '1f410': 1870, '1f440': 1360, '1f44b': 1390, '1f44c': 820, '1f44d': 730, '1f44e': 790, '1f44f': 670, '1f47b': 2140, '1f47d': 2740, '1f480': 3600, '1f48e': 1210, '1f494': 2980, '1f496': 910, '1f499': 1660, '1f49a': 1660, '1f49b': 1660, '1f49c': 1660, '1f4a5': 1150, '1f4a9': 2170, '1f4aa': 1420, '1f4af': 1360, '1f4b8': 730, '1f525': 1000, '1f5a4': 1660, '1f600': 2110, '1f601': 2350, '1f602': 1780, '1f605': 1810, '1f606': 2800, '1f607': 2950, '1f608': 3160, '1f609': 1750, '1f60a': 2200, '1f60b': 1300, '1f60d': 1540, '1f60e': 2080, '1f60f': 1540, '1f610': 2260, '1f618': 1600, '1f61c': 1420, '1f621': 2710, '1f622': 1660, '1f624': 1360, '1f62c': 2380, '1f62d': 1810, '1f62e': 2020, '1f631': 1540, '1f633': 1810, '1f634': 1810, '1f636_200d_1f32b_fe0f': 2590, '1f643': 1390, '1f644': 2860, '1f64c': 1420, '1f64f': 760, '1f680': 610, '1f90c': 1930, '1f913': 2710, '1f914': 1810, '1f916': 2470, '1f917': 1600, '1f919': 2320, '1f91d': 1090, '1f91e': 1690, '1f920': 1360, '1f921': 1870, '1f922': 2290, '1f923': 910, '1f924': 1960, '1f928': 1150, '1f929': 1810, '1f92a': 1660, '1f92c': 2260, '1f92d': 1630, '1f92e': 3490, '1f92f': 2500, '1f970': 1480, '1f973': 1630, '1f975': 1270, '1f976': 1840, '1f97a': 3100, '1f9e1': 1660, '1fae0': 3460, '1fae1': 1810, '1fae3': 3490, '1faf6': 1300, '26a1': 1270, '270a': 1210, '270c_fe0f': 1660, '2728': 1840, '2764_fe0f': 1690, '2764_fe0f_200d_1f525': 910, '2b50': 2200,
};

export function animatedChatEmojiSrc(emoji: string): string | null {
  const cps = Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16));
  const tries = [cps.join('_'), cps.filter((c) => c !== 'fe0f').join('_'), `${cps.join('_')}_fe0f`];
  const hit = tries.find((t) => t in ANIMATED);
  return hit ? `/emoji/animated/chat/${hit}.webp` : null;
}

/** How long one loop of that file runs. */
export function animatedChatEmojiMs(src: string): number {
  const cp = src.slice(src.lastIndexOf('/') + 1, -5);
  return ANIMATED[cp] ?? 2000;
}

const blobs = new Map<string, Promise<Blob | null>>();

/**
 * A new object URL per play. Browsers share one animation clock between
 * <img>s with the same URL, so a fresh mount of a cached file can start
 * halfway through; a fresh blob URL always starts on frame one.
 */
export async function freshPlayUrl(src: string): Promise<string | null> {
  let p = blobs.get(src);
  if (!p) {
    p = fetch(src).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
    blobs.set(src, p);
  }
  const blob = await p;
  return blob ? URL.createObjectURL(blob) : null;
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

/** A floating copy of the emoji, animated file when we have one. */
function makeEmoji(emoji: string, src: string | null, size: number): HTMLElement {
  const node = document.createElement('div');
  Object.assign(node.style, {
    position: 'absolute', left: '0', top: '0', width: `${size}px`, height: `${size}px`,
    marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px`, display: 'grid', placeItems: 'center',
    fontSize: `${Math.round(size * 0.82)}px`, lineHeight: '1', willChange: 'transform, opacity',
  });
  node.textContent = emoji;
  if (src) {
    void freshPlayUrl(src).then((url) => {
      if (!url || !node.isConnected) { if (url) URL.revokeObjectURL(url); return; }
      const img = new Image();
      img.src = url;
      img.alt = '';
      Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain' });
      img.decode?.().catch(() => {}).then(() => {
        if (!node.isConnected) return;
        node.textContent = '';
        node.appendChild(img);
      });
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  }
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

function hideUntil(glyph: HTMLElement, ms: number, total: number) {
  glyph.animate([{ opacity: 0 }, { opacity: 0, offset: ms / total }, { opacity: 1 }], { duration: total, easing: 'linear' });
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
  src: string | null;
}

export function paintReactionArrival({ chip, glyph, emoji, mine, src }: ArrivalInput) {
  if (prefersReducedMotion() || typeof document === 'undefined') return;
  const style = reactionMotionStyle();
  if (style === 'off') return;
  const color = getComputedStyle(chip).color || 'rgb(255,255,255)';
  // The layer can sit under CSS zoom; rects and pointers come in screen pixels.
  const z = (getLayer() as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
  const toLayer = (p: { x: number; y: number }) => ({ x: p.x / z, y: p.y / z });
  const target = toLayer(center(glyph.getBoundingClientRect()));

  if (style === 'pop') {
    chip.animate(
      [{ transform: 'scale(.35)', opacity: 0.2 }, { transform: 'scale(1.28)', opacity: 1, offset: 0.4 }, { transform: 'scale(.94)', offset: 0.72 }, { transform: 'scale(1)' }],
      { duration: 560, easing: 'cubic-bezier(.3,1.3,.5,1)' },
    );
    return;
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
    const lead = makeEmoji(emoji, src, size);
    getLayer().appendChild(lead);
    const end = 16 / size;
    const a = lead.animate(
      pts.map((p) => ({
        transform: `translate(${p.x}px, ${p.y}px) scale(${p.t < 0.15 ? 0.5 + p.t * 3.4 : 1 - (1 - end) * Math.max(0, (p.t - 0.55) / 0.45)})`,
        opacity: p.t < 0.1 ? p.t * 10 : 1,
      })),
      { duration: total, easing: 'cubic-bezier(.45,.05,.35,1)' },
    );
    done(a, lead);
    // A faint trail on other people's, so it reads as "came from someone".
    if (!mine) {
      [90, 170].forEach((delay, i) => {
        const ghost = document.createElement('div');
        ghost.textContent = emoji;
        Object.assign(ghost.style, { position: 'absolute', left: '0', top: '0', fontSize: `${size * (0.6 - i * 0.15)}px`, lineHeight: '1', marginLeft: `${-size * 0.3}px`, marginTop: `${-size * 0.3}px`, opacity: '0' });
        getLayer().appendChild(ghost);
        const g = ghost.animate(
          pts.map((p) => ({ transform: `translate(${p.x}px, ${p.y}px)`, opacity: p.t > 0.85 ? 0 : 0.35 - i * 0.12 })),
          { duration: total, delay, easing: 'cubic-bezier(.45,.05,.35,1)' },
        );
        done(g, ghost);
      });
    }
    hideUntil(glyph, total, total + 60);
    window.setTimeout(() => {
      chipBump(chip, mine ? 1 : 0.7);
      sparks(target, color, mine ? 6 : 4, mine ? 18 : 13);
    }, total - 30);
    return;
  }

  // burst
  if (mine) {
    const size = 58;
    const bloom = { x: target.x, y: Math.max(size, target.y - 44) };
    const big = makeEmoji(emoji, src, size);
    getLayer().appendChild(big);
    const total = 1250;
    const end = 16 / size;
    const a = big.animate(
      [
        { transform: `translate(${bloom.x}px, ${bloom.y}px) scale(.2)`, opacity: 0 },
        { transform: `translate(${bloom.x}px, ${bloom.y}px) scale(1.18)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${bloom.x}px, ${bloom.y}px) scale(1)`, offset: 0.32 },
        { transform: `translate(${bloom.x}px, ${bloom.y}px) scale(1)`, offset: 0.68 },
        { transform: `translate(${target.x}px, ${target.y}px) scale(${end})`, opacity: 1 },
      ],
      { duration: total, easing: 'cubic-bezier(.4,0,.3,1)' },
    );
    done(a, big);
    window.setTimeout(() => {
      ring(bloom, color, 24, 112, 620);
      sparks(bloom, color, 8, 54);
      sparks(bloom, color, 5, 70, { char: emoji, size: 13 });
    }, 220);
    hideUntil(glyph, total, total + 60);
    window.setTimeout(() => chipBump(chip, 1), total - 20);
    return;
  }
  chipBump(chip, 0.9);
  ring(target, color, 10, 46, 480);
  sparks(target, color, 5, 20);
}
