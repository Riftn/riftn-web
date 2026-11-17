import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/feed-utils';
import { storyboardOffset, type Storyboard } from '@/lib/storyboard';

type SheetStatus = 'loading' | 'loaded' | 'failed';

/**
 * Sheets this page has already asked for, by URL. Cards remount as the feed
 * scrolls and the Shorts viewer swaps slides; without this each remount began
 * at "not loaded" and the first scrub after it showed nothing, even with the
 * sheet sitting in the browser cache.
 */
const sheetStatus = new Map<string, SheetStatus>();
const sheetLoads = new Map<string, Promise<SheetStatus>>();

function loadSheet(url: string): Promise<SheetStatus> {
  const pending = sheetLoads.get(url);
  if (pending) return pending;
  sheetStatus.set(url, 'loading');
  const load = new Promise<SheetStatus>(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve('loaded');
    img.onerror = () => resolve('failed');
    img.src = url;
  }).then(result => {
    sheetStatus.set(url, result);
    // A failure may be a dropped connection: let a later scrub try again.
    if (result === 'failed') sheetLoads.delete(url);
    return result;
  });
  sheetLoads.set(url, load);
  return load;
}

interface StoryboardPreviewProps {
  storyboard?: Storyboard;
  /** Where the finger or pointer is along the timeline, 0–1. */
  fraction: number;
  duration: number;
  /** Shown only while scrubbing. */
  visible: boolean;
  /** Start fetching the sheet before the first scrub (the video is playing or its controls are up). */
  armed?: boolean;
}

/**
 * The frame under the finger while scrubbing, floated above the timeline.
 *
 * Mount it inside the element that spans the timeline's width; it positions
 * itself above that element's top edge and never takes pointer events, so the
 * scrub gesture underneath is untouched. Renders nothing for a post without a
 * public storyboard. While the sheet is still loading, or if it fails, only
 * the time chip shows.
 */
export function StoryboardPreview({ storyboard, fraction, duration, visible, armed = false }: StoryboardPreviewProps) {
  const url = storyboard?.url;
  const [status, setStatus] = useState<SheetStatus | undefined>(() => (url ? sheetStatus.get(url) : undefined));

  useEffect(() => {
    if (!url) return;
    const known = sheetStatus.get(url);
    setStatus(known);
    if (known === 'loaded' || (!armed && !visible)) return;
    let cancelled = false;
    loadSheet(url).then(next => { if (!cancelled) setStatus(next); });
    return () => { cancelled = true; };
  }, [url, armed, visible]);

  if (!storyboard || !visible || !(duration > 0)) return null;

  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const seconds = clamped * duration;
  const { x, y } = storyboardOffset(storyboard, seconds);
  // Until the sheet is in (a quick scrub on a slow phone connection), or if it
  // never arrives, the time alone still follows the finger.
  const showTile = status === 'loaded';
  const half = showTile ? storyboard.spriteWidth / 2 + 4 : 24;

  return (
    <div
      data-storyboard-preview
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full z-30 mb-3 flex -translate-x-1/2 flex-col items-center gap-1"
      style={{ left: `clamp(${half}px, ${clamped * 100}%, calc(100% - ${half}px))` }}
    >
      {showTile && <div
        className="overflow-hidden rounded-md border border-white/30 bg-black shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
        style={{
          width: storyboard.spriteWidth,
          height: storyboard.spriteHeight,
          backgroundImage: `url("${storyboard.url}")`,
          backgroundPosition: `-${x}px -${y}px`,
          backgroundRepeat: 'no-repeat',
        }}
      />}
      <span className="rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
        {formatDuration(Math.floor(seconds))}
      </span>
    </div>
  );
}
