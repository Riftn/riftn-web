/**
 * Is the person busy with the post that is playing in the Shorts viewer?
 *
 * The viewer moves on to the next post when a video ends. That is wrong while
 * someone is writing a comment or reading the thread beside the video: the
 * page turns under them and they lose their place (and the comments they
 * were reading belong to a different post now).
 *
 * Busy means any of:
 * - a text box in the viewer has focus (the comment box, a DM box in a sheet);
 * - a comment box in the viewer's panels still holds unsent text;
 * - the pointer rests on the comments (desktop, where hover is real);
 * - the comments were scrolled, wheeled, clicked or touched in the last few seconds.
 *
 * @module lib/shorts-engaged
 */

/** How long after the last scroll in the comments the reader counts as reading. */
export const SHORTS_READING_QUIET_MS = 8000;

/** The comments panels and an opened caption: the parts of the viewer people read. */
const READING_AREA = '[data-shorts-scrollable]';
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'email']);

/** A field someone types into, not a button, checkbox or range. */
export function isTypingField(el: Element | null | undefined): boolean {
  if (!el || typeof HTMLElement === 'undefined' || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return false;
}

/** A comment box inside the viewer's panels with text not sent yet. */
export function hasUnsentText(root: ParentNode): boolean {
  const fields = root.querySelectorAll<HTMLElement>(
    '[data-shorts-panel] textarea, [data-shorts-panel] [contenteditable="true"], [data-shorts-panel] [contenteditable=""]',
  );
  for (const el of Array.from(fields)) {
    const text = el instanceof HTMLTextAreaElement ? el.value : el.textContent;
    if (text && text.trim()) return true;
  }
  return false;
}

export interface ShortsEngagement {
  isEngaged: () => boolean;
  dispose: () => void;
}

/** Watches `root` (the viewer) for typing and reading. */
export function watchShortsEngagement(root: HTMLElement, now: () => number = Date.now): ShortsEngagement {
  let lastReadAt = -Infinity;
  const onActivity = (e: Event) => {
    const target = e.target as Element | null;
    if (target && typeof target.closest === 'function' && target.closest(READING_AREA)) lastReadAt = now();
  };
  // Scroll does not bubble, so listen in the capture phase.
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  const events = ['scroll', 'wheel', 'touchmove', 'pointerdown', 'keydown'] as const;
  events.forEach((type) => root.addEventListener(type, onActivity, opts));

  const canHover = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  return {
    isEngaged: () => {
      // Typing in the viewer, or in a sheet opened over it (they portal out).
      // Not a box elsewhere on the page that kept focus, like the search bar
      // a result was opened from.
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (isTypingField(active) && (root.contains(active) || active!.closest('[role="dialog"], [data-vaul-drawer]'))) return true;
      if (hasUnsentText(root)) return true;
      if (now() - lastReadAt < SHORTS_READING_QUIET_MS) return true;
      if (canHover) {
        try {
          if (root.querySelector('[data-shorts-scrollable]:hover')) return true;
        } catch { /* :hover unsupported in this engine */ }
      }
      return false;
    },
    dispose: () => events.forEach((type) => root.removeEventListener(type, onActivity, opts)),
  };
}
