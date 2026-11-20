import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

// Things that own their own double-click (or a click we must not hijack).
const SKIP = 'a,button,input,textarea,select,label,video,audio,img,canvas,iframe,[role="button"],[role="link"],[contenteditable=""],[contenteditable="true"],[data-no-dblclick-reply]';

/**
 * Desktop: double-click a chat line to reply to it, the mouse twin of the
 * phone's swipe-to-reply. Skips links, media and buttons, and touch screens
 * (a double tap there is zoom). Clears the word the double-click selected.
 */
export function dblClickReply(e: ReactMouseEvent, reply: (() => void) | undefined | false) {
  if (!reply || e.button !== 0 || e.defaultPrevented) return;
  if (typeof window !== 'undefined' && !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
  const target = e.target as Element | null;
  if (!target || target.closest?.(SKIP)) return;
  e.preventDefault();
  try { window.getSelection()?.removeAllRanges(); } catch { /* no selection api */ }
  reply();
}

let lastTap: { key: string; t: number; x: number; y: number } | null = null;

/**
 * Touch screens: double tap a chat line to act on it (the DM heart), the
 * phone twin of the desktop double-click. Same skip list, so links, media and
 * buttons keep their own taps. A scroll ends in pointercancel, never here.
 */
export function touchDoubleTap(e: ReactPointerEvent, key: string, act: (() => void) | undefined | false) {
  if (!act || e.pointerType !== 'touch') return;
  const target = e.target as Element | null;
  if (!target || target.closest?.(SKIP)) { lastTap = null; return; }
  const now = Date.now();
  const prev = lastTap;
  if (prev && prev.key === key && now - prev.t < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
    lastTap = null;
    act();
    return;
  }
  lastTap = { key, t: now, x: e.clientX, y: e.clientY };
}
