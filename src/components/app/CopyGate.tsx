import { useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';
import { takePendingCopy } from '@/i18n';

/** Longest a fresh page waits behind its skeleton for its text. */
export const COPY_HOLD_CAP_MS = 1500;
/** Longest a fresh page waits behind its skeleton for its first data (same as the app). */
export const SETTLE_HOLD_CAP_MS = 900;
/** The dissolve from skeleton to page (skeleton.css `skeleton-out` / `skeleton-in`). */
export const REVEAL_MS = 320;
/**
 * A placeholder fades in only after this long (skeleton.css
 * `[data-skeleton-appear]`). A page that is ready sooner goes straight from
 * nothing to the page: no grey flash, no dissolve.
 */
export const SKELETON_APPEAR_MS = 120;

/** Anything a page draws while its own first data is still on the way. */
const BUSY = '[data-skeleton], .theme-skeleton, [data-dehub-loader], .dehub-loader-mark, [data-page-loading]';

/** A loader the visitor would see on the first screen; one further down the page holds nothing. */
function loaderInView(root: HTMLElement | null): boolean {
  if (!root) return false;
  const bottom = window.innerHeight;
  for (const el of root.querySelectorAll(BUSY)) {
    const r = el.getBoundingClientRect();
    if ((r.width > 0 || r.height > 0) && r.top < bottom && r.bottom > 0) return true;
  }
  return false;
}

/**
 * The one wrapper every page placeholder is drawn in. It fades in after
 * SKELETON_APPEAR_MS counted from `since`, so a placeholder that takes over
 * from another one (Suspense fallback -> gate) carries on instead of starting
 * again.
 */
export function SkeletonAppear({ since, children }: { since: number; children: ReactNode }) {
  const [delay] = useState(() => Math.round(since + SKELETON_APPEAR_MS - performance.now()));
  return <div data-skeleton-appear style={{ '--appear-delay': `${delay}ms` } as CSSProperties}>{children}</div>;
}

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
export function CopyGate({ skeleton: Skeleton, children, skeletonShown, copyOnly }: {
  skeleton: ComponentType;
  children: ReactNode;
  /** Wait for the words only, and cut to the page with no dissolve. For home:
   *  its welcome panel is already painted from index.html and the feed draws
   *  its own placeholders, so covering the page again would blink both. */
  copyOnly?: boolean;
  /** Set by the route's Suspense fallback: when its placeholder mounted (0 = never). */
  skeletonShown?: MutableRefObject<number>;
}) {
  const [phase, setPhase] = useState<'idle' | 'hold' | 'reveal'>('idle');
  const checked = useRef(false);
  /** When the placeholder started counting towards showing. */
  const since = useRef(0);
  const content = useRef<HTMLDivElement | null>(null);
  const queries = useQueryClient();

  // Layout effect: runs after the page's first render asked for its packs and
  // before the browser paints it, so the stand-in text is never seen.
  useLayoutEffect(() => {
    if (checked.current) return;
    checked.current = true;
    const copy = takePendingCopy();
    const mountedAt = skeletonShown?.current || 0;
    since.current = mountedAt || performance.now();
    // Only a placeholder that has actually faded in is worth dissolving.
    const seen = () => !copyOnly && performance.now() >= since.current + SKELETON_APPEAR_MS;
    // Requests already out before this page mounted belong to something else.
    const earlier = new Set<Query>(queries.getQueryCache().findAll({ fetchStatus: 'fetching' }));
    // Its own loader on the first screen, or a first request of its own still out.
    const busy = () => !copyOnly && (loaderInView(content.current)
      || queries.isFetching({ predicate: (q) => q.state.data === undefined && !earlier.has(q) }) > 0);
    if (!copy && !busy()) {
      // Ready at once. After a skeleton that was seen, dissolve rather than cut.
      if (!mountedAt || !seen()) return;
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
      if (!seen()) { finish(); return; }
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
  }, [skeletonShown, queries, copyOnly]);

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
          {/* Home keeps its placeholder up at once, exactly as before (index.html painted it). */}
          {copyOnly ? <Skeleton /> : <SkeletonAppear since={since.current}><Skeleton /></SkeletonAppear>}
        </div>
      )}
    </div>
  );
}
