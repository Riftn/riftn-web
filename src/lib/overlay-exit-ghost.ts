/**
 * Slide a closing overlay away without keeping it alive.
 *
 * Every Radix overlay here (Dialog, AlertDialog, Sheet, Drawer, Popover,
 * DropdownMenu) drops its portal the moment it closes. That is on purpose: an
 * exiting Radix layer still owns RemoveScroll and DismissableLayer, so the
 * next touch on the page is swallowed, and an interrupted exit can leave an
 * invisible scrim behind (see hooks/use-overlay-lifetime). The cost was that
 * every drawer simply vanished.
 *
 * So the real overlay still goes at once, and a frozen copy of it takes its
 * place for the exit: cloned just before React removes it, inert, never
 * hit-testable, and gone when its animation ends. Sheets slide back out the
 * way they came; floating cards and menus fade and shrink a little; the scrim
 * fades. Radix portals the scrim and the surface separately, so each one is
 * registered and copied on its own (components/ui/overlay-exit).
 */

import { OVERLAY_ROOT_ID } from './overlay-root';

const GHOST_ATTR = 'data-overlay-ghost';
const SLIDE_MS = 240;
const POP_MS = 150;
/** Smooth at both ends: starts moving at once, settles off screen without a snap. */
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const SCRIM = '[data-radix-dialog-overlay],[data-vaul-overlay],[data-overlay-scrim]';

type Exit = { kind: 'slide'; dx: number; dy: number } | { kind: 'pop' };

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.setAttribute('data-overlay-ghost-style', '');
  style.textContent = `[${GHOST_ATTR}],[${GHOST_ATTR}] *{pointer-events:none!important;user-select:none!important}`;
  document.head.appendChild(style);
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Which way this surface leaves: back off the edge it is attached to, or a small fade. */
export function exitFor(node: Element, rect: DOMRect, vw: number, vh: number): Exit {
  const gap = 24;
  const vaulDir = node.getAttribute('data-vaul-drawer-direction');
  if (node.hasAttribute('data-vaul-drawer')) {
    if (vaulDir === 'top') return { kind: 'slide', dx: 0, dy: -(rect.bottom + gap) };
    if (vaulDir === 'left') return { kind: 'slide', dx: -(rect.right + gap), dy: 0 };
    if (vaulDir === 'right') return { kind: 'slide', dx: vw - rect.left + gap, dy: 0 };
    return { kind: 'slide', dx: 0, dy: Math.max(vh - rect.top, 0) + gap };
  }
  const edge = 4;
  const atTop = rect.top <= edge;
  const atBottom = rect.bottom >= vh - edge;
  const atLeft = rect.left <= edge;
  const atRight = rect.right >= vw - edge;
  const tall = rect.height >= vh * 0.6;
  const wide = rect.width >= Math.min(vw, 360) * 0.85;
  if (atBottom && !atTop && wide) return { kind: 'slide', dx: 0, dy: vh - rect.top + gap };
  if (tall && atRight && !atLeft) return { kind: 'slide', dx: vw - rect.left + gap, dy: 0 };
  if (tall && atLeft && !atRight) return { kind: 'slide', dx: -(rect.right + gap), dy: 0 };
  if (atTop && !atBottom && rect.width >= vw * 0.6) return { kind: 'slide', dx: 0, dy: -(rect.bottom + gap) };
  return { kind: 'pop' };
}

/** The body child that holds this overlay (its portal), or null when it is not portalled. */
function portalHost(node: HTMLElement): HTMLElement | null {
  let host: HTMLElement = node;
  // Overlays portal into the overlay root (lib/overlay-root); anything still
  // portalling straight to <body> is handled the same way.
  const isPortalParent = (el: Element | null) => el === document.body || el?.id === OVERLAY_ROOT_ID;
  while (host.parentElement && !isPortalParent(host.parentElement)) host = host.parentElement;
  if (!isPortalParent(host.parentElement)) return null;
  // Never copy the app itself: an overlay rendered inline has no portal of its own.
  if (host.id === 'root' || host.querySelector('#root')) return null;
  return host;
}

