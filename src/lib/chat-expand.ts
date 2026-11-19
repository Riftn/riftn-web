import { flushSync } from 'react-dom';
import { stableNavigate } from '@/lib/client-navigate';

/**
 * The live chat side panel opening out into riftn.com/chat in the same tab,
 * and going back into the panel when the full page is closed (back arrow, Esc).
 *
 * One View Transition per step: the screen is frozen as a picture, the route
 * changes, and the browser animates from that picture to the new page. The
 * look is set by `html[data-chat-fx]` in index.css:
 * - slide: the chat page slides in over the feed from the right edge, where
 *   the panel lives (every theme but Immersive).
 * - grow: the panel itself stretches into the chat column (Immersive).
 */
type ChatExpandFx = 'grow' | 'slide';

const ORIGIN_KEY = 'riftn.chatExpandOrigin';

/** Where the full page was opened from: the history entry to step back to. */
type Origin = { idx: number };

function fx(): ChatExpandFx {
  return document.documentElement.dataset.theme === 'immersive' ? 'grow' : 'slide';
}

function canAnimate(): boolean {
  return typeof document !== 'undefined'
    && 'startViewTransition' in document
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Holds the frozen picture until the new screen has its chat lines (the
 * messages come from the shared live chat cache, so this is a few frames),
 * capped so a slow network never leaves the screen stuck.
 */
function waitFor(selector: string, ms = 900): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (document.querySelector(selector) || performance.now() - start > ms) { resolve(); return; }
      window.setTimeout(tick, 16);
    };
    tick();
  });
}

function historyIdx(): number {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' ? state.idx : 0;
}

/** The side panel on screen (home keeps a second, hidden copy in the DOM). */
function visiblePanel(): HTMLElement | null {
  const chats = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-chat]'));
  const chat = chats.find((el) => el.getBoundingClientRect().width > 0);
  return (chat?.closest('[data-side-panel]') as HTMLElement | null) ?? null;
}

/** Grow pairs the panel with the chat column; the name must be on ONE element. */
function nameGrow(el: HTMLElement | null, on: boolean) {
  if (el) el.style.viewTransitionName = on ? 'live-chat' : '';
}

function run(dir: 'open' | 'close', update: () => void, readySelector: string) {
  const root = document.documentElement;
  if (!canAnimate()) { update(); return; }
  const look = fx();
  root.dataset.chatFx = look;
  root.dataset.chatFxDir = dir;
  let panel = look === 'grow' && dir === 'open' ? visiblePanel() : null;
  if (look === 'grow' && panel) {
    // The surface that grows starts in the panel's colour and ends in the page's.
    root.style.setProperty('--cx-bg', getComputedStyle(panel).backgroundColor);
    root.style.setProperty('--cx-bg2', getComputedStyle(document.body).backgroundColor);
  }
  nameGrow(panel, true);
  const done = () => {
    nameGrow(panel, false);
    delete root.dataset.chatFx;
    delete root.dataset.chatFxDir;
  };
  try {
    const transition = (document as Document & { startViewTransition: (cb: () => Promise<void>) => { finished: Promise<void> } })
      .startViewTransition(async () => {
        nameGrow(panel, false);
        flushSync(update);
        await waitFor(readySelector);
        if (look === 'grow' && dir === 'close') { panel = visiblePanel(); nameGrow(panel, true); }
      });
    transition.finished.finally(done);
  } catch {
    done();
    update();
  }
}

/** The panel's full screen button. */
export function expandChat() {
  const origin: Origin = { idx: historyIdx() };
  try { sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(origin)); } catch { /* private mode */ }
  // Fetch the page code first so the frozen frame is as short as possible.
  void import('@/pages/app/FullScreenChatPage').then(() => {
    run('open', () => stableNavigate('/chat?chat=public'), '[data-chat-expand-target] [data-chat-row]');
  });
}

/** True while the full page was opened from the panel (so closing goes back to it). */
export function cameFromPanel(): boolean {
  try { return !!sessionStorage.getItem(ORIGIN_KEY); } catch { return false; }
}

/** The panel is on screen again however the person got back: forget the trip. */
export function forgetChatOrigin() {
  try { sessionStorage.removeItem(ORIGIN_KEY); } catch { /* ignore */ }
}

/** Back arrow / Esc on the full page: back to the panel. False if not opened from it. */
export function collapseChat(): boolean {
  let origin: Origin | null = null;
  try { origin = JSON.parse(sessionStorage.getItem(ORIGIN_KEY) || 'null'); } catch { origin = null; }
  if (!origin) return false;
  forgetChatOrigin();
  const steps = origin.idx - historyIdx();
  run('close', () => stableNavigate(steps < 0 ? steps : -1), '[data-sidebar-chat] [data-message-id]');
  return true;
}
