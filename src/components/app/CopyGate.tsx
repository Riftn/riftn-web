import { useLayoutEffect, useRef, useState, type ComponentType, type MutableRefObject, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { takePendingCopy } from '@/i18n';

/** Longest a fresh page waits behind its skeleton for its text. */
export const COPY_HOLD_CAP_MS = 1500;
/** Longest a fresh page waits behind its skeleton for its first data. */
export const SETTLE_HOLD_CAP_MS = 1200;
/** The dissolve from skeleton to page (skeleton.css `skeleton-out` / `skeleton-in`). */
export const REVEAL_MS = 320;

/** Anything a page draws while its own first data is still on the way. */
const BUSY = '[data-skeleton], .theme-skeleton, [data-dehub-loader], .dehub-loader-mark, [data-page-loading]';

/**
 * Holds a freshly mounted page behind its skeleton until it is ready to be
 * seen, then dissolves the skeleton into it. Ready means two things:
 *
 *  - the copy it asked for has loaded, so it appears with its real words
 *    instead of stand-ins ("Bdm Title", "Hero Title") that reflow a second
 *    later;
 *  - its own first loading state is gone and no first request is still out,
 *    so the skeleton is followed by the page and not by a second, differently
 *    shaped placeholder, a spinner or a page with holes in it.
 *
 * The page still renders and fetches underneath, invisibly; only the first
 * mount is ever held, and never for longer than the caps. A page that is
 * ready on its first frame and had no skeleton showing is not touched at all.
 *
 * The wrapper div is always there, so letting go never remounts the page.
 */
export function CopyGate({ skeleton: Skeleton, children, skeletonShown }: {
  skeleton: ComponentType;
  children: ReactNode;
  /** Set by the route's Suspense fallback: the skeleton was already on screen. */
  skeletonShown?: MutableRefObject<boolean>;
}) {
  const [phase, setPhase] = useState<'idle' | 'hold' | 'reveal'>('idle');
  const checked = useRef(false);
  const content = useRef<HTMLDivElement | null>(null);
  const queries = useQueryClient();

  // Layout effect: runs after the page's first render asked for its packs and
  // before the browser paints it, so the stand-in text is never seen.
  useLayoutEffect(() => {
    if (checked.current) return;
    checked.current = true;
    const copy = takePendingCopy();
    // Its own loader on screen, or a first request still out.
    const busy = () => !!content.current?.querySelector(BUSY) || queries.isFetching({ predicate: (q) => q.state.data === undefined }) > 0;
    const wasShown = !!skeletonShown?.current;
    if (!copy && !busy()) {
      // Ready at once. After a skeleton, still dissolve rather than cut.
      if (!wasShown) return;
      setPhase('reveal');
      const done = window.setTimeout(() => setPhase('idle'), REVEAL_MS);
      return () => window.clearTimeout(done);
    }
    setPhase('hold');
    let alive = true;
    let copyDone = !copy;
    let timer = 0;
    let frame = 0;
    const started = performance.now();
    const finish = () => { if (alive) setPhase('idle'); };
    const release = () => {
      if (!alive) return;
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      setPhase('reveal');
      timer = window.setTimeout(finish, REVEAL_MS);
    };
    const check = () => {
      if (!alive) return;
      const waited = performance.now() - started;
      if (!copyDone) {
        if (waited >= COPY_HOLD_CAP_MS) release(); else frame = requestAnimationFrame(check);
        return;
      }
      if (!busy() || waited >= SETTLE_HOLD_CAP_MS) release();
      else frame = requestAnimationFrame(check);
    };
    // The words that land can render parts that ask for more words, so look
    // again one frame after each batch lands and only move on once nothing is
    // left waiting (or the cap passes).
    const settle = (pending: Promise<unknown>) => {
      void pending.finally(() => requestAnimationFrame(() => {
        if (!alive) return;
        const more = takePendingCopy();
        if (more) settle(more); else copyDone = true;
      }));
    };
    if (copy) settle(copy);
    frame = requestAnimationFrame(check);
    return () => { alive = false; window.clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [skeletonShown, queries]);

  const hold = phase === 'hold';
  const covered = phase !== 'idle';
  return (
    <div data-copy-gate={covered ? phase : undefined} style={covered ? { position: 'relative' } : undefined}>
      <div ref={content} data-skeleton-reveal={phase === 'reveal' ? 'in' : undefined}
        style={hold ? { visibility: 'hidden' } : undefined} aria-hidden={hold || undefined}>
        {children}
      </div>
      {covered && (
        <div data-skeleton-reveal={phase === 'reveal' ? 'out' : undefined}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' }}>
          <Skeleton />
        </div>
      )}
    </div>
  );
}
