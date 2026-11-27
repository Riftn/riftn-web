/**
 * Audio post playback — the corner player's engine
 * =================================================
 * An audio post plays inside its card: `AudioVisualizer` owns the `<audio>`
 * element and the analyser graph around it, and tears both down when the card
 * unmounts. Right for a feed, and also why the track died the moment the card
 * scrolled out of a virtualised list or the route changed — there was no way
 * to keep listening while you browse, which radio and stage recordings have
 * had for a while.
 *
 * This module is where a track goes when it is popped out. The card hands its
 * element over as-is — the analyser chain stays connected, so the card keeps
 * animating while it is on screen and nothing is downloaded twice — and this
 * takes the OS media session under its own name. `AudioPostMiniPlayer`,
 * mounted once in AppLayout, keeps it reachable and stoppable from anywhere.
 * A card still on screen mirrors the state published here, and pressing its
 * pop-out control again takes the element back, still playing.
 *
 * Module scope rather than a context for the same reason radio and stages
 * are: cards live in long lists, the mini player lives outside every route,
 * and there is only ever one of these at a time.
 *
 * @module lib/audio-post-playback
 */

import { useEffect, useState } from 'react';
import { setAudioPostPoppedOut } from '@/lib/audio-post-popout';
import {
  claimMediaSession,
  releaseMediaSession,
  setMediaSessionPlaying,
  setMediaSessionPosition,
} from '@/lib/media-session';

/** This module's identity in the single-owner media session. */
const OWNER_ID = 'audio-post-popout';

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export interface AudioPostTrack {
  tokenId: string;
  audioUrl: string;
  /** Already resolved by the card: a post with no title still needs a name. */
  title: string;
  artist: string;
  artworkUrl?: string | null;
}

/** The element and whatever Web Audio nodes the card had built around it. */
export interface AudioPostGraph {
  el: HTMLAudioElement;
  /**
   * The card's analyser chain. Left connected on purpose: a media element
   * that has a source node only sounds through the graph, and the card reads
   * the analyser to animate while it is still on screen.
   */
  source: MediaElementAudioSourceNode | null;
  analyser: AnalyserNode | null;
}

export interface AudioPostPlaybackState {
  /** The popped-out post, or null when the corner player is closed. */
  tokenId: string | null;
  track: AudioPostTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** Playhead, 0–1. */
  progress: number;
  /** Seconds. */
  currentTime: number;
  duration: number;
  /** Tracks in the playlist being played (0 when it's a single popped-out post). */
  queueLength: number;
  /** Where in that playlist we are, 0-based, in play order. */
  queuePos: number;
  shuffle: boolean;
  /** Seconds the end of one track blends into the next. 0 = off. */
  crossfade: number;
}

const CROSSFADE_KEY = 'riftn.audio.crossfade';
export const CROSSFADE_STEPS = [0, 3, 6, 12] as const;
function readCrossfade(): number {
  try {
    const v = Number(localStorage.getItem(CROSSFADE_KEY));
    return (CROSSFADE_STEPS as readonly number[]).includes(v) ? v : 0;
  } catch { return 0; }
}

const IDLE: AudioPostPlaybackState = {
  tokenId: null,
  track: null,
  isPlaying: false,
  isLoading: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
  queueLength: 0,
  queuePos: 0,
  shuffle: false,
  crossfade: 0,
};

let state: AudioPostPlaybackState = { ...IDLE, crossfade: typeof window === 'undefined' ? 0 : readCrossfade() };
const subscribers = new Set<(next: AudioPostPlaybackState) => void>();

