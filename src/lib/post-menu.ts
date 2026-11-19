/**
 * Post right-click menu
 * =====================
 * Right-click a post anywhere (a feed card, a profile grid tile, a search
 * result) and one menu opens at the pointer with everything that can be done
 * to it: react, comment, send in a message, repost, quote, tip, bookmark,
 * copy the link or the words, SuperPowers, follow, mute, block, report.
 *
 * This module is the small part every card and tile imports: the open/close
 * store and the event handlers. The menu itself (PostMenuHost) is loaded the
 * first time somebody right-clicks, so the feed never pays for it.
 *
 * A card already owns a vote, a repost count and a share-in-DM sheet in its
 * ActionBar. The menu asks that bar to do the work (POST_MENU_EVENT) so the
 * counts on the card move with the click. A grid tile has no bar, and the
 * menu does the work itself.
 */

import { useCallback, useRef, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { PostVisibility, QuotePolicy } from '@/lib/api/dehub/types';
import type { PostReaction } from '@/lib/reactions';

/** What a card can do better than the menu on its own: open its comments in place, its own modals. */
export interface PostMenuHostActions {
  comments?: () => void;
  askAI?: () => void;
  seeEngagements?: () => void;
  quote?: () => void;
  tip?: () => void;
  report?: () => void;
  boost?: () => void;
  edit?: () => void;
  delete?: () => void;
}

export interface PostMenuTarget {
  /** The post's id as the feed carries it (a token id for minted posts). */
  id: string;
  newPostId?: number | null;
  articleSlug?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  /** The words of the post, for Copy text. */
  text?: string | null;
  /** A title for the boost sheet. */
  title?: string | null;
  isOwn?: boolean;
  visibility?: PostVisibility | null;
  quotePolicy?: QuotePolicy | null;
  myReaction?: PostReaction | null;
  isReposted?: boolean;
  /** The author turned tips off. */
  noTip?: boolean;
  actions?: PostMenuHostActions;
}

export interface PostMenuOpen {
  point: { x: number; y: number };
  target: PostMenuTarget;
  /** Bumps on every open so the same post can be opened twice in a row. */
  seq: number;
}

let current: PostMenuOpen | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openPostMenu(point: { x: number; y: number }, target: PostMenuTarget) {
  seq += 1;
  current = { point, target, seq };
  emit();
}

export function closePostMenu() {
  if (!current) return;
  current = null;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function usePostMenuState(): PostMenuOpen | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

// ── Bridge to the card's ActionBar ──────────────────────────────────────────

export const POST_MENU_EVENT = 'dehub:post-menu';

export interface PostBarState {
  myReaction: PostReaction | null;
  isReposted: boolean;
  reactionsEnabled: boolean;
}

export interface PostMenuBridgeDetail {
  postId: string;
  action: 'state' | 'react' | 'repost' | 'dm';
  reaction?: PostReaction;
  /** Set by the first ActionBar that took the request. */
  handled?: boolean;
  /** Filled in for `state`. */
  state?: PostBarState;
}

/**
 * Hands a request to the post's ActionBar, if one is on screen. Synchronous:
 * window events run their listeners before dispatchEvent returns, so
 * `handled` and `state` are already set on the way back.
 */
export function askPostBar(detail: PostMenuBridgeDetail): PostMenuBridgeDetail {
  if (typeof window === 'undefined') return detail;
  try {
    window.dispatchEvent(new CustomEvent<PostMenuBridgeDetail>(POST_MENU_EVENT, { detail }));
  } catch { /* old browser: the menu does the work itself */ }
  return detail;
}

// ── Opening it ──────────────────────────────────────────────────────────────

/**
 * Right-clicks the browser keeps: a text link (Copy link address, open in a
 * new tab), a field, and words the reader has selected. A picture or a whole
 * card wrapped in a link still opens the post menu.
 */
function keepBrowserMenu(target: Element, root: Element) {
  const link = target.closest('a[href]');
  if (link && root.contains(link) && !link.querySelector('img, video, picture, canvas')) return true;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return true;
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  if (selection && !selection.isCollapsed && selection.toString().trim() && selection.anchorNode && root.contains(selection.anchorNode)) return true;
  return false;
}

/**
 * Surfaces inside a post with a menu of their own: comments, live chat,
 * another menu, the own-profile hold-to-pick-a-background on text posts and
 * articles, a player's subtitle menu.
 */
const OWN_MENU = '[data-comment-id], [data-msg-menu], [data-chat-message], [data-post-menu-skip]';

function shouldOpen(event: ReactMouseEvent, touch: boolean): boolean {
  if (event.defaultPrevented) return false;
  const root = event.currentTarget as Element;
  const target = event.target as Element | null;
  // React bubbles events out of portals (a card's comments drawer, its
  // options sheet). Those are not right-clicks on the post.
  if (!target || !root.contains(target)) return false;
  const pointerType = (event.nativeEvent as PointerEvent).pointerType;
  if (!touch && pointerType === 'touch') return false;
  if (target.closest(OWN_MENU)) return false;
  if (root.closest('[data-pbg-hold]') && target.closest('[data-pbg-text], [data-tile="article"]')) return false;
  if (keepBrowserMenu(target, root)) return false;
  return true;
}

/**
 * The right-click handler for a card. `build` runs on each right-click, so
 * the menu always gets the card's current state. Phones keep their own hold
 * gestures on cards (the reaction tray), so a touch hold is left alone.
 */
export function usePostMenuContext(build: () => PostMenuTarget | null) {
  const ref = useRef(build);
  ref.current = build;
  return useCallback((event: ReactMouseEvent) => {
    if (!shouldOpen(event, false)) return;
    const target = ref.current();
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    openPostMenu({ x: event.clientX, y: event.clientY }, target);
  }, []);
}

// ── Grid tiles: right-click, and a hold on a touch screen ───────────────────

const HOLD_MS = 450;
const SLOP_PX = 10;
const hold: { timer?: ReturnType<typeof setTimeout>; x: number; y: number; id: number; fired: number } = { x: 0, y: 0, id: -1, fired: 0 };
const cancelHold = () => { clearTimeout(hold.timer); hold.timer = undefined; hold.id = -1; };

/**
 * Handlers for a tile in a grid, built inside a map so not a hook. A mouse
 * right-click opens the menu; on a touch screen so does a hold, and the tap
 * that ends the hold does not also open the post.
 *
 * `touch` is off for tiles that already use a hold for something else (the
 * owner's own tiles: background picker, drag to reorder).
 */
export function postTileMenuProps(build: () => PostMenuTarget | null, { touch = true }: { touch?: boolean } = {}) {
  const open = (point: { x: number; y: number }) => {
    const target = build();
    if (!target) return false;
    openPostMenu(point, target);
    return true;
  };
  return {
    onContextMenu: (event: ReactMouseEvent) => {
      if (Date.now() - hold.fired < 1500) { event.preventDefault(); return; }
      if (!shouldOpen(event, touch)) return;
      if (!open({ x: event.clientX, y: event.clientY })) return;
      event.preventDefault();
      event.stopPropagation();
      cancelHold();
    },
    ...(touch ? {
      onPointerDown: (event: ReactPointerEvent) => {
        cancelHold();
        if (event.pointerType !== 'touch' || !event.isPrimary) return;
        const point = { x: event.clientX, y: event.clientY };
        hold.x = point.x; hold.y = point.y; hold.id = event.pointerId;
        hold.timer = setTimeout(() => {
          hold.timer = undefined;
          if (open(point)) {
            hold.fired = Date.now();
            try { navigator.vibrate?.(8); } catch { /* not on iOS */ }
          }
        }, HOLD_MS);
      },
      onPointerMove: (event: ReactPointerEvent) => {
        if (hold.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > SLOP_PX) cancelHold();
      },
      onPointerUp: cancelHold,
      onPointerCancel: cancelHold,
      onClickCapture: (event: ReactMouseEvent) => {
        if (Date.now() - hold.fired > 800) return;
        hold.fired = 0;
        event.preventDefault();
        event.stopPropagation();
      },
      // index.css turns off iOS's own long-press picture menu on these.
      'data-post-tile-hold': '',
    } : {}),
  };
}