function indexPath(from: Element, to: Element): number[] | null {
  const path: number[] = [];
  let cur: Element | null = to;
  while (cur && cur !== from) {
    const parent: Element | null = cur.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return cur === from ? path : null;
}

function follow(from: Element, path: number[]): HTMLElement | null {
  let cur: Element | undefined = from;
  for (const i of path) {
    cur = cur?.children[i];
    if (!cur) return null;
  }
  return (cur as HTMLElement) ?? null;
}

/**
 * Make the copy look exactly like the last frame of the original and do
 * nothing else: no ids, no form names, no media playing, no frames loading.
 */
function freeze(original: HTMLElement, clone: HTMLElement) {
  const from = original.querySelectorAll('*');
  const to = clone.querySelectorAll('*');
  const scrolls: Array<[Element, number, number]> = [];
  const n = Math.min(from.length, to.length);
  for (let i = 0; i < n; i++) {
    const a = from[i] as HTMLElement;
    const b = to[i] as HTMLElement;
    if (b.id) b.removeAttribute('id');
    if (b.hasAttribute('autofocus')) b.removeAttribute('autofocus');
    if (a.scrollTop || a.scrollLeft) scrolls.push([b, a.scrollTop, a.scrollLeft]);
    const tag = a.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      try {
        (b as HTMLInputElement).value = (a as HTMLInputElement).value;
      } catch {
        /* file inputs refuse a value */
      }
      b.removeAttribute('name');
    } else if (tag === 'VIDEO' || tag === 'CANVAS' || tag === 'IFRAME' || tag === 'AUDIO') {
      b.replaceWith(snapshot(a));
    } else if (tag === 'IMG') {
      (b as HTMLImageElement).decoding = 'sync';
      (b as HTMLImageElement).loading = 'eager';
    }
  }
  return scrolls;
}

/** A still of a video or canvas, or an empty box of the same size for anything that would load or play. */
function snapshot(el: HTMLElement): HTMLElement {
  const tag = el.tagName;
  if (tag === 'VIDEO' || tag === 'CANVAS') {
    const canvas = document.createElement('canvas');
    canvas.className = el.className;
    canvas.setAttribute('style', el.getAttribute('style') ?? '');
    try {
      const w = tag === 'VIDEO' ? (el as HTMLVideoElement).videoWidth : (el as HTMLCanvasElement).width;
      const h = tag === 'VIDEO' ? (el as HTMLVideoElement).videoHeight : (el as HTMLCanvasElement).height;
      if (w && h) {
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(el as CanvasImageSource, 0, 0, w, h);
      }
      const fit = getComputedStyle(el).objectFit;
      if (fit) canvas.style.objectFit = fit;
    } catch {
      /* a blank box is fine for 240ms */
    }
    return canvas;
  }
  const box = document.createElement('div');
  box.className = el.className;
  box.setAttribute('style', el.getAttribute('style') ?? '');
  return box;
}

function stripMotion(transform: string) {
  return transform && transform !== 'none' ? transform : '';
}

const ghosted = new WeakSet<Element>();

let exitsInFlight = 0;
/**
 * Is a closed overlay still sliding off screen? Its copy cannot be clicked, so
 * for those few frames a press goes straight through it to the page — on a
 * slow device that is long enough to act on (lib/overlay-click-guard).
 */
export function isOverlayExiting(): boolean {
  return exitsInFlight > 0;
}

/**
 * Replace a closing overlay surface with a copy that slides or fades away.
 * Call it while `node` is still in the document, just before React removes it.
 */
