/**
 * Shared by every chat's scroll-down button.
 *
 * countLinesBelow: how many chat lines sit fully below the visible bottom of
 * the thread. `ids` runs oldest to newest; `getEl` finds a line on the page.
 * Lines are stacked in order, so this is a binary search over the list (a few
 * layout reads per frame, however long the chat is). Lines that are not on
 * the page (older history outside the rendered window) are skipped.
 */
export function countLinesBelow(
  container: HTMLElement,
  ids: readonly string[],
  getEl: (id: string) => Element | null | undefined,
): number {
  const els: Element[] = [];
  for (const id of ids) {
    const el = getEl(id);
    if (el) els.push(el);
  }
  if (!els.length) return 0;
  // A chat taller than the window (inside a scrolling page) folds at the window edge.
  const box = container.getBoundingClientRect();
  const fold = Math.min(box.bottom, typeof window !== 'undefined' ? window.innerHeight : box.bottom) - 4;
  const isBelow = (i: number) => els[i].getBoundingClientRect().top > fold;
  let lo = 0;
  let hi = els.length; // first index that is below the fold
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (isBelow(mid)) hi = mid;
    else lo = mid + 1;
  }
  return els.length - lo;
}

/**
 * Smooth trip to the newest line. From far up the thread a native smooth
 * scroll crawls through thousands of pixels of loading images and stutters,
 * so jump to just over a screen above the end first, then glide the rest.
 */
export function glideToBottom(container: HTMLElement): void {
  const end = container.scrollHeight - container.clientHeight;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { container.scrollTop = end; return; }
  const lead = Math.round(container.clientHeight * 1.25);
  if (end - container.scrollTop > lead) container.scrollTop = end - lead;
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}
