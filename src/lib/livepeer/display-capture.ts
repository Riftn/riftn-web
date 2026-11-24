/**
 * Screen picker for going live
 * ============================
 * One place that opens the browser's share picker for a broadcast, used by
 * the Go Live sheet (share from the start) and by the broadcaster's own
 * share button (switch to the screen mid-live).
 *
 * Two things differ from a bare getDisplayMedia call:
 *
 * - Riftn stays in front after the pick. Chrome's default is to jump to the
 *   shared window, which for a window share means another app covers Riftn
 *   while the stream is still being set up (minting, wallet prompt, server
 *   hand-off). The creator then never sees the live finish opening. Keeping
 *   focus here lets them watch it go live and switch over when ready.
 * - A shared window or whole screen is treated as moving video (a game, a
 *   player), not a page of text. Chrome's default for screen captures keeps
 *   every pixel sharp and drops frames instead, which on a game reads as a
 *   stuttering, glitchy picture. Tabs keep the default (they are usually
 *   pages, where sharp text matters more).
 */

export type DisplaySurface = 'browser' | 'window' | 'monitor' | 'unknown';

interface CaptureControllerLike {
  setFocusBehavior?: (behavior: 'focus-captured-surface' | 'no-focus-change') => void;
}

/** What the creator picked: a tab, a window or a whole screen. */
export function displaySurfaceOf(track: MediaStreamTrack | null | undefined): DisplaySurface {
  const surface = (track?.getSettings?.() as { displaySurface?: string } | undefined)?.displaySurface;
  return surface === 'browser' || surface === 'window' || surface === 'monitor' ? surface : 'unknown';
}

/**
 * Window and screen shares carry games and video: keep the frame rate and let
 * sharpness give under pressure. Tabs keep the browser's text-friendly default.
 */
export function tuneDisplayTrack(track: MediaStreamTrack | null | undefined): void {
  if (!track) return;
  const surface = displaySurfaceOf(track);
  if (surface !== 'window' && surface !== 'monitor') return;
  try {
    track.contentHint = 'motion';
  } catch {
    /* read-only on older engines */
  }
}

/**
 * Opens the share picker. Must be called straight from a click (the picker
 * needs the click's user activation), before any other await.
 */
export async function requestDisplayCapture(video: MediaTrackConstraints): Promise<MediaStream> {
  const Controller = (globalThis as { CaptureController?: new () => CaptureControllerLike })
    .CaptureController;
  let controller: CaptureControllerLike | undefined;
  if (typeof Controller === 'function') {
    try {
      controller = new Controller();
      // Allowed before the picker opens; browsers without it keep their default.
      controller.setFocusBehavior?.('no-focus-change');
    } catch {
      controller = undefined;
    }
  }

  const options = {
    video,
    audio: true,
    // Sharing the Riftn tab itself only shows the stream inside the stream.
    selfBrowserSurface: 'exclude',
    // Lets the creator switch to another tab from Chrome's sharing bar
    // without ending the share.
    surfaceSwitching: 'include',
    systemAudio: 'include',
    ...(controller ? { controller } : {}),
  } as DisplayMediaStreamOptions;

  const stream = await navigator.mediaDevices.getDisplayMedia(options);
  tuneDisplayTrack(stream.getVideoTracks()[0]);
  return stream;
}
