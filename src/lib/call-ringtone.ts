/**
 * The sound of an incoming call.
 *
 * The incoming-call screen used to appear in silence, so a call to a laptop in
 * another tab or a phone on the desk went unnoticed. While a call is waiting
 * this loops a short ringtone, buzzes phones that can (Android browsers), and
 * flashes the tab title. Answering, declining or the call ending stops all three.
 *
 * Browsers only let a page make sound after the reader has used it once; when
 * that hasn't happened yet the title flash is what's left.
 */

const RING_SRC = '/sounds/ringtone.mp3';
/** Buzz, rest, buzz, long rest: the rhythm people read as a phone ringing. */
const RING_BUZZ = [700, 300, 700];
const RING_CYCLE_MS = 3000;

let audio: HTMLAudioElement | null = null;
let buzzTimer: ReturnType<typeof setInterval> | null = null;
let titleTimer: ReturnType<typeof setInterval> | null = null;
let savedTitle: string | null = null;

function buzz() {
  try { navigator.vibrate?.(RING_BUZZ); } catch { /* no motor */ }
}

export function startCallRingtone(titleLine: string): void {
  if (typeof window === 'undefined' || buzzTimer) return;
  try {
    audio ??= new Audio(RING_SRC);
    audio.loop = true;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch {
    // The call screen still shows; a failed sound must never block a call.
  }
  buzz();
  buzzTimer = setInterval(buzz, RING_CYCLE_MS);
  savedTitle = document.title;
  let on = false;
  titleTimer = setInterval(() => {
    on = !on;
    document.title = on ? titleLine : savedTitle ?? document.title;
  }, 1000);
}

export function stopCallRingtone(): void {
  if (buzzTimer) clearInterval(buzzTimer);
  if (titleTimer) clearInterval(titleTimer);
  buzzTimer = null;
  titleTimer = null;
  try { navigator.vibrate?.(0); } catch { /* nothing to stop */ }
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  if (savedTitle !== null) {
    document.title = savedTitle;
    savedTitle = null;
  }
}

/**
 * The soft tone the caller hears while the other side rings, so a call that
 * is going through doesn't sound like nothing is happening.
 */
const RINGBACK_SRC = '/sounds/call-ringback.wav';
let ringback: HTMLAudioElement | null = null;

export function startCallRingback(): void {
  if (typeof window === 'undefined') return;
  try {
    ringback ??= new Audio(RINGBACK_SRC);
    ringback.loop = true;
    ringback.volume = 0.5;
    ringback.currentTime = 0;
    void ringback.play().catch(() => undefined);
  } catch {
    // A silent ringback never blocks the call.
  }
}

export function stopCallRingback(): void {
  if (!ringback) return;
  try {
    ringback.pause();
    ringback.currentTime = 0;
  } catch {
    // Already stopped.
  }
}
