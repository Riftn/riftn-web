/**
 * HLS, made ready while WebRTC is still trying
 * ============================================
 * A live opens over WebRTC first and drops to HLS when that does not work:
 * a network that blocks UDP, a stream WebRTC cannot carry, an encoder that
 * sends a keyframe only every eight seconds. The drop used to start HLS from
 * nothing: download hls.js, fetch two playlists, fetch the first piece of
 * video. That was one to two seconds of spinner on top of however long
 * WebRTC took to give up.
 *
 * So the player is built the moment WebRTC starts. With no <video> attached
 * hls.js loads the playlists and (`startFragPrefetch`, unless the caller turns
 * it off) the first piece of video, then waits. If WebRTC shows a picture the standby is thrown away; if
 * not, attaching the element plays from what is already here.
 *
 * It also answers a question WebRTC cannot: how far apart this stream's
 * keyframes are. A WebRTC viewer can only start on a keyframe and cannot ask
 * an RTMP encoder for one, so on a stream with long gaps the wait for a
 * picture is the gap itself. HLS has the last whole segment ready, so it wins.
 */

import type Hls from 'hls.js';
import type { HlsConfig } from 'hls.js';

type HlsCtor = typeof Hls;

export interface LiveHlsStandby {
  hls: Hls;
  Hls: HlsCtor;
}

interface Entry {
  ready: Promise<LiveHlsStandby | null>;
  /** Longest segment the playlist allows, in seconds, once it is known. */
  targetDuration: number | null;
  listeners: Set<(seconds: number) => void>;
  dropped: boolean;
  timer: ReturnType<typeof setTimeout>;
  /** Stops the standby's own listeners once a player owns the instance. */
  release: () => void;
}

/** A standby nobody takes is closed: it is a rolling download while it lives. */
const UNCLAIMED_MS = 12_000;

const entries = new Map<string, Entry>();

function close(url: string, entry: Entry) {
  entry.dropped = true;
  clearTimeout(entry.timer);
  if (entries.get(url) === entry) entries.delete(url);
  void entry.ready.then((standby) => {
    try {
      standby?.hls.destroy();
    } catch {
      /* Already destroyed. */
    }
  });
}

/**
 * Start loading a live's HLS in the background. Safe to call again for the
 * same URL. `onTargetDuration` hears the playlist's segment length as soon as
 * the first playlist is in (at once, when it already is).
 */
export function warmLiveHls(
  url: string | undefined,
  config: Partial<HlsConfig>,
  onTargetDuration?: (seconds: number) => void,
): void {
  if (!url || typeof window === 'undefined') return;
  const existing = entries.get(url);
  if (existing) {
    if (onTargetDuration) {
      if (existing.targetDuration != null) onTargetDuration(existing.targetDuration);
      else existing.listeners.add(onTargetDuration);
    }
    return;
  }

  const entry: Entry = {
    targetDuration: null,
    listeners: new Set(onTargetDuration ? [onTargetDuration] : []),
    dropped: false,
    timer: setTimeout(() => close(url, entry), UNCLAIMED_MS),
    ready: Promise.resolve(null),
    release: () => undefined,
  };
  entry.ready = (async () => {
    try {
      const { default: HlsClass } = await import('hls.js');
      if (entry.dropped || !HlsClass.isSupported()) return null;
      const hls = new HlsClass({ startFragPrefetch: true, ...config });
      const onLevel = (_: unknown, data: { details?: { targetduration?: number } }) => {
        const seconds = data.details?.targetduration;
        if (entry.targetDuration != null || !seconds || !Number.isFinite(seconds)) return;
        entry.targetDuration = seconds;
        entry.listeners.forEach((listener) => listener(seconds));
        entry.listeners.clear();
      };
      // Nobody is listening for errors yet. One that stops the loading would
      // hand the player an instance that never plays, so it is closed and the
      // player builds its own, with its own retries.
      const onError = (_: unknown, data: { fatal?: boolean }) => {
        if (data.fatal) close(url, entry);
      };
      hls.on(HlsClass.Events.LEVEL_LOADED, onLevel);
      hls.on(HlsClass.Events.ERROR, onError);
      entry.release = () => {
        hls.off(HlsClass.Events.LEVEL_LOADED, onLevel);
        hls.off(HlsClass.Events.ERROR, onError);
      };
      hls.loadSource(url);
      if (entry.dropped) {
        hls.destroy();
        return null;
      }
      return { hls, Hls: HlsClass };
    } catch {
      return null;
    }
  })();
  entries.set(url, entry);
}

/**
 * The standby for this URL, handed over to the caller, who now owns it and
 * must destroy it. Null when there is none (never warmed, or already closed).
 */
export function takeWarmLiveHls(url: string | undefined): Promise<LiveHlsStandby | null> | null {
  if (!url) return null;
  const entry = entries.get(url);
  if (!entry || entry.dropped) return null;
  clearTimeout(entry.timer);
  entry.listeners.clear();
  entries.delete(url);
  return entry.ready.then((standby) => {
    if (entry.dropped) return null;
    entry.release();
    return standby;
  });
}

/** WebRTC got its picture: the standby is not needed. */
export function dropWarmLiveHls(url: string | undefined): void {
  if (!url) return;
  const entry = entries.get(url);
  if (entry) close(url, entry);
}

/**
 * Keyframes this far apart (seconds) or more: WebRTC would sit on a spinner
 * for up to that long, so the stream opens over HLS. A well set up encoder
 * sends one every two seconds; OBS left on "auto" sends one about every eight.
 */
export const SLOW_KEYFRAME_SEC = 4;
