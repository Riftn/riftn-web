/**
 * Live Studio's sections, one column with a heading per group, and the tabs in
 * the page's top bar that jump between them and follow the scroll.
 */
import { useEffect, useRef, type ReactNode } from 'react';

export const STUDIO_GROUPS = ['stream', 'overlay', 'viewers', 'chat', 'replays'] as const;
export type StudioGroupId = (typeof STUDIO_GROUPS)[number];

const groupEl = (id: StudioGroupId) => document.getElementById(`studio-${id}`);

/** Bottom edge of the page's top bar (desktop island or phone pill). */
function barBottom() {
  const bar = document.querySelector('[data-kit-island-outer] > [data-page-bento], [data-kit-pill-outer] > [data-kit-pill]');
  return bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
}

// While a tap's smooth scroll runs, the scroll would walk the tab through every
// group on the way; the tapped tab holds until the scroll lands (scrollend, or
// a time limit where scrollend is missing).
let holdUntil = 0;

export function jumpToStudioGroup(id: StudioGroupId) {
  const el = groupEl(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  holdUntil = Date.now() + (reduce ? 150 : 1500);
  const previous = el.style.scrollMarginTop;
  el.style.scrollMarginTop = `${Math.round(barBottom() + 12)}px`;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.style.scrollMarginTop = previous;
}

/** Tells the page which group sits under the top bar as the creator scrolls. */
export function useStudioScrollSpy(onGroup: (id: StudioGroupId) => void) {
  const last = useRef<StudioGroupId | null>(null);
  const cb = useRef(onGroup);
  cb.current = onGroup;
  useEffect(() => {
    let frame = 0;
    const read = (scroller?: EventTarget | null) => {
      frame = 0;
      if (Date.now() < holdUntil) return;
      const line = barBottom() + 48;
      let current: StudioGroupId = STUDIO_GROUPS[0];
      for (const id of STUDIO_GROUPS) {
        const el = groupEl(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // At the very bottom the last group may be too short to reach the line.
      const box = scroller instanceof Element ? scroller : document.scrollingElement;
      if (box && box.scrollHeight > box.clientHeight && box.scrollTop + box.clientHeight >= box.scrollHeight - 4) {
        current = STUDIO_GROUPS[STUDIO_GROUPS.length - 1];
      }
      if (current !== last.current) {
        last.current = current;
        cb.current(current);
      }
    };
    const onScroll = (e: Event) => {
      if (!frame) frame = requestAnimationFrame(() => read(e.target));
    };
    // A jump has landed: the tapped tab stays until the creator scrolls again.
    const onScrollEnd = () => {
      if (Date.now() < holdUntil) holdUntil = 0;
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('scrollend', onScrollEnd, { capture: true, passive: true });
    read();
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('scrollend', onScrollEnd, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}

export function StudioGroup({
  id,
  title,
  hint,
  children,
}: {
  id: StudioGroupId;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section id={`studio-${id}`} data-studio-group={id} aria-labelledby={`studio-${id}-title`} className="space-y-3">
      {/* Lines up with the boxes' edges on boxed themes, and with the section
          titles on System, where sections draw no box. */}
      <header data-studio-group-head className="px-1 pt-2 lg:px-0 max-lg:[html[data-theme^='system']_&]:px-4">
        <h2 id={`studio-${id}-title`} className="text-[20px] font-bold leading-tight text-white">
          {title}
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-zinc-400">{hint}</p>
      </header>
      {children}
    </section>
  );
}
