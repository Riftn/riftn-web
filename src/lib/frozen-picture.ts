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
  /** A nudge went out and no frame has painted since. */
  let nudgeUnanswered = false;
  let stopped = false;
  const onFrame = (_now: number, meta: { mediaTime: number }) => {
    if (stopped) return;
    lastMediaTime = meta.mediaTime;
    nudgeUnanswered = false;
    handle = v.requestVideoFrameCallback!(onFrame);
  };
  handle = v.requestVideoFrameCallback(onFrame);
  const reset = () => { lastMediaTime = -1; };
  // Browsers stop painting frames for a player that is off screen or covered
  // up (feed scrolled away, sound playing on in the background). That is not
  // a freeze, so only judge a player that is actually showing.
  let onScreen = typeof IntersectionObserver === 'undefined';
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    onScreen = !!entry && entry.isIntersecting && entry.intersectionRatio >= 0.5;
    reset();
  }, { threshold: [0, 0.5] });
  observer?.observe(video);
  const check = () => {
    if (!onScreen || video.paused || video.seeking || video.ended || video.readyState < 3) { if (!onScreen) reset(); return; }
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (typeof document !== 'undefined' && (document as Document & { pictureInPictureElement?: Element | null }).pictureInPictureElement === video) return;
    if (lastMediaTime < 0) { lastMediaTime = video.currentTime; return; }
    const behind = video.currentTime - lastMediaTime;
    if (behind < FROZEN_PICTURE_SECONDS) return;
    const now = Date.now();
    if (now - lastNudgeAt < 4000) return;
    lastNudgeAt = now;
    lastMediaTime = video.currentTime;
    // A seek in place repaints a decoder that fell behind. When even that
    // paints nothing, the element has lost its picture layer (iPhone Safari
    // can drop it when a playing video is moved between cards): put the
    // element back where it is, in the same task, so the browser builds the
    // layer again. Playback, position and buffer are untouched by the move.
    const rebuild = nudgeUnanswered && !!video.parentNode;
    if (rebuild) {
      try { video.parentNode!.insertBefore(video, video.nextSibling); } catch { /* detached meanwhile */ }
    }
    try { video.currentTime = video.currentTime; } catch { /* not seekable yet */ }
    nudgeUnanswered = true;
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    const browser = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua) ? 'safari' : /Firefox/.test(ua) ? 'firefox' : 'chromium';
    void import('./logger').then(({ logToBackend }) => logToBackend({
      level: 'info', component, message: rebuild ? 'frozen picture rebuilt' : 'frozen picture nudged',
      metadata: { postId, behind: Math.round(behind * 10) / 10, browser },
    }, true)).catch(() => {});
  };
  video.addEventListener('timeupdate', check);
  video.addEventListener('seeked', reset);
  video.addEventListener('emptied', reset);
  return () => {
    stopped = true;
    observer?.disconnect();
    v.cancelVideoFrameCallback?.(handle);
    video.removeEventListener('timeupdate', check);
    video.removeEventListener('seeked', reset);
    video.removeEventListener('emptied', reset);
  };
}