function publish(patch: Partial<AudioPostPlaybackState>) {
  const next = { ...state, ...patch };
  let changed = false;
  for (const key of Object.keys(next) as (keyof AudioPostPlaybackState)[]) {
    if (next[key] !== state[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = next;
  // The app shell gates the corner player's chunk on this, without having to
  // load this module to find out — see lib/audio-post-popout.
  setAudioPostPoppedOut(!!state.tokenId);
  for (const notify of subscribers) notify(state);
}

let graph: AudioPostGraph | null = null;
let detach: (() => void) | null = null;
/** A seek asked for before the element had a duration to seek within. */
let pendingSeek: number | null = null;

const durationOf = (el: HTMLAudioElement) =>
  Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;

function attach(el: HTMLAudioElement) {
  detach?.();
  const onTime = () => {
    const total = durationOf(el) || state.duration;
    if (queue && state.crossfade > 0 && total > 0 && fadeTriedFor !== el && total - el.currentTime <= state.crossfade && hasNext()) {
      startCrossfade(el);
      return;
    }
    publish({
      currentTime: el.currentTime,
      duration: total,
      progress: total > 0 ? clamp01(el.currentTime / total) : 0,
    });
    if (total > 0) setMediaSessionPosition(OWNER_ID, el.currentTime, total);
  };
  const onMeta = () => {
    const total = durationOf(el);
    if (!total) return;
    publish({ duration: total, isLoading: false });
    if (pendingSeek !== null) {
      el.currentTime = pendingSeek * total;
      pendingSeek = null;
    }
  };
  const onPlay = () => {
    publish({ isPlaying: true });
    setMediaSessionPlaying(OWNER_ID, true);
  };
  const onPause = () => {
    publish({ isPlaying: false, isLoading: false });
    setMediaSessionPlaying(OWNER_ID, false);
  };
  const onWaiting = () => publish({ isLoading: true });
  const onPlaying = () => publish({ isLoading: false });
  // Rest at the end rather than closing: one tap on the corner player starts
  // it again from the top, which is what a finished track wants.
  const onEnded = () => {
    if (queue && hasNext()) { skipAudioQueue(1); return; }
    publish({ isPlaying: false, isLoading: false, progress: 1 });
    setMediaSessionPlaying(OWNER_ID, false);
  };

  el.addEventListener('timeupdate', onTime);
  el.addEventListener('seeked', onTime);
  el.addEventListener('loadedmetadata', onMeta);
  el.addEventListener('durationchange', onMeta);
  el.addEventListener('play', onPlay);
  el.addEventListener('pause', onPause);
  el.addEventListener('waiting', onWaiting);
  el.addEventListener('playing', onPlaying);
  el.addEventListener('ended', onEnded);
  detach = () => {
    el.removeEventListener('timeupdate', onTime);
    el.removeEventListener('seeked', onTime);
    el.removeEventListener('loadedmetadata', onMeta);
    el.removeEventListener('durationchange', onMeta);
    el.removeEventListener('play', onPlay);
    el.removeEventListener('pause', onPause);
    el.removeEventListener('waiting', onWaiting);
    el.removeEventListener('playing', onPlaying);
    el.removeEventListener('ended', onEnded);
    detach = null;
  };
}

function claim(track: AudioPostTrack, el: HTMLAudioElement) {
  claimMediaSession(
    OWNER_ID,
    {
      title: track.title,
      artist: track.artist,
      album: 'Riftn • Audio',
      artwork: track.artworkUrl || null,
    },
    {
      play: resumeAudioPost,
      pause: pauseAudioPost,
      stop: stopAudioPost,
      seekbackward: (offset) => nudge(-offset),
      seekforward: (offset) => nudge(offset),
      seekto: (time) => {
        if (graph?.el === el) el.currentTime = time;
      },
    },
  );
}

function nudge(seconds: number) {
  const el = graph?.el;
  if (!el) return;
  const total = durationOf(el);
  el.currentTime = total > 0 ? Math.max(0, Math.min(total, el.currentTime + seconds)) : 0;
}

/** Stop the track, drop the element and close the corner player. */
export function stopAudioPost() {
  queue = null;
  endFade();
  const g = graph;
  detach?.();
  graph = null;
  pendingSeek = null;
  if (g) {
    try {
      g.el.pause();
    } catch {
      /* already released */
    }
    // Detach the nodes from the SHARED context, never close it — other
    // visualizers may be using it.
    g.source?.disconnect();
    g.analyser?.disconnect();
    g.el.removeAttribute('src');
  }
  releaseMediaSession(OWNER_ID);
  publish({ ...IDLE, crossfade: state.crossfade });
}

export interface AudioPostHandover {
  track: AudioPostTrack;
  /**
   * The card's element and nodes, or null when the card never got as far as
   * creating one — the engine makes a plain element then.
   */
  graph: AudioPostGraph | null;
  /** Where to start, 0–1, when the engine creates the element itself. */
  startAt?: number | null;
}

/**
 * Pop a post out into the corner player, starting it if it is not already
 * playing — the only reading of the control that makes sense from a card
 * nobody has pressed play on.
 *
 * Runs `play()` synchronously so it lands in the click's own call stack,
 * which is what the autoplay policy checks.
 */
export function popOutAudioPost(handover: AudioPostHandover) {
  const { track } = handover;

  if (state.tokenId === track.tokenId && graph) {
    // Already here: make sure it is audible and leave it at that.
    if (!state.isPlaying) resumeAudioPost();
    return;
  }

  // Whatever was popped out before is over, playlist included.
  if (graph) stopAudioPost();
  queue = null;

  let g = handover.graph;
  if (!g) {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.src = track.audioUrl;
    g = { el, source: null, analyser: null };
  }
  const { el } = g;
  graph = g;

  const total = durationOf(el);
  if (!handover.graph && handover.startAt != null) {
    if (total > 0) el.currentTime = clamp01(handover.startAt) * total;
    else pendingSeek = clamp01(handover.startAt);
  }
  attach(el);

  publish({
    tokenId: track.tokenId,
    track,
    isPlaying: true,
    isLoading: total === 0,
    duration: total,
    currentTime: el.currentTime,
    progress: total > 0 ? clamp01(el.currentTime / total) : (pendingSeek ?? 0),
  });

  if (el.ended) el.currentTime = 0;
  claim(track, el);
  el.play().catch(() => publish({ isPlaying: false, isLoading: false }));
  setMediaSessionPlaying(OWNER_ID, true);
}

/**
 * Hand the element back to a card, still playing if it was. Returns null when
 * nothing is popped out for that post, in which case nothing changed.
 *
 * The media session is released here: the card claims it under its own id
 * the moment it reports itself playing, and a stale release from this module
 * later cannot touch that claim.
 */
export function takeBackAudioPost(tokenId: string): AudioPostGraph | null {
  if (state.tokenId !== tokenId || !graph) return null;
  const g = graph;
  detach?.();
  graph = null;
  pendingSeek = null;
  queue = null;
  endFade();
  releaseMediaSession(OWNER_ID);
  publish({ ...IDLE, crossfade: state.crossfade });
  return g;
}

/** Pause. The session claim is kept so the track can be resumed from it. */
export function pauseAudioPost() {
  const el = graph?.el;
  if (!el) return;
  el.pause();
}

export function resumeAudioPost() {
  const el = graph?.el;
  const { track } = state;
  if (!el || !track) return;
  if (el.ended) el.currentTime = 0;
  // Re-claimed on resume: something else may have taken the session while
  // this sat paused.
  claim(track, el);
  publish({ isPlaying: true });
  el.play().catch(() => publish({ isPlaying: false, isLoading: false }));
  setMediaSessionPlaying(OWNER_ID, true);
}

export function toggleAudioPost() {
  if (!state.tokenId) return;
  if (state.isPlaying) pauseAudioPost();
  else resumeAudioPost();
}

/** Jump to `ratio` (0–1). Never changes the play state. */
export function seekAudioPost(ratio: number) {
  const el = graph?.el;
  if (!el) return;
  const clamped = clamp01(ratio);
  const total = durationOf(el);
  if (!total) {
    pendingSeek = clamped;
    publish({ progress: clamped, currentTime: clamped * state.duration });
    return;
  }
  el.currentTime = clamped * total;
  publish({ progress: clamped, currentTime: clamped * total });
}

/** Subscribe to the popped-out post. */
export function useAudioPostPlayback(): AudioPostPlaybackState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    setSnapshot(state);
    subscribers.add(setSnapshot);
    return () => {
      subscribers.delete(setSnapshot);
    };
  }, []);
  return snapshot;
}

