/**
 * Watching a live behind its edge: paused, rewound along the timeline, or
 * left behind by a slow connection. The server keeps the last few minutes
 * of every broadcast (MediaMTX hlsSegmentCount), so the player can carry on
 * from where it stopped instead of throwing the viewer forward.
 */

/** How far back the timeline reaches, in seconds. */
export const TIMESHIFT_WINDOW_SEC = 180;

/** Further back than this and the viewer is "behind": the LIVE tag turns white. */
export const BEHIND_LIVE_SEC = 3;

export interface TimeshiftSnap {
  /** Seconds behind the live edge, 0 at live. */
  behind: number;
  /** Where the viewer is on the timeline, 0 (oldest kept) to 1 (live). */
  ratio: number;
  /** Seconds the timeline spans right now (shorter early in a broadcast). */
  windowSec: number;
  paused: boolean;
}

/**
 * Place on the timeline from the element's clock.
 * `edge` is where this player plays "live" (hls.js liveSyncPosition, or the
 * native seekable end less a little), `seekStart` the oldest time it can seek to.
 */
export function timelineSnap(currentTime: number, edge: number, seekStart: number, paused: boolean): TimeshiftSnap {
  const start = Math.max(seekStart, edge - TIMESHIFT_WINDOW_SEC);
  const windowSec = Math.max(0, edge - start);
  const behind = Math.max(0, edge - currentTime);
  const ratio = windowSec > 0 ? Math.min(1, Math.max(0, (currentTime - start) / windowSec)) : 1;
  return { behind, ratio, windowSec, paused };
}

/** The timeline at the live edge, before any recorded part is loaded (WebRTC). */
export function liveEdgeSnap(paused: boolean, behind = 0): TimeshiftSnap {
  const b = Math.min(TIMESHIFT_WINDOW_SEC, Math.max(0, behind));
  return { behind: b, ratio: 1 - b / TIMESHIFT_WINDOW_SEC, windowSec: TIMESHIFT_WINDOW_SEC, paused };
}

/** Seconds behind live that a point on the timeline stands for. */
export function behindForRatio(ratio: number, windowSec: number): number {
  return Math.max(0, (1 - Math.min(1, Math.max(0, ratio))) * windowSec);
}

export const isBehindLive = (snap: Pick<TimeshiftSnap, 'behind'> | null | undefined) =>
  !!snap && snap.behind > BEHIND_LIVE_SEC;

/** "−0:42", "−2:05": how far back, as the tag shows it. */
export function formatBehind(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `−${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Where to put the clock to stand `behind` seconds back from `edge`, kept
 * inside what can still be played.
 */
export function timeForBehind(edge: number, seekStart: number, behind: number): number {
  return Math.max(seekStart + 0.5, Math.min(edge, edge - Math.max(0, behind)));
}
