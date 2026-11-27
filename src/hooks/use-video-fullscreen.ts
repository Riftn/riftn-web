import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { lockDocumentScroll } from '@/lib/body-scroll-lock';

export function canNativeFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled
    || typeof (HTMLVideoElement.prototype as any).webkitEnterFullscreen === 'function');
}
export interface VideoFullscreenOptions {
  allowSimulated?: boolean;
  /** Keep the fallback outside transformed or clipped feed ancestors. */
  escapeAncestors?: boolean;
  /**
   * Skip the system video player (`webkitEnterFullscreen`) and fullscreen the
   * container instead, falling back to the simulated overlay. The system player
   * owns every touch, so nothing on the page can react to a swipe inside it.
   */
  preferContainer?: boolean;
}
/** Move the existing player without replacing its media connection. */
export function liftFullscreenElement(element: HTMLElement): () => void {
  const parent = element.parentNode;
  if (!parent) return () => {};
  const placeholder = document.createElement('div');
  const releaseScroll = lockDocumentScroll('video-fullscreen');
  const previousFullscreen = element.getAttribute('data-media-fullscreen');
  placeholder.style.height = `${element.getBoundingClientRect().height}px`;
  placeholder.setAttribute('aria-hidden', 'true');
  parent.insertBefore(placeholder, element);
  // Keep delegated React controls under their root while escaping feed wrappers.
  const fullscreenHost = element.closest('#root') || document.body;
  fullscreenHost.appendChild(element);
  element.setAttribute('data-media-fullscreen', 'true');
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (placeholder.parentNode) placeholder.parentNode.insertBefore(element, placeholder);
    placeholder.remove();
    if (previousFullscreen === null) element.removeAttribute('data-media-fullscreen');
    else element.setAttribute('data-media-fullscreen', previousFullscreen);
    releaseScroll();
  };
}
export function useVideoFullscreen(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  { allowSimulated = true, escapeAncestors = false, preferContainer = false }: VideoFullscreenOptions = {},
) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const generation = useRef(0);
  const restore = useRef<(() => void) | null>(null);
  const simulated = useRef(false);
  const cancelPending = useCallback(() => {
    generation.current++;
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const restoreInline = useCallback(() => {
    restore.current?.(); restore.current = null; simulated.current = false;
  }, []);
  // Restore before React removes its children, including on route changes.
  useLayoutEffect(() => () => { cancelPending(); restoreInline(); }, [cancelPending, restoreInline]);
  // A gated or loading stream can mount its video after the first render, so
  // the element is re-read each render, but the listeners are only re-bound
  // when it actually changes: rebinding five listeners on every render of a
  // 4,000-line card (timeupdate, hover, progress) was steady churn while playing.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  useLayoutEffect(() => {
    if (videoRef.current !== videoEl) setVideoEl(videoRef.current);
  });
  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement || (document as any).webkitFullscreenElement;
      const own = !!active && (active === containerRef.current || active === videoRef.current);
      cancelPending();
      if (!own) restoreInline();
      setIsFullscreen(own);
    };
    const video = videoEl;
    const onIOSFullscreen = () => { cancelPending(); setIsFullscreen(true); };
    const onIOSExit = () => { cancelPending(); restoreInline(); setIsFullscreen(false); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && simulated.current) {
        cancelPending(); restoreInline(); setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);
    video?.addEventListener('webkitbeginfullscreen', onIOSFullscreen);
    video?.addEventListener('webkitendfullscreen', onIOSExit);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
      video?.removeEventListener('webkitbeginfullscreen', onIOSFullscreen);
      video?.removeEventListener('webkitendfullscreen', onIOSExit);
    };
  }, [videoEl, containerRef, videoRef, cancelPending, restoreInline]);
  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current as any;
    const container = containerRef.current as any;
    const active = document.fullscreenElement || (document as any).webkitFullscreenElement;
    cancelPending();
    if (video?.webkitDisplayingFullscreen) { video.webkitExitFullscreen?.(); return; }
    if (active === container && active) {
      try {
        const result = document.exitFullscreen ? document.exitFullscreen() : (document as any).webkitExitFullscreen?.();
        result?.catch?.(() => {});
      } catch {}
      return;
    }
    if (isFullscreen || simulated.current) { restoreInline(); setIsFullscreen(false); return; }
    if (!container) return;
    if (!preferContainer && typeof video?.webkitEnterFullscreen === 'function') {
      try { video.webkitEnterFullscreen(); return; } catch { /* Try the container next. */ }
    }
    const requestGeneration = generation.current;
    const activateSimulated = () => {
      if (requestGeneration !== generation.current || !allowSimulated || simulated.current) return;
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) return;
      simulated.current = true;
      if (escapeAncestors) restore.current = liftFullscreenElement(container);
      setIsFullscreen(true);
    };
    try {
      const request = container.requestFullscreen || container.webkitRequestFullscreen;
      if (request) {
        const result = request.call(container);
        if (result && typeof result.then === 'function') {
          // The promise settles once the browser has finished (or refused) the
          // switch. A fixed timer used to race it: on a desktop whose window
          // animation runs past 300ms (macOS spaces, big monitors) the overlay
          // fallback fired while the real fullscreen was still landing, lifted
          // the frame to <body> mid-switch and knocked the browser straight back
          // out, so the player flickered, jumped and often had to be clicked twice.
          // Per spec it resolves after `fullscreenchange`, so an empty
          // fullscreenElement on resolve is a WebView that said yes and did
          // nothing (SafePal) — the overlay takes over then, not on a guess.
          // The long timer only covers a promise that never settles.
          result.then(activateSimulated, activateSimulated);
          timer.current = setTimeout(activateSimulated, 1500);
        } else {
          // Legacy WebKit returns nothing and fires no error on refusal.
          timer.current = setTimeout(activateSimulated, 1000);
        }
        return;
      }
    } catch { /* Synchronous rejection uses the same fallback. */ }
    activateSimulated();
  }, [isFullscreen, videoRef, containerRef, allowSimulated, escapeAncestors, preferContainer, cancelPending, restoreInline]);
  return { isFullscreen, toggleFullscreen, setIsFullscreen };
}
