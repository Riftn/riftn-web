import { createPlaybackRecovery, playbackSourceIdentity, type PlaybackPhase } from './playback-recovery';
import { reloadVideoSource, videoSourceOf } from './hls-vod';

const recoveries = new WeakMap<object, ReturnType<typeof createPlaybackRecovery>>();
export const recoveryForVideo = (video: object) => recoveries.get(video);

export function attachPlaybackRecovery(video: HTMLVideoElement, options: {
  allowed: () => boolean;
  changed: (phase: PlaybackPhase) => void;
  postId: string;
  component: string;
}) {
  let previousTime = video.currentTime;
  const recovery = createPlaybackRecovery({
    ...options,
    play: async (reload, allowed) => {
      const position = video.currentTime;
      const duration = video.duration;
      if (reload || video.error) {
        // Through hls-vod: load() would tear an HLS ladder's MediaSource away.
        reloadVideoSource(video);
        // currentTime can be set before metadata; the browser applies it once
        // the new resource is seekable. Live streams stay at their live edge.
        if (position > 0 && Number.isFinite(duration) && position < duration) video.currentTime = position;
      }
      if (allowed()) {
        await video.play();
        // A late browser play promise must honor pause/scroll-away, while an
        // old owner must never pause the new owner's adopted element.
        if (!allowed() && recoveries.get(video) === recovery) video.pause();
      }
    },
    pause: () => video.pause(),
    report: (event, detail) => {
      void import('./logger').then(({ logToBackend }) => logToBackend({
        level: event === 'failed' ? 'error' : 'info', component: options.component,
        message: `playback ${event}`,
        metadata: { ...detail, postId: options.postId, source: playbackSourceIdentity(videoSourceOf(video) || video.currentSrc || video.src), code: video.error?.code, readyState: video.readyState, networkState: video.networkState },
      }, true)).catch(() => {});
    },
  });
  recoveries.set(video, recovery);
  const play = () => recovery.watch();
  const pause = () => { if (!recovery.replacing && !video.error && recovery.wanted) recovery.stop(); };
  const waiting = () => recovery.waiting();
  const error = () => recovery.fail(`media-${video.error?.code ?? 0}`);
  const progress = () => {
    if (!video.paused && video.currentTime !== previousTime) recovery.progress();
    previousTime = video.currentTime;
  };
  const playing = () => recovery.progress();
  const stopFrameWatch = watchFrozenPicture(video, options.component, options.postId);
  const listeners = { play, pause, waiting, stalled: waiting, error, playing, timeupdate: progress, ended: pause };
  Object.entries(listeners).forEach(([name, listener]) => video.addEventListener(name, listener));
  if (!video.paused) { recovery.watch(); if (video.readyState >= 3) recovery.progress(); }
  return () => {
    stopFrameWatch();
    Object.entries(listeners).forEach(([name, listener]) => video.removeEventListener(name, listener));
    if (recoveries.get(video) === recovery) recoveries.delete(video);
    recovery.stop();
  };
}

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** Seconds of playback with no new picture before the frame is nudged. */
export const FROZEN_PICTURE_SECONDS = 1.5;

/**
 * Some browsers (mostly iPhone) keep the clock and sound running while the
 * picture stops on one frame. Time keeps moving, so the stall check above
 * never fires. Watch painted frames instead: when playback has moved on well
 * past the last painted frame, seek to where we already are, which makes the
 * decoder paint again. At most once every few seconds, and only while
 * playing and on screen.
 */
export function watchFrozenPicture(video: HTMLVideoElement, component: string, postId: string) {
  const v = video as FrameVideo;
  if (typeof v.requestVideoFrameCallback !== 'function') return () => {};
  let handle = 0;
  let lastMediaTime = -1;
  let lastNudgeAt = 0;
  let stopped = false;
  const onFrame = (_now: number, meta: { mediaTime: number }) => {
    if (stopped) return;
    lastMediaTime = meta.mediaTime;
    handle = v.requestVideoFrameCallback!(onFrame);
  };
  handle = v.requestVideoFrameCallback(onFrame);
  const reset = () => { lastMediaTime = -1; };
  const check = () => {
    if (video.paused || video.seeking || video.ended || video.readyState < 3) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (typeof document !== 'undefined' && (document as Document & { pictureInPictureElement?: Element | null }).pictureInPictureElement === video) return;
    if (lastMediaTime < 0) { lastMediaTime = video.currentTime; return; }
    const behind = video.currentTime - lastMediaTime;
    if (behind < FROZEN_PICTURE_SECONDS) return;
    const now = Date.now();
    if (now - lastNudgeAt < 4000) return;
    lastNudgeAt = now;
    lastMediaTime = video.currentTime;
    try { video.currentTime = video.currentTime; } catch { /* not seekable yet */ }
    void import('./logger').then(({ logToBackend }) => logToBackend({
      level: 'info', component, message: 'frozen picture nudged',
      metadata: { postId, behind: Math.round(behind * 10) / 10 },
    }, true)).catch(() => {});
  };
  video.addEventListener('timeupdate', check);
  video.addEventListener('seeked', reset);
  video.addEventListener('emptied', reset);
  return () => {
    stopped = true;
    v.cancelVideoFrameCallback?.(handle);
    video.removeEventListener('timeupdate', check);
    video.removeEventListener('seeked', reset);
    video.removeEventListener('emptied', reset);
  };
}
