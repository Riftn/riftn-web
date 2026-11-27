/**
 * MasonrySegment
 * ==============
 * Measured masonry for the collapsed-mode home feed. Items are packed
 * shortest-column-first using their real rendered heights (ResizeObserver),
 * which keeps column bottoms as even as the content allows. When a
 * full-width carousel follows the segment (padEnd), any residual gap is
 * covered by ad slots sized to the exact hole: adjacent short columns with
 * similar bottoms share a single wide ad spanning them, and slivers too
 * small to hold an ad are left untouched.
 *
 * Row alignment: cards that start level (the opening row, and any later run
 * that happens to line up) end level too. A card that is taller only because
 * its caption wrapped gives the difference back from its video frame, which
 * crops a little shorter, so the row reads as one even band instead of a
 * ragged edge. Only video frames trim, and never by more than a quarter of
 * their height; anything else keeps its natural size.
 */

import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AdSlotCard from '../cards/AdSlotCard';
import { InMasonryColumnContext } from './masonry-context';

// Smallest hole worth filling with an ad (px)
const MIN_AD_PX = 140;
// Ads shorter than this render the compact ad layout
const COMPACT_AD_PX = 240;
// Adjacent column bottoms within this range merge into one spanning ad
const MERGE_TOL_PX = 48;
// Cards whose tops sit within this distance count as one row
const ROW_TOL_PX = 32;
// A video frame gives up at most this share of its height, and this many px
const MAX_TRIM_SHARE = 0.25;
const MAX_TRIM_PX = 180;

const FRAME_SELECTOR = '[data-feed-video-frame]';

interface ItemSize {
  /** Card height at its natural (untrimmed) size */
  h: number;
  /** Natural content-box height of its video frame; 0 when it has none */
  frame: number;
  /** Padding + border of the frame when it is content-box sized */
  frameExtra: number;
}

/**
 * Reads a card at its natural size. A card that is currently trimmed has the
 * trim lifted for the read and put straight back, inside the same task, so
 * nothing paints in between and the observer sees no net change.
 */
function measureItem(node: HTMLElement, observedHeight?: number): ItemSize {
  const trimmed = node.hasAttribute('data-masonry-trim');
  if (trimmed) node.removeAttribute('data-masonry-trim');
  const h = trimmed || observedHeight === undefined ? node.offsetHeight : observedHeight;
  const frameEl = node.querySelector<HTMLElement>(FRAME_SELECTOR);
  let frame = 0;
  let frameExtra = 0;
  if (frameEl) {
    const total = frameEl.offsetHeight;
    const cs = getComputedStyle(frameEl);
    if (cs.boxSizing === 'content-box') {
      frameExtra = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
        + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    }
    frame = Math.max(0, total - frameExtra);
  }
  if (trimmed) node.setAttribute('data-masonry-trim', '');
  return { h: Math.round(h), frame: Math.round(frame), frameExtra };
}

interface MasonrySegmentProps {
  items: ReactNode[];
  /** Height estimate (px) per item, used until the real height is measured */
  estimates: number[];
  colCount: number;
  gap?: number;
  padEnd?: boolean;
  beforeShorts?: boolean;
  afterShorts?: boolean;
}

