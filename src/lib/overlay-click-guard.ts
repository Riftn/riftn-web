/**
 * A press that dismisses an overlay must not also press the page
 * ===============================================================
 * Two ways it used to:
 *
 * 1. The ghost click. A tap on a backdrop closes the sheet on touchend, the
 *    backdrop leaves the DOM, and the click the browser synthesizes a moment
 *    later is hit-tested against whatever is now underneath — a post, a Follow
 *    button, a link. Feed cards guard against this one at a time with
 *    `wasDrawerJustDismissed()`; everything else on the page had nothing.
 *
 * 2. The exit window. A closed overlay slides away as an inert copy
 *    (lib/overlay-exit-ghost) that cannot take a press, so for the length of
 *    that animation the page is live while still looking covered. On a fast
 *    machine that is 240ms. On a slow phone, with the main thread busy tearing
 *    the sheet down, it is long enough for a second "why hasn't it closed" tap
 *    to land on the page.
 *
 * Both are the same gesture from the reader's side: they pressed to get rid of
 * an overlay. So a press that starts on a backdrop, or lands on the page while
 * a closed overlay is still leaving, never becomes a click on the page.
 *
 * Only the click is withheld, and only from the page. The pointerdown is left
 * alone because Radix and vaul dismiss on it, and anything outside `#root`
 * (wallet iframes, the toaster, another overlay) is never touched.
 */
import { isInteractionInsideOverlay } from './overlay-dismiss';
import { isOverlayExiting } from './overlay-exit-ghost';

/** Backdrops: a press here means "close this". The popper wrapper is the clear one behind a menu (index.css). */
const BACKDROP = [
  '[data-radix-dialog-overlay]',
  '[data-vaul-overlay]',
  '[data-overlay-scrim]',
  '[data-overlay-shield]',
  '[data-radix-popper-content-wrapper]',
].join(',');

/** A click follows its pointerup at once for a mouse and within ~300ms for touch. */
const CLICK_WINDOW_MS = 700;

let armed = false;
let releasedAt = 0;
let replaying = false;

function page(): HTMLElement | null {
  return document.getElementById('root');
}

/**
 * The clear backdrops (index.css) sit inside the React tree of whatever opened
 * the menu or sheet, and React bubbles a press on them up through that tree
 * before it reaches the document, where Radix listens for "pressed outside". A
 * card that stops pointerdown so a press on its controls does not navigate
 * therefore also stopped its own menu from ever closing. So a press on a clear
 * backdrop closes its layer here if Radix has not by the next tick, the same
 * way Escape does: only the top layer answers it.
 */
function isClearBackdrop(target: Element): boolean {
  if (target.matches('[data-overlay-shield]')) return true;
  return target.matches('[data-radix-popper-content-wrapper]') && !!target.querySelector(':scope > [data-modal-shield]');
}

function stillOpen(backdrop: Element): boolean {
  if (!backdrop.isConnected) return false;
  const layer = backdrop.matches('[data-overlay-shield]') ? backdrop.nextElementSibling : backdrop.firstElementChild;
  return layer?.getAttribute('data-state') === 'open';
}

function closeTopLayer() {
  replaying = true;
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  } finally {
    replaying = false;
  }
}

function onPointerDown(e: Event) {
  if (replaying) return;
  armed = false;
  releasedAt = 0;
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (target.matches(BACKDROP)) {
    armed = true;
    if (isClearBackdrop(target)) {
      window.setTimeout(() => {
        if (stillOpen(target)) closeTopLayer();
      }, 0);
    }
    return;
  }
  if (isOverlayExiting() && page()?.contains(target) && !isInteractionInsideOverlay(target)) armed = true;
}

function onPointerUp() {
  if (armed) releasedAt = Date.now();
}

function disarm() {
  if (replaying) return;
  armed = false;
  releasedAt = 0;
}

function onClick(e: Event) {
  if (replaying || !armed) return;
  const fresh = releasedAt === 0 || Date.now() - releasedAt < CLICK_WINDOW_MS;
  disarm();
  if (!fresh) return;
  const target = e.target;
  if (!(target instanceof Element)) return;
  // Still on a backdrop, or inside some overlay's own content: not the page.
  if (!page()?.contains(target) || isInteractionInsideOverlay(target)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  // On touch Radix waits for the click before it dismisses a layer. Give any
  // layer still waiting one that goes nowhere near the page.
  replaying = true;
  try {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  } finally {
    replaying = false;
  }
}

export function installOverlayClickGuard(): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', disarm, true);
  window.addEventListener('keydown', disarm, true);
  window.addEventListener('click', onClick, true);
  return () => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', disarm, true);
    window.removeEventListener('keydown', disarm, true);
    window.removeEventListener('click', onClick, true);
    disarm();
  };
}
