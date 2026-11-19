/**
 * Call tones
 * ==========
 * The ringtone an incoming call plays while it waits for an answer, and the
 * ringback the caller hears while the other side rings. Calls used to be
 * silent on both ends, so an incoming call in another tab was easy to miss.
 *
 * Plays public/sounds/call-ring.wav and call-ringback.wav, the same sounds the
 * app plays (riftn-mobile scripts/render-call-tones.py). On a phone browser
 * the incoming ring also vibrates where the browser allows it.
 *
 * A browser that blocks sound before the page has been touched simply stays
 * quiet; the call screen is still there. Never throws.
 *
 * @module lib/call-tones
 */

export type CallTone = 'ring' | 'ringback';

const SOURCES: Record<CallTone, string> = {
  ring: '/sounds/call-ring.wav',
  ringback: '/sounds/call-ringback.wav',
};

const VOLUME: Record<CallTone, number> = { ring: 0.9, ringback: 0.5 };

let audio: HTMLAudioElement | null = null;
let playing: CallTone | null = null;
let buzzTimer: ReturnType<typeof setInterval> | null = null;

function buzz() {
  try {
    navigator.vibrate?.([1000, 1200]);
  } catch {
    // No vibrator, or the browser refuses without a gesture.
  }
}

/** Start a tone, replacing any other tone that is playing. */
export function startCallTone(tone: CallTone): void {
  if (playing === tone) return;
  stopCallTone();
  playing = tone;
  try {
    audio = new Audio(SOURCES[tone]);
    audio.loop = true;
    audio.volume = VOLUME[tone];
    void audio.play().catch(() => undefined);
  } catch {
    audio = null;
  }
  if (tone === 'ring') {
    buzz();
    buzzTimer = setInterval(buzz, 2200);
  }
}

/** Stop whatever tone is playing. */
export function stopCallTone(): void {
  playing = null;
  if (buzzTimer) {
    clearInterval(buzzTimer);
    buzzTimer = null;
  }
  try {
    navigator.vibrate?.(0);
  } catch {
    // Nothing to stop.
  }
  if (audio) {
    try {
      audio.pause();
      audio.src = '';
    } catch {
      // Already gone.
    }
    audio = null;
  }
}