export const MasonrySegment = ({
  items,
  estimates,
  colCount,
  gap = 12,
  padEnd = false,
  beforeShorts = false,
  afterShorts = false,
}: MasonrySegmentProps) => {
  const columns = Math.min(colCount, Math.max(1, items.length));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [width, setWidth] = useState(0);
  const [measured, setMeasured] = useState<Record<number, ItemSize>>({});

  // Measure container width and item heights; re-measure on any resize
  // (images loading, content-visibility swaps, viewport changes).
  //
  // Only the initial pass touches offsetHeight/clientWidth (one synchronous
  // layout at mount). After that, heights come from the ResizeObserver
  // entries themselves — the browser hands us post-layout sizes, so a burst
  // of image loads no longer forces a reflow per callback by re-reading
  // every item (DebugBear 7/14: 6.6s of forced reflows attributed here).
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const indexOf = new Map<Element, number>();
    itemRefs.current.forEach((node, i) => node && indexOf.set(node, i));

    const mergeHeights = (pairs: Array<[number, ItemSize]>) => {
      if (pairs.length === 0) return;
      setMeasured((prev) => {
        let changed = false;
        const next: Record<number, ItemSize> = { ...prev };
        for (const [i, size] of pairs) {
          const old = prev[i];
          if (size.h > 0 && (!old || Math.abs(old.h - size.h) > 1 || Math.abs(old.frame - size.frame) > 1)) {
            next[i] = size;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    // Initial pass: single synchronous measure at mount.
    const cw = el.clientWidth;
    setWidth((w) => (Math.abs(cw - w) > 1 ? cw : w));
    const initial: Array<[number, ItemSize]> = [];
    itemRefs.current.forEach((node, i) => {
      if (node) initial.push([i, measureItem(node)]);
    });
    mergeHeights(initial);

    const ro = new ResizeObserver((entries) => {
      const pairs: Array<[number, ItemSize]> = [];
      const trimmedNodes: Array<[number, HTMLElement]> = [];
      for (const entry of entries) {
        if (entry.target === el) {
          // Container has no padding/border, so contentRect.width == clientWidth.
          const w = entry.contentRect.width;
          setWidth((prev) => (Math.abs(w - prev) > 1 ? w : prev));
          continue;
        }
        const i = indexOf.get(entry.target);
        if (i === undefined) continue;
        // Item wrappers are unstyled divs (no padding/border), so border-box
        // and content-box heights coincide; borderBoxSize matches the old
        // offsetHeight semantics where supported.
        const node = entry.target as HTMLElement;
        // Trimmed cards are read last: lifting their trim dirties layout, and
        // every other read here should still come from the clean pass.
        if (node.hasAttribute('data-masonry-trim')) { trimmedNodes.push([i, node]); continue; }
        const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        pairs.push([i, measureItem(node, h)]);
      }
      for (const [i, node] of trimmedNodes) pairs.push([i, measureItem(node)]);
      mergeHeights(pairs);
    });
    ro.observe(el);
    itemRefs.current.forEach((node) => node && ro.observe(node));
    return () => ro.disconnect();
  }, [items.length, colCount]);

  const layout = useMemo(() => {
    const colW = width > 0 ? (width - gap * (columns - 1)) / columns : 0;
    const natural = items.map((_, i) => measured[i]?.h ?? estimates[i] ?? 320);

    // Pass 1: pack shortest-column-first at natural heights.
    const packH = new Array(columns).fill(0);
    const col: number[] = [];
    items.forEach((_, i) => {
      let c = 0;
      for (let k = 1; k < columns; k++) if (packH[k] < packH[c]) c = k;
      col.push(c);
      packH[c] += natural[i] + gap;
    });

    // Rows: cards in different columns whose tops are level end level. The
    // common bottom is the lowest one every card in the row can reach. Rows
    // settle top-down, and each one is found on the tops left by the trims
    // above it, so a row that only lines up once the one above is evened out
    // is caught too.
    const trim = new Array(items.length).fill(0);
    if (columns > 1) {
      const topOf = (k: number) => {
        let y = 0;
        for (let m = 0; m < k; m++) if (col[m] === col[k]) y += natural[m] - trim[m] + gap;
        return y;
      };
      const used = new Array(items.length).fill(false);
      for (let i = 0; i < items.length; i++) {
        if (used[i] || !measured[i]) continue;
        const ti = topOf(i);
        const row = [i];
        const tops = new Map([[i, ti]]);
        const cols = new Set([col[i]]);
        for (let j = i + 1; j < items.length; j++) {
          if (used[j] || !measured[j] || cols.has(col[j])) continue;
          const tj = topOf(j);
          if (Math.abs(tj - ti) > ROW_TOL_PX) continue;
          row.push(j);
          tops.set(j, tj);
          cols.add(col[j]);
        }
        if (row.length < 2) continue;
        row.forEach((k) => { used[k] = true; });
        const bottom = (k: number) => tops.get(k)! + natural[k];
        const maxTrim = (k: number) => Math.min(MAX_TRIM_PX, Math.floor(measured[k].frame * MAX_TRIM_SHARE));
        // The shortest card sets the line, unless a taller one cannot crop
        // that far; then the line drops to the lowest it can reach.
        const shortest = Math.min(...row.map(bottom));
        const target = Math.max(shortest, ...row.map((k) => bottom(k) - maxTrim(k)));
        for (const k of row) trim[k] = Math.max(0, Math.round(bottom(k) - target));
      }
    }

    // Pass 2: same columns and order, trimmed heights.
    const colH = new Array(columns).fill(0);
    const pos = items.map((_, i) => {
      const c = col[i];
      const p = { x: c * (colW + gap), y: colH[c] };
      colH[c] += natural[i] - trim[i] + gap;
      return p;
    });

    // Column bottoms without the trailing gap
    const bottoms = colH.map((h) => (h > 0 ? h - gap : 0));
    const maxH = Math.max(0, ...bottoms);

    // Fallback ads: cover residual holes before the next full-width insert.
    const ads: { x: number; y: number; w: number; h: number }[] = [];
    if (padEnd && width > 0) {
      let c = 0;
      while (c < columns) {
        if (maxH - bottoms[c] < MIN_AD_PX) {
          c++;
          continue;
        }
        // Extend the run over adjacent short columns with similar bottoms so
        // they share one wide ad instead of stacking boxes side by side.
        let end = c;
        let runMax = bottoms[c];
        let runMin = bottoms[c];
        while (end + 1 < columns && maxH - bottoms[end + 1] >= MIN_AD_PX) {
          const nMax = Math.max(runMax, bottoms[end + 1]);
          const nMin = Math.min(runMin, bottoms[end + 1]);
          if (nMax - nMin > MERGE_TOL_PX) break;
          runMax = nMax;
          runMin = nMin;
          end++;
        }
        const top = runMax > 0 ? runMax + gap : 0;
        const h = maxH - top;
        if (h >= MIN_AD_PX - gap) {
          ads.push({
            x: c * (colW + gap),
            y: top,
            w: colW * (end - c + 1) + gap * (end - c),
            h,
          });
        }
        c = end + 1;
      }
    }

    return { colW, pos, height: maxH, ads, trim };
  }, [items, estimates, measured, width, columns, gap, padEnd]);

  return (
    <InMasonryColumnContext.Provider value={columns > 1}>
    <div
      ref={containerRef}
      className="relative"
      style={{ height: layout.height > 0 ? layout.height : undefined }}
    >
      {items.map((node, i) => (
        <div
          key={i}
          data-feed-before-shorts={beforeShorts && !layout.pos.some((p) => p.x === layout.pos[i].x && p.y > layout.pos[i].y) ? '' : undefined}
          data-feed-after-shorts={afterShorts && layout.pos[i].y === 0 ? '' : undefined}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          data-masonry-trim={layout.trim[i] > 0 ? '' : undefined}
          className="absolute top-0 left-0"
          style={{
            width: layout.colW > 0
              ? layout.colW
              : `calc((100% - ${gap * (columns - 1)}px) / ${columns})`,
            transform: `translate(${layout.pos[i].x}px, ${layout.pos[i].y}px)`,
            ...(layout.trim[i] > 0 && measured[i]
              ? { ['--masonry-frame-max' as string]: `${Math.max(0, measured[i].frame - layout.trim[i])}px` }
              : {}),
          }}
        >
          {node}
        </div>
      ))}
      {layout.ads.map((ad, i) => (
        <div
          key={`ad-${i}`}
          className="absolute top-0 left-0"
          style={{
            width: ad.w,
            height: ad.h,
            transform: `translate(${ad.x}px, ${ad.y}px)`,
          }}
        >
          <AdSlotCard variant="fill" compact={ad.h < COMPACT_AD_PX} />
        </div>
      ))}
    </div>
    </InMasonryColumnContext.Provider>
  );
};

export default MasonrySegment;
