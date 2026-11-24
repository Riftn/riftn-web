import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Play from '@/components/ui/cut-icons/play';
import Pause from '@/components/ui/cut-icons/pause';
import { cn } from '@/lib/utils';
import { formatBehind, isBehindLive, type TimeshiftSnap } from '@/lib/live/timeshift';

/**
 * What the live player hands its controls: where the viewer is, and the
 * three things they can do about it. Stable for the card's life, so a
 * control polling it never re-renders the card around a playing video.
 */
export interface LiveTimeshift {
  snapshot: () => TimeshiftSnap | null;
  /** 0 (oldest kept) to 1 (live). */
  seek: (ratio: number) => void;
  goLive: () => void;
  togglePlay: () => void;
}

/** Re-reads the player twice a second; null while there is no live to show. */
export function useTimeshiftSnap(timeshift: LiveTimeshift | undefined): TimeshiftSnap | null {
  const [snap, setSnap] = useState<TimeshiftSnap | null>(() => timeshift?.snapshot() ?? null);
  useEffect(() => {
    if (!timeshift) {
      setSnap(null);
      return;
    }
    const read = () => {
      const next = timeshift.snapshot();
      setSnap((prev) => {
        if (!next || !prev) return next;
        // Only a change the viewer can see: a whole second, a pixel of the bar, play/pause.
        if (
          prev.paused === next.paused &&
          Math.round(prev.behind) === Math.round(next.behind) &&
          Math.abs(prev.ratio - next.ratio) < 0.002 &&
          Math.round(prev.windowSec) === Math.round(next.windowSec)
        ) return prev;
        return next;
      });
    };
    read();
    const id = window.setInterval(read, 500);
    return () => window.clearInterval(id);
  }, [timeshift]);
  return snap;
}

/** Drag along a track and hand back 0..1 on release. */
function useScrub(onSeek: (ratio: number) => void) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const ratioAt = useCallback((clientX: number) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return 1;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  }, []);
  const dragging = preview !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setPreview(ratioAt(e.clientX));
    const up = (e: PointerEvent) => {
      onSeek(ratioAt(e.clientX));
      setPreview(null);
    };
    const cancel = () => setPreview(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dragging, onSeek, ratioAt]);
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPreview(ratioAt(e.clientX));
  };
  return { trackRef, preview, onPointerDown };
}

function sliderKeys(snap: TimeshiftSnap, timeshift: LiveTimeshift) {
  return (e: React.KeyboardEvent) => {
    // Ten seconds a press, the way a video player steps.
    const step = snap.windowSec > 0 ? 10 / snap.windowSec : 0.05;
    const next = e.key === 'End' ? 1 : e.key === 'Home' ? 0
      : ['ArrowRight', 'ArrowUp'].includes(e.key) ? snap.ratio + step
      : ['ArrowLeft', 'ArrowDown'].includes(e.key) ? snap.ratio - step
      : null;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (next >= 1) timeshift.goLive();
    else timeshift.seek(Math.max(0, next));
  };
}

/**
 * The LIVE tag. Red at the live edge. Behind it (paused, rewound, or a slow
 * connection) it goes white and says how far back; a tap jumps to live.
 */
