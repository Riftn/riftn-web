/**
 * The live you minimised
 * ======================
 * A live keeps playing after you leave its page: as a small window you can
 * drag to any corner, or as a listen bar (sound only). One live at a time;
 * opening another live, or any other sound, closes it.
 *
 * The page hands over what it already has, so nothing restarts:
 * - its running WebRTC session (the picture never drops), and
 * - an audience seat taken before the page leaves, so the creator never
 *   sees a leave and a join.
 * Opening the live again hands both back through lib/live-handoff.
 */
import { useSyncExternalStore } from 'react';
import type { WhepSubscription } from '@/lib/livepeer/whep';
import { stashLiveSession } from '@/lib/live-handoff';

export type LiveMiniMode = 'video' | 'listen';

export interface LiveMini {
  /** Mongo id: presence, ended watch. */
  streamId: string;
  /** WebRTC playback id, for handing the session back to the page. */
  playbackId: string | null;
  /** HLS ladder, used when no WebRTC session was handed over (or it drops). */
  urls: string[];
  title: string;
  host: string;
  avatar?: string;
  /** Where the full viewer lives. */
  path: string;
  mode: LiveMiniMode;
  /** The page's running WebRTC session, if it had one. */
  session: WhepSubscription | null;
  /** Last frame the page showed, drawn until the window's first. */
  poster?: string;
  /** The audience seat the page handed over. */
  seat: { leave: () => void } | null;
}

/** How long a handed-back seat is held while the page joins its own. */
const SEAT_OVERLAP_MS = 5000;

let current: LiveMini | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getLiveMini = () => current;
export const useLiveMini = () => useSyncExternalStore(subscribe, getLiveMini, () => null);

export function openLiveMini(next: Omit<LiveMini, 'mode'> & { mode?: LiveMiniMode }): void {
  if (current) closeLiveMini();
  current = { ...next, mode: next.mode ?? 'video' };
  notify();
}

export function setLiveMiniMode(mode: LiveMiniMode): void {
  if (!current || current.mode === mode) return;
  current = { ...current, mode };
  notify();
}

/** The WebRTC session dropped and the window moved to HLS. */
export function dropLiveMiniSession(): void {
  if (!current?.session) return;
  const { session } = current;
  current = { ...current, session: null };
  void session.stop();
  notify();
}

/**
 * Close it. `handBack` gives the running session and the seat to the page
 * that is opening the same live, so the picture and the count carry on.
 */
export function closeLiveMini(handBack?: { video: HTMLVideoElement | null }): void {
  if (!current) return;
  const closing = current;
  current = null;
  if (handBack && closing.session && closing.playbackId && handBack.video) {
    stashLiveSession(closing.playbackId, closing.session, handBack.video);
  } else if (closing.session) {
    void closing.session.stop();
  }
  if (closing.seat) {
    const seat = closing.seat;
    if (handBack) setTimeout(() => seat.leave(), SEAT_OVERLAP_MS);
    else seat.leave();
  }
  notify();
}

/** A viewer is opening: hand this live back to it, or close a different one. */
export function claimLiveMini(streamId: string | null | undefined, video: HTMLVideoElement | null): void {
  if (!current) return;
  if (current.streamId === streamId) closeLiveMini({ video });
  else closeLiveMini();
}

/** The window's own <video>, so a page taking the live back can snapshot it. */
let windowVideo: HTMLVideoElement | null = null;
export const setLiveMiniVideo = (video: HTMLVideoElement | null) => { windowVideo = video; };
export const getLiveMiniVideo = () => windowVideo;
