/**
 * On-device dub playback: speaks translated transcript lines with the
 * browser's speech synthesiser in step with a <video>. Only reached through
 * the lazily loaded VoiceDubEngine, so it costs nothing until a dub plays.
 * The switch and voice picking are in dub-preference.ts.
 */
import { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '@/hooks/use-transcript';
import { synth } from '@/hooks/dub-preference';
import { getMediaVolume, useMediaVolume } from '@/lib/video-preferences';
import { applyVideoVolume, dubLevelGain, dubVoiceVolume, getDubMix, setDubMixActive, useDubMix } from '@/lib/dub-mix';

/** Characters per second a voice reads at rate 1, until this voice has been timed. */
const NATURAL_CPS = 14;
/** Past this a synthetic voice gets hard to follow. */
const MAX_RATE = 1.5;
/** How far past its own end a line may run, or start, before the picture wins. */
const MAX_LAG_S = 2.5;
/** A line may use this much of the silence after it. */
const BORROW_S = 1;
/** With less than this to speak in, a line is not worth starting. */
const MIN_ROOM_S = 0.8;

// How fast each voice really reads, timed on the lines it has finished. The
// guess above is wrong by a third for some voices, and a wrong guess is a
// line that does not fit.
const measuredCps = new Map<string, number>();

/** Seconds a line starting at `t` has: the rest of its span plus some of the silence after it. */
export function lineRoom(segments: TranscriptSegment[], i: number, t: number): number {
  const seg = segments[i];
  if (t - seg.end > MAX_LAG_S) return 0;
  const next = i + 1 < segments.length ? segments[i + 1].start : Infinity;
  return Math.max(0, seg.end - t) + Math.min(BORROW_S, Math.max(0, next - Math.max(seg.end, t)));
}

/* ──────────────────────────────── engine ────────────────────────────────── */

// The synthesiser is one per page, but several cards can mount an engine.
// Only the one that spoke last may cancel, so a card scrolling away does not
// silence the one being watched.
let speaker: object | null = null;

// One engine per <video>. A post opened over the feed shares the feed card's
// element, and two engines on it double every line.
const owners = new WeakMap<HTMLMediaElement, object>();

/**
 * Speak `segments` in `voice`, in step with the video. Pass null segments or
 * voice to stop. Each line starts when playback crosses its start. A line
 * still running when the next begins is left to finish: the next one waits
 * its turn and reads faster to catch up. Only a voice that has fallen well
 * behind the picture is cut, and a line with no time left is dropped whole
 * rather than chopped mid-word. `onFailed` fires when the
 * browser refuses to speak (iOS Safari without a prior gesture, a dead voice),
 * restoring the original audio to the viewer's level.
 */
export function useVoiceDub(
  videoRef: React.RefObject<HTMLMediaElement>,
  segments: TranscriptSegment[] | null,
  voice: SpeechSynthesisVoice | null,
  onFailed?: () => void,
) {
  const master = useMediaVolume();
  const mix = useDubMix();
  const reconcileRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const v = videoRef.current;
    const s = synth();
    if (!v || !s || !voice || !segments?.length) return;
    if (owners.has(v)) return;

    const me = {};
    owners.set(v, me);
    const voiceKey = voice.voiceURI || voice.name || voice.lang;
    let spoken = -1;
    // The line the picture reached while an earlier one was still being read.
    let pending = -1;
    let failed = false;
    let utterance: SpeechSynthesisUtterance | null = null;
    let spokenChar = 0;
    let resumeWord = { index: -1, offset: 0 };
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let speechVolume = dubVoiceVolume(getMediaVolume());
    const syncVolume = () => {
      setDubMixActive(v, !failed, dubLevelGain(getDubMix().original));
      applyVideoVolume(v, getMediaVolume());
    };

    const stop = () => {
      if (restartTimer !== null) clearTimeout(restartTimer);
      restartTimer = null;
      spoken = -1;
      pending = -1;
      utterance = null;
      if (speaker === me) { s.cancel(); speaker = null; }
    };

    const learn = (chars: number, seconds: number, rate: number) => {
      if (chars < 20 || seconds < 1) return;
      const seen = chars / (seconds * rate);
      if (!(seen > 6 && seen < 30)) return;
      const known = measuredCps.get(voiceKey);
      measuredCps.set(voiceKey, known ? known * 0.6 + seen * 0.4 : seen);
    };

    const indexAt = (t: number) => {
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].start <= t) return t < segments[i].end ? i : -1;
      }
      return -1;
    };

    const fail = () => {
      if (failed) return;
      failed = true;
      stop();
      syncVolume();
      onFailed?.();
    };

    const speak = (i: number, charOffset = 0) => {
      const seg = segments[i];
      if (lineRoom(segments, i, v.currentTime) < MIN_ROOM_S) return;
      utterance = null;
      spoken = i;
      pending = -1;
      spokenChar = charOffset;
      s.cancel();
      speaker = me;
      if (!seg.text.trim()) return;
      const u = new SpeechSynthesisUtterance(seg.text.slice(charOffset));
      utterance = u;
      u.voice = voice;
      u.lang = voice.lang;
      // Aim to end with the line's own span; a line starting after its span
      // aims for the silence it was given.
      const left = seg.end - v.currentTime;
      const duration = Math.max(0.5, left > 0 ? left : lineRoom(segments, i, v.currentTime));
      const needed = u.text.length / duration / (measuredCps.get(voiceKey) ?? NATURAL_CPS);
      u.rate = Math.min(MAX_RATE, Math.max(1, needed * (v.playbackRate || 1)));
      u.volume = dubVoiceVolume(getMediaVolume());
      let startedAt = 0;
      u.onboundary = (event) => { if (utterance === u) spokenChar = charOffset + event.charIndex; };
      u.onstart = () => {
        if (utterance !== u) return;
        if (v.paused || v.muted || dubVoiceVolume(getMediaVolume()) === 0) { stop(); return; }
        startedAt = performance.now();
      };
      const finish = () => {
        if (utterance !== u) return;
        utterance = null;
        if (speaker === me) speaker = null;
      };
      u.onend = () => {
        if (utterance !== u) return;
        if (startedAt) learn(u.text.length, (performance.now() - startedAt) / 1000, u.rate);
        finish();
        // Whatever the picture reached meanwhile starts now, not a tick later.
        tick();
      };
      // Cutting a line off for the next one reports 'interrupted'/'canceled';
      // anything else means this browser will not speak for us.
      u.onerror = (e) => {
        if (utterance !== u) return;
        if (e.error !== 'interrupted' && e.error !== 'canceled') fail();
        else finish();
      };
      try { s.speak(u); } catch { fail(); }
    };

    const tick = () => {
      if (failed || restartTimer !== null || v.paused || v.muted || v.seeking || dubVoiceVolume(getMediaVolume()) === 0) return;
      const t = v.currentTime;
      const i = indexAt(t);
      if (utterance && spoken >= 0) {
        if (i === spoken) return;
        // Still reading the last line: let it finish and hold the new one,
        // unless the voice is now too far behind the picture.
        if (t - segments[spoken].end <= MAX_LAG_S) {
          if (i >= 0) pending = i;
          return;
        }
        stop();
      }
      if (i >= 0) {
        if (i !== spoken) speak(i);
        return;
      }
      // Between lines: a line whose span passed while the last one was being
      // finished is read now if the silence leaves room for it.
      if (pending >= 0 && pending !== spoken) {
        const late = pending;
        pending = -1;
        speak(late);
      }
    };

    const onVolume = () => {
      syncVolume();
      if (v.muted || getMediaVolume() === 0) stop();
    };

    const reconcile = () => {
      syncVolume();
      const next = dubVoiceVolume(getMediaVolume());
      if (next === speechVolume) return;
      const previous = speechVolume;
      speechVolume = next;
      if (utterance) resumeWord = { index: spoken, offset: spokenChar };
      else if (restartTimer === null && previous > 0 && next > 0) return;
      stop();
      if (!next || failed || v.paused || v.muted) return;
      // Speech engines read volume when an utterance starts. Resume at the
      // current word after a drag settles so the live voice actually changes.
      restartTimer = setTimeout(() => {
        restartTimer = null;
        const i = indexAt(v.currentTime);
        if (i >= 0 && !v.paused && !v.muted && !v.seeking) speak(i, i === resumeWord.index ? resumeWord.offset : 0);
      }, 120);
    };
    reconcileRef.current = reconcile;

    v.addEventListener('pause', stop);
    v.addEventListener('seeking', stop);
    v.addEventListener('ended', stop);
    v.addEventListener('play', tick);
    v.addEventListener('seeked', tick);
    v.addEventListener('volumechange', onVolume);
    syncVolume();
    const timer = window.setInterval(tick, 100);
    tick();

    return () => {
      window.clearInterval(timer);
      v.removeEventListener('pause', stop);
      v.removeEventListener('seeking', stop);
      v.removeEventListener('ended', stop);
      v.removeEventListener('play', tick);
      v.removeEventListener('seeked', tick);
      v.removeEventListener('volumechange', onVolume);
      stop();
      if (reconcileRef.current === reconcile) reconcileRef.current = null;
      setDubMixActive(v, false, 1);
      applyVideoVolume(v, getMediaVolume());
      if (owners.get(v) === me) owners.delete(v);
    };
    // onFailed is a notification, not an input: a new callback identity must
    // not restart the engine mid-line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, segments, voice]);
  useEffect(() => { reconcileRef.current?.(); }, [master, mix.voice, mix.original]);
}