/** The current state, for code that is not a component. */
export function getAudioPostPlaybackState(): AudioPostPlaybackState {
  return state;
}

// ── Playlists ───────────────────────────────────────────────────────
// A playlist plays through the corner player, one track after another, in
// order or shuffled. With crossfade on, the last seconds of a track blend
// into the start of the next, like a DJ mix.

interface Queue {
  tracks: AudioPostTrack[];
  /** Indexes into `tracks`, in play order. */
  order: number[];
}
let queue: Queue | null = null;
/** The track fading out while the next one fades in. */
let fading: HTMLAudioElement | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
/** The element a crossfade was already started (or ruled out) for. */
let fadeTriedFor: HTMLAudioElement | null = null;

const shuffled = (n: number, first?: number) => {
  const rest = [...Array(n).keys()].filter(i => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first === undefined ? rest : [first, ...rest];
};

const hasNext = () => !!queue && state.queuePos + 1 < queue.order.length;

function endFade() {
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
  if (fading) {
    try { fading.pause(); } catch { /* released */ }
    fading.removeAttribute('src');
    fading = null;
  }
  if (graph?.el) graph.el.volume = 1;
}

/** Whether this browser lets a page set an element's volume (iPhone Safari does not). */
function volumeWorks(el: HTMLAudioElement) {
  try {
    el.volume = 0.5;
    const ok = Math.abs(el.volume - 0.5) < 0.01;
    el.volume = 1;
    return ok;
  } catch { return false; }
}

/** Load `queue.order[pos]` into a fresh element and play it. */
function playAt(pos: number, opts: { fadeInFrom?: HTMLAudioElement } = {}) {
  if (!queue) return;
  const track = queue.tracks[queue.order[pos]];
  const el = new Audio();
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  el.src = track.audioUrl;
  const old = graph;
  detach?.();
  if (old && old.el !== opts.fadeInFrom) {
    try { old.el.pause(); } catch { /* released */ }
    old.source?.disconnect();
    old.analyser?.disconnect();
    old.el.removeAttribute('src');
  }
  graph = { el, source: null, analyser: null };
  pendingSeek = null;
  attach(el);
  publish({ tokenId: track.tokenId, track, isPlaying: true, isLoading: true, duration: 0, currentTime: 0, progress: 0, queuePos: pos });
  claim(track, el);
  if (opts.fadeInFrom) el.volume = 0;
  el.play().catch(() => publish({ isPlaying: false, isLoading: false }));
  setMediaSessionPlaying(OWNER_ID, true);
}

function startCrossfade(from: HTMLAudioElement) {
  if (!queue || !hasNext()) return;
  fadeTriedFor = from;
  // No volume control here (iPhone): the next track simply starts at the end.
  if (!volumeWorks(from)) return;
  endFade();
  fading = from;
  const seconds = Math.max(0.5, Math.min(state.crossfade, durationOf(from) - from.currentTime || state.crossfade));
  playAt(state.queuePos + 1, { fadeInFrom: from });
  const next = graph!.el;
  const started = Date.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - started) / (seconds * 1000));
    try {
      next.volume = k;
      if (fading) fading.volume = 1 - k;
    } catch { /* released */ }
    if (k >= 1) {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      if (fading) {
        try { fading.pause(); } catch { /* released */ }
        fading.removeAttribute('src');
        fading = null;
      }
    }
  }, 100);
}