export function ghostOverlayExit(node: HTMLElement | null | undefined): void {
  try {
    if (!node || !node.isConnected || ghosted.has(node)) return;
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') return;
    // Already on its way out (a sheet that runs its own exit, e.g. LoginModal).
    if (node.getAttribute('data-state') === 'closed') return;
    if (reducedMotion() || typeof node.animate !== 'function') return;
    const host = portalHost(node);
    if (!host || ghosted.has(host)) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Nothing on screen to move: a drag already carried it off.
    if (rect.top >= vh || rect.bottom <= 0 || rect.left >= vw || rect.right <= 0) return;
    const path = indexPath(host, node);
    if (!path) return;
    ghosted.add(node);
    ghosted.add(host);
    injectStyle();

    const isScrim = node.matches(SCRIM);
    const exit: Exit = isScrim ? { kind: 'pop' } : exitFor(node, rect, vw, vh);
    const surfaceStyle = getComputedStyle(node);
    const baseTransform = stripMotion(surfaceStyle.transform);
    const baseOpacity = surfaceStyle.opacity || '1';
    const scrims = (isScrim ? [] : Array.from(host.querySelectorAll<HTMLElement>(SCRIM))).map((el) => ({
      path: indexPath(host, el),
      opacity: getComputedStyle(el).opacity || '1',
    }));

    const clone = host.cloneNode(true) as HTMLElement;
    const scrolls = freeze(host, clone);
    clone.setAttribute(GHOST_ATTR, '');
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('inert', '');
    clone.removeAttribute('id');
    host.parentElement!.insertBefore(clone, host);

    for (const [el, top, left] of scrolls) {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
    // The copy restarts every CSS entrance it carries (slide-in, fade-in).
    // Jump them to their end so it shows the frame the reader just saw.
    try {
      for (const anim of clone.getAnimations({ subtree: true })) {
        try {
          anim.finish();
        } catch {
          /* endless loops (spinners) keep running */
        }
      }
    } catch {
      /* older engines: entrances replay, still better than vanishing */
    }

    const surface = follow(clone, path);
    const anims: Animation[] = [];
    // A scrim fades over the sheet's time so the two leave together.
    const ms = exit.kind === 'slide' || isScrim ? SLIDE_MS : POP_MS;
    if (surface && isScrim) {
      surface.style.transition = 'none';
      anims.push(surface.animate([{ opacity: baseOpacity }, { opacity: '0' }], { duration: SLIDE_MS, easing: 'ease-out', fill: 'forwards' }));
    } else if (surface) {
      surface.style.transition = 'none';
      if (exit.kind === 'slide') {
        anims.push(surface.animate(
          [
            { transform: baseTransform || 'none' },
            { transform: `translate(${Math.round(exit.dx)}px, ${Math.round(exit.dy)}px) ${baseTransform}`.trim() },
          ],
          { duration: ms, easing: EASE, fill: 'forwards' },
        ));
      } else {
        anims.push(surface.animate(
          [
            { opacity: baseOpacity, transform: baseTransform || 'none' },
            { opacity: '0', transform: `${baseTransform} scale(0.96)`.trim() },
          ],
          { duration: ms, easing: 'ease-out', fill: 'forwards' },
        ));
      }
    }
    for (const scrim of scrims) {
      const el = scrim.path ? follow(clone, scrim.path) : null;
      if (!el) continue;
      el.style.transition = 'none';
      anims.push(el.animate([{ opacity: scrim.opacity }, { opacity: '0' }], { duration: ms, easing: 'ease-out', fill: 'forwards' }));
    }
    // Anything else in the portal (a floating close button, a caption) fades with it.
    if (!surface && !anims.length) {
      anims.push(clone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }));
    }

    let removed = false;
    exitsInFlight++;
    const remove = () => {
      if (removed) return;
      removed = true;
      exitsInFlight = Math.max(0, exitsInFlight - 1);
      clone.remove();
    };
    Promise.all(anims.map((a) => a.finished)).then(remove, remove);
    // A throttled tab can stall the animation; never leave the copy behind.
    window.setTimeout(remove, ms + 1800);
  } catch {
    /* the overlay just closes the old way */
  }
}

/** Test hook. */
export const OVERLAY_GHOST_ATTR = GHOST_ATTR;
