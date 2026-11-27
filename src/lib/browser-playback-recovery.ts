import { createPlaybackRecovery, playbackSourceIdentity, type PlaybackPhase } from './playback-recovery';
import { reloadVideoSource, videoSourceOf } from './hls-vod';

const recoveries = new WeakMap<object, ReturnType<typeof createPlaybackRecovery>>();
export const recoveryForVideo = (video: object) => recoveries.get(video);

export function rewindEndedVideo(video: Partial<Pick<HTMLVideoElement, 'ended' | 'currentTime'>>): void {
  if (video.ended) video.currentTime = 0;
}

export function attachPlaybackRecovery(video: HTMLVideoElement, options: {
  allowed: () => boolean;
  changed: (phase: PlaybackPhase) => void;
  muteForAutoplay?: () => boolean;
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
        if (!reload && !video.error) rewindEndedVideo(video);
        try {
          await video.play();
        } catch (error) {
          if ((error as DOMException)?.name !== 'NotAllowedError' || video.muted || !allowed() || !options.muteForAutoplay?.()) throw error;
          video.muted = true;
          await video.play();
        }
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
  // Loaded on first play so it stays off the boot path.
  let frameWatch: (() => void) | null = null;
  let detached = false;
  void import('./frozen-picture').then(({ watchFrozenPicture }) => {
    if (!detached) frameWatch = watchFrozenPicture(video, options.component, options.postId);
  }).catch(() => {});
  const stopFrameWatch = () => { detached = true; frameWatch?.(); };
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