/**
 * Play a playlist in the corner player. `start` is the position in `tracks`
 * to begin with; with `shuffle` the rest come in random order.
 */
export function playAudioQueue(tracks: AudioPostTrack[], opts: { start?: number; shuffle?: boolean } = {}) {
  const list = tracks.filter(t => !!t.audioUrl);
  if (!list.length) return;
  if (graph) stopAudioPost();
  const shuffle = !!opts.shuffle;
  const start = opts.start != null ? Math.max(0, Math.min(list.length - 1, opts.start)) : shuffle ? Math.floor(Math.random() * list.length) : 0;
  const order = shuffle ? shuffled(list.length, start) : [...list.keys()];
  queue = { tracks: list, order };
  publish({ queueLength: list.length, shuffle });
  playAt(shuffle ? 0 : start);
}

/** Next (`1`) or previous (`-1`) track. Previous restarts the track when it's past 3 seconds. */
export function skipAudioQueue(step: 1 | -1) {
  if (!queue) return;
  endFade();
  if (step === -1 && graph?.el && graph.el.currentTime > 3) {
    graph.el.currentTime = 0;
    return;
  }
  const pos = state.queuePos + step;
  if (pos < 0 || pos >= queue.order.length) return;
  playAt(pos);
}

/** Shuffle on or off for the rest of the playlist; the track playing keeps playing. */
export function toggleAudioQueueShuffle() {
  if (!queue) return;
  const current = queue.order[state.queuePos];
  const shuffle = !state.shuffle;
  queue.order = shuffle ? shuffled(queue.tracks.length, current) : [...queue.tracks.keys()];
  publish({ shuffle, queuePos: queue.order.indexOf(current) });
}

/** Set crossfade seconds (one of CROSSFADE_STEPS). Remembered on this device. */
export function setAudioCrossfade(seconds: number) {
  const value = (CROSSFADE_STEPS as readonly number[]).includes(seconds) ? seconds : 0;
  try { localStorage.setItem(CROSSFADE_KEY, String(value)); } catch { /* private mode */ }
  publish({ crossfade: value });
}
