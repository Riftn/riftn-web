import { flushSync } from 'react-dom';
import { stableNavigate } from '@/lib/client-navigate';

/**
 * The live chat side panel opening out into riftn.com/chat in the same tab,
 * and folding back into the panel when the full page is closed.
 *
 * One View Transition per step: the page under the panel is frozen as a
 * picture, the route changes, and the browser animates from the old picture
 * to the new page. The look is picked by `html[data-chat-fx]` (index.css).
 */
export type ChatExpandFx = 'grow' | 'unfold' | 'slide';

const ORIGIN_KEY = 'riftn.chatExpandOrigin';

type Origin = { idx: number; rect: { t: number; r: number; b: number; l: number } };

function fx(): ChatExpandFx {
  const pick = (window as unknown as { __chatExpandFx?: ChatExpandFx }).__chatExpandFx;
  return pick === 'unfold' || pick === 'slide' ? pick : 'grow';
}

function canAnimate(): boolean {
  return typeof document !== 'undefined'
    && 'startViewTransition' in document
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Waits (outside the frozen frame) until the new screen has its chat lines. */
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

function setInsetVars(rect: Origin['rect']) {
  const s = document.documentElement.style;
  s.setProperty('--cx-t', `${rect.t}px`);
  s.setProperty('--cx-r', `${rect.r}px`);
  s.setProperty('--cx-b', `${rect.b}px`);
  s.setProperty('--cx-l', `${rect.l}px`);
}

/** The side panel the person is looking at (other copies can sit hidden). */
function visiblePanel(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-chat]'));
  const chat = all.find((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0);
  return (chat?.closest('[data-side-panel]') as HTMLElement | null) ?? null;
}

function name(el: HTMLElement | null, on: boolean) {
  if (el && fx() === 'grow') el.style.viewTransitionName = on ? 'live-chat' : '';
}

function run(dir: 'open' | 'close', update: () => void, readySelector: string) {
  const root = document.documentElement;
  if (!canAnimate()) { update(); return; }
  root.dataset.chatFx = fx();
  root.dataset.chatFxDir = dir;
  let panel = dir === 'open' ? visiblePanel() : null;
  name(panel, true);
  const t = (document as Document & { startViewTransition: (cb: () => Promise<void>) => { finished: Promise<void> } })
    .startViewTransition(async () => {
      name(panel, false);
      flushSync(update);
      await waitFor(readySelector);
      if (dir === 'close') { panel = visiblePanel(); name(panel, true); }
    });
  t.finished.finally(() => {
    name(panel, false);
    delete root.dataset.chatFx;
    delete root.dataset.chatFxDir;
  });
}

/** The panel's "Open full chat" button. */
export function expandChat(panel: HTMLElement | null) {
  const box = panel?.getBoundingClientRect();
  const rect = box
    ? { t: box.top, r: window.innerWidth - box.right, b: window.innerHeight - box.bottom, l: box.left }
    : { t: 0, r: 0, b: 0, l: Math.round(window.innerWidth * 0.75) };
  const origin: Origin = { idx: historyIdx(), rect };
  try { sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(origin)); } catch { /* private mode */ }
  setInsetVars(rect);
  // The surface that grows: the panel's own colour (glass themes get a tint + blur).
  const bg = panel ? getComputedStyle(panel).backgroundColor : '';
  const alpha = /rgba?\(([^)]+)\)/.exec(bg)?.[1].split(',')[3];
  document.documentElement.style.setProperty('--cx-bg', bg && (alpha === undefined || Number(alpha) > 0.5) ? bg : 'rgba(18,18,22,.72)');
  const page = getComputedStyle(document.body).backgroundColor;
  document.documentElement.style.setProperty('--cx-bg2', page && page !== 'rgba(0, 0, 0, 0)' ? page : 'var(--cx-bg)');
  // Fetch the page code first so the frozen frame is as short as possible.
  void import('@/pages/app/FullScreenChatPage').then(() => {
    run('open', () => stableNavigate('/chat?chat=public', { state: { chatExpanded: true } }), '[data-chat-expand-target] [data-chat-row]');
  });
}

/** True while the full page was opened out of the panel (so closing folds back). */
export function cameFromPanel(): boolean {
  try { return !!sessionStorage.getItem(ORIGIN_KEY); } catch { return false; }
}

/** Back arrow / Esc on the full page: fold back into the panel. */
export function collapseChat(): boolean {
  let origin: Origin | null = null;
  try { origin = JSON.parse(sessionStorage.getItem(ORIGIN_KEY) || 'null'); } catch { origin = null; }
  if (!origin) return false;
  try { sessionStorage.removeItem(ORIGIN_KEY); } catch { /* ignore */ }
  setInsetVars(origin.rect);
  const steps = origin.idx - historyIdx();
  run('close', () => stableNavigate(steps < 0 ? steps : -1), '[data-sidebar-chat] [data-message-id]');
  return true;
}
