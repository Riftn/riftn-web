import type { MouseEvent as ReactMouseEvent } from 'react';

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