export function LiveTag({ snap, onGoLive, className }: { snap: TimeshiftSnap | null; onGoLive?: () => void; className?: string }) {
  const { t } = useTranslation();
  const behind = isBehindLive(snap);
  const label = t('stages.live', 'LIVE');
  if (!behind || !onGoLive) {
    return (
      <span data-live-badge className={cn('rounded-[5px] bg-red-500 px-1.5 py-px text-[9.5px] font-black tracking-wider text-white transition-colors duration-300', className)}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-live-badge
      data-live-behind
      data-on-media
      data-keep-white
      onClick={(e) => { e.stopPropagation(); onGoLive(); }}
      aria-label={t('liveTimeline.backToLive', 'Back to live')}
      title={t('liveTimeline.backToLive', 'Back to live')}
      className={cn(
        'flex items-center gap-1 rounded-[5px] bg-white px-1.5 py-px text-[9.5px] font-black tracking-wider text-black transition-colors duration-300 [text-shadow:none]',
        className
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-red-500" />
      {label}
      <span className="font-bold tabular-nums text-black/60">{formatBehind(snap!.behind)}</span>
    </button>
  );
}

/** Play / pause, sized for the pill row over a full-screen live. */
export function LivePlayPause({ snap, onToggle, className }: { snap: TimeshiftSnap | null; onToggle: () => void; className?: string }) {
  const { t } = useTranslation();
  const paused = !!snap?.paused;
  return (
    <button
      type="button"
      data-live-play-pause
      data-on-media
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={paused ? t('audioPost.play', 'Play') : t('audioPost.pause', 'Pause')}
      className={cn('flex items-center justify-center text-white', className)}
    >
      {paused ? <Play className="h-3.5 w-3.5 fill-white" /> : <Pause className="h-3.5 w-3.5 fill-white" />}
    </button>
  );
}

/**
 * Full-screen phone live: the hairline along the foot of the picture, the
 * same line the shorts viewer draws. Drag left to go back up to three
 * minutes; the red end is live.
 */
export function LiveTimelineLine({ timeshift, snap, hidden }: { timeshift: LiveTimeshift; snap: TimeshiftSnap | null; hidden?: boolean }) {
  const { t } = useTranslation();
  const onSeek = useCallback((ratio: number) => (ratio >= 0.995 ? timeshift.goLive() : timeshift.seek(ratio)), [timeshift]);
  const { trackRef, preview, onPointerDown } = useScrub(onSeek);
  if (!snap) return null;
  const ratio = preview ?? snap.ratio;
  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      data-live-timeline
      data-no-navigate
      aria-label={t('copy.67ae3405bcd4', 'Seek')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuetext={isBehindLive(snap) ? formatBehind(snap.behind) : t('stages.live', 'LIVE')}
      onKeyDown={sliderKeys(snap, timeshift)}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        // Short hit area: the chat box sits just above it.
        'absolute inset-x-0 bottom-0 z-30 flex h-3 cursor-pointer touch-none select-none items-end transition-opacity duration-300',
        hidden && 'invisible pointer-events-none opacity-0'
      )}
    >
      <div className={cn('relative w-full transition-[height] duration-150', preview !== null ? 'h-1' : 'h-0.5')}>
        <div className="absolute inset-0 bg-white/20" />
        <div className="absolute bottom-0 left-0 top-0 bg-white/80" style={{ width: `${ratio * 100}%` }} />
        <div aria-hidden className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-red-500" />
        {preview !== null ? (
          <div aria-hidden className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${ratio * 100}%` }} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The card's control bar on a wider screen: play/pause, the LIVE tag and a
 * timeline, the way a recorded video's bar reads, with live at the right end.
 */
export function LiveTimelineBar({ timeshift, className }: { timeshift: LiveTimeshift; className?: string }) {
  const { t } = useTranslation();
  const snap = useTimeshiftSnap(timeshift);
  const onSeek = useCallback((ratio: number) => (ratio >= 0.995 ? timeshift.goLive() : timeshift.seek(ratio)), [timeshift]);
  const { trackRef, preview, onPointerDown } = useScrub(onSeek);
  if (!snap) {
    return <LiveTag snap={null} className={className} />;
  }
  const ratio = preview ?? snap.ratio;
  const previewBehind = preview !== null ? (1 - preview) * snap.windowSec : null;
  return (
    <div data-live-timeline-bar className={cn('flex min-w-0 flex-1 items-center gap-2', className)} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        data-live-play-pause
        data-on-media
        onClick={() => timeshift.togglePlay()}
        aria-label={snap.paused ? t('audioPost.play', 'Play') : t('audioPost.pause', 'Pause')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
      >
        {snap.paused ? <Play className="h-4 w-4 fill-white" /> : <Pause className="h-4 w-4 fill-white" />}
      </button>
      <LiveTag snap={snap} onGoLive={timeshift.goLive} className="shrink-0 py-0.5 text-xs" />
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        data-live-timeline
        aria-label={t('copy.67ae3405bcd4', 'Seek')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuetext={isBehindLive(snap) ? formatBehind(snap.behind) : t('stages.live', 'LIVE')}
        onKeyDown={sliderKeys(snap, timeshift)}
        onPointerDown={onPointerDown}
        className="group relative flex h-6 min-w-[64px] flex-1 cursor-pointer touch-none select-none items-center"
      >
        <div className="relative h-1 w-full rounded-full bg-white/20 transition-[height] duration-150 group-hover:h-1.5">
          <div className="absolute bottom-0 left-0 top-0 rounded-full bg-white/85" style={{ width: `${ratio * 100}%` }} />
          <div aria-hidden className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-red-500" />
          <div
            aria-hidden
            className={cn(
              'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-opacity duration-150',
              preview !== null || isBehindLive(snap) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
            style={{ left: `${ratio * 100}%` }}
          />
        </div>
        {previewBehind !== null ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
            style={{ left: `${ratio * 100}%` }}
          >
            {previewBehind < 1 ? t('stages.live', 'LIVE') : formatBehind(previewBehind)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
