/**
 * Frozen live picture detection
 * =============================
 * A live player can stop moving without a single event saying so. iOS
 * Safari's native HLS sits on `waiting` for good after a missed playlist
 * refresh, and a WebRTC session can stay "connected" while no frame arrives.
 * The viewer sees a still picture and nothing ever recovers it.
 *
 * This watches the element instead of its events: while the video is meant to
 * be running (not paused, with a visible playback surface) it checks every couple of seconds
 * whether the media made progress. When it has not for
 * `stallMs`, `onStall` gets called with how many stalls in a row this is, so
 * the caller can escalate (jump to live edge first, reload after).
 */
import { isVideoInPictureInPicture } from '@/lib/picture-in-picture';

export interface LiveStallWatchOptions {
  /** How long without progress counts as frozen. */
  stallMs: number;
  /** Called on each freeze; `count` is 1 for the first in a row. */
  onStall: (count: number) => void;
  /** Extra gate, e.g. "playback was requested". Defaults to always. */
  shouldWatch?: () => boolean;
  /** WebRTC can keep its audio clock moving while the picture is frozen. */
  preferVideoFrames?: () => boolean;
  /** Check a visible system PiP window even while its tab is hidden. */
  watchInPictureInPicture?: boolean;
}

const CHECK_EVERY_MS = 2000;

function presentedFrames(video: HTMLVideoElement): number | null {
  try {
    const quality = video.getVideoPlaybackQuality?.();
    // Some browsers expose the method but do not count frames for WebRTC.
    if (!quality || quality.totalVideoFrames === 0) return null;
    return quality.totalVideoFrames - quality.droppedVideoFrames;
  } catch {
    return null;
  }
}

export function watchLiveProgress(
  video: HTMLVideoElement,
  { stallMs, onStall, shouldWatch, preferVideoFrames, watchInPictureInPicture = false }: LiveStallWatchOptions,
): () => void {
  let lastTime = video.currentTime;
  let lastFrames = presentedFrames(video);
  let stillFor = 0;
  let stalls = 0;

  const rebase = () => {
    lastTime = video.currentTime;
    lastFrames = presentedFrames(video);
    stillFor = 0;
  };

  const tick = () => {
    const watching =
      !video.paused &&
      typeof document !== 'undefined' &&
      (document.visibilityState === 'visible' || (watchInPictureInPicture && isVideoInPictureInPicture(video))) &&
      (shouldWatch?.() ?? true);
    if (!watching) {
      rebase();
      return;
    }
    const time = video.currentTime;
    const frames = presentedFrames(video);
    const framesMoved = frames !== lastFrames;
    const useFrames = preferVideoFrames?.() && frames != null && lastFrames != null;
    const moved = framesMoved || (!useFrames && time !== lastTime);
    lastTime = time;
    lastFrames = frames;
    if (moved) {
      stillFor = 0;
      stalls = 0;
      return;
    }
    stillFor += CHECK_EVERY_MS;
    if (stillFor >= stallMs) {
      stillFor = 0;
      stalls += 1;
      onStall(stalls);
    }
  };

  const id = setInterval(tick, CHECK_EVERY_MS);
  // Coming back to the page is a fresh start, not a stall that lasted the
  // whole time the tab was away.
  const onVisible = () => rebase();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Live edge of a native HLS element, a couple of seconds back so it can play. */
export function nativeLiveEdge(video: HTMLVideoElement): number | null {
  const ranges = video.seekable;
  if (!ranges || ranges.length === 0) return null;
  const end = ranges.end(ranges.length - 1);
  return Number.isFinite(end) && end > 0 ? Math.max(ranges.start(0), end - 2) : null;
}
