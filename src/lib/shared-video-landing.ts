/**
 * Shared post links on a phone
 * ============================
 * Someone opens a post link (a share, a message, another app) and the site
 * starts on that post. On a phone:
 *
 * - Home goes in underneath it, so Back from the post lands on the home feed
 *   instead of leaving the site (or doing nothing in a fresh tab).
 * - A playable video opens straight in the Shorts viewer, the player a feed
 *   tap opens, on that video. Back or closing the viewer shows the post page.
 *
 * Runs once at boot, before the router reads the address, and only for a
 * page load that starts on the post. Desktop and tablets are untouched, and so
 * are links to a comment or a chat line, which keep the post page.
 */

const POST_PATH = /^\/(?:app\/)?(?:post|posts|video|newpost)\/[^/]+\/?$/;
/** Links that point inside the post (a comment, a stream chat line). */
const FOCUS_PARAMS = ['comment', 'comments', 'c', 'msg', 'reply'];

let pending = false;
let pendingAt = 0;
/** A post that has not loaded by then is not the one the link opened. */
const PENDING_MS = 30_000;

function live(): boolean {
  if (pending && Date.now() - pendingAt > PENDING_MS) pending = false;
  return pending;
}

function phoneWidth(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches;
}

/** Call once from main, before the app renders. */
export function prepareSharedVideoLanding(): void {
  try {
    if (!phoneWidth()) return;
    // A fresh load only. Back/forward and reloads come back with the
    // router's own state on the entry.
    if (window.history.state != null) return;
    const { pathname, search, hash } = window.location;
    if (!POST_PATH.test(pathname)) return;
    const params = new URLSearchParams(search);
    if (FOCUS_PARAMS.some(key => params.has(key))) return;
    const here = `${pathname}${search}${hash}`;
    // The shape react-router keeps on its entries: Home at 0, the post at 1.
    window.history.replaceState({ usr: null, key: 'home', idx: 0 }, '', '/app');
    window.history.pushState({ usr: null, key: Math.random().toString(36).slice(2, 10), idx: 1 }, '', here);
    pending = true;
    pendingAt = Date.now();
  } catch {
    pending = false;
  }
}

/** True once, for the post page the site opened on. */
export function takeSharedVideoLanding(): boolean {
  if (!live()) return false;
  pending = false;
  return true;
}

/** For the post page to say "not a video": nothing to open later either. */
export function hasSharedVideoLanding(): boolean {
  return live();
}

/**
 * Back closes the viewer: an extra entry at the same address sits on top
 * while it is open. Closing it any other way takes the entry off again.
 */
export function holdBackForViewer(close: () => void, isOpen: () => boolean): () => void {
  const MARK = '__riftnSharedViewer';
  window.history.pushState({ ...(window.history.state ?? {}), [MARK]: true }, '');
  let done = false;
  const onPop = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', onPop);
    if (isOpen()) close();
  };
  window.addEventListener('popstate', onPop);
  return () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', onPop);
    const state = window.history.state as Record<string, unknown> | null;
    if (state && state[MARK] === true) window.history.back();
  };
}
