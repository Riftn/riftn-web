import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Music2, Pause, Play } from 'lucide-react';
import { getAudioPostPlaybackState, pauseAudioPost, useAudioPostPlayback } from '@/lib/audio-post-playback';
import {
  profileSongAutoplayAllowed,
  readProfileSong,
  setProfileSongAutoplayAllowed,
  type ProfileSong as Song,
} from '@/lib/profile-song';
import './profile-song.css';

const FADE_IN_MS = 2000;
const FADE_OUT_S = 1.2;

/** Something on the page is already making sound (a video with sound, a voice note). */
function pageIsPlaying(except: HTMLMediaElement | null): boolean {
  if (getAudioPostPlaybackState().isPlaying) return true;
  return Array.from(document.querySelectorAll<HTMLMediaElement>('audio, video')).some(
    (m) => m !== except && !m.paused && !m.muted && m.volume > 0,
  );
}

/**
 * The song under a profile's bio. Tap to play the part the owner picked.
 * When the owner switched on "Play when people visit", it starts by itself,
 * fading in, for visitors (not for the owner). A visitor who stops a song that
 * started by itself won't get any more that start by themselves, until they
 * play one on purpose. One sound at a time: it stops when anything else on
 * the page starts, and doesn't start over it.
 */
export function ProfileSong({ customs, isOwn, profileKey }: { customs?: Record<string, unknown> | null; isOwn?: boolean; profileKey?: string }) {
  const song = useMemo(() => readProfileSong(customs ?? null), [customs]);
  if (!song) return null;
  return <ProfileSongRow key={`${profileKey ?? ''}:${song.url}:${song.start}`} song={song} isOwn={!!isOwn} />;
}

export function ProfileSongRow({ song, isOwn, autoStart = true }: { song: Song; isOwn: boolean; /** State gallery: never start. */ autoStart?: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const auto = useRef(false);
  const fade = useRef<number | null>(null);
  const corner = useAudioPostPlayback();

  const stopFade = () => {
    if (fade.current != null) cancelAnimationFrame(fade.current);
    fade.current = null;
  };

  const pause = useCallback((byVisitor: boolean) => {
    const el = ref.current;
    stopFade();
    if (el) {
      try { el.pause(); } catch { /* released */ }
      try { el.volume = 1; } catch { /* iPhone */ }
    }
    if (byVisitor && auto.current) setProfileSongAutoplayAllowed(false);
    auto.current = false;
    setPlaying(false);
  }, []);

  const start = useCallback((byItself: boolean) => {
    const el = ref.current;
    if (!el) return;
    if (!byItself) {
      // Playing one on purpose: profile songs may start by themselves again.
      setProfileSongAutoplayAllowed(true);
      if (getAudioPostPlaybackState().isPlaying) pauseAudioPost();
      document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((m) => {
        if (m !== el && !m.paused && !m.muted) { try { m.pause(); } catch { /* released */ } }
      });
    }
    if (el.currentTime < song.start || el.currentTime >= song.end - 0.25) {
      try { el.currentTime = song.start; } catch { /* not loaded: seeks on loadedmetadata */ }
    }
    auto.current = byItself;
    stopFade();
    let canFade = false;
    if (byItself) {
      try { el.volume = 0; canFade = el.volume === 0; } catch { canFade = false; }
    }
    el.play().then(() => {
      setPlaying(true);
      if (!canFade) return;
      const began = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - began) / FADE_IN_MS);
        try { el.volume = k * k; } catch { /* released */ }
        fade.current = k < 1 ? requestAnimationFrame(step) : null;
      };
      fade.current = requestAnimationFrame(step);
    }).catch(() => {
      // Blocked (no tap on the page yet) or failed: stay on the play button.
      try { el.volume = 1; } catch { /* iPhone */ }
      auto.current = false;
      setPlaying(false);
    });
  }, [song.start, song.end]);

  // Plays by itself for visitors, a moment after the profile opens.
  useEffect(() => {
    if (!autoStart || isOwn || !song.autoplay || !profileSongAutoplayAllowed()) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible' || pageIsPlaying(ref.current)) return;
      start(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autoStart, isOwn, song.autoplay, start]);

  // Stop when anything else starts making sound.
  useEffect(() => {
    const onPlay = (e: Event) => {
      const target = e.target as HTMLMediaElement | null;
      if (!target || target === ref.current || target.muted) return;
      if (ref.current && !ref.current.paused) pause(false);
    };
    document.addEventListener('play', onPlay, true);
    return () => document.removeEventListener('play', onPlay, true);
  }, [pause]);
  useEffect(() => {
    if (corner.isPlaying && ref.current && !ref.current.paused) pause(false);
  }, [corner.isPlaying, pause]);

  // Leaving the profile or the tab stops it.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') pause(false); };
    document.addEventListener('visibilitychange', onHide);
    const el = ref.current;
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      stopFade();
      try { el?.pause(); } catch { /* released */ }
    };
  }, [pause]);

  const onTime = () => {
    const el = ref.current;
    if (!el) return;
    const at = el.currentTime;
    setProgress(Math.max(0, Math.min(1, (at - song.start) / (song.end - song.start))));
    // Soft ending at the end of the part.
    const left = song.end - at;
    if (left < FADE_OUT_S && left > 0 && fade.current == null) {
      try { el.volume = Math.max(0, left / FADE_OUT_S); } catch { /* iPhone */ }
    }
    if (at >= song.end) {
      pause(false);
      setProgress(0);
      try { el.currentTime = song.start; } catch { /* released */ }
    }
  };

  const label = playing
    ? t('profileSong.pause', { defaultValue: 'Pause {{title}}', title: song.title })
    : t('profileSong.play', { defaultValue: 'Play {{title}}', title: song.title });

  return (
    <button
      type="button"
      data-profile-song
      data-playing={playing ? 'true' : 'false'}
      aria-label={label}
      aria-pressed={playing}
      onClick={(e) => {
        e.stopPropagation();
        if (playing) pause(true);
        else start(false);
      }}
      className="text-white"
    >
      {song.artwork
        ? <img src={song.artwork} alt="" className="ps-art" loading="lazy" />
        : <span className="ps-art"><Music2 className="h-4 w-4" /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-white">{song.title}</span>
        {song.artist && <span className="block truncate text-[12.5px] text-zinc-400">{song.artist}</span>}
      </span>
      {playing && <span className="ps-eq" aria-hidden><i /><i /><i /><i /></span>}
      <span className="ps-btn" aria-hidden>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</span>
      <span className="ps-bar" aria-hidden style={{ transform: `scaleX(${progress})`, opacity: playing ? 1 : 0, transition: 'transform 260ms linear, opacity 200ms ease' }} />
      <audio
        ref={ref}
        src={song.url}
        preload="none"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (el.currentTime < song.start) { try { el.currentTime = song.start; } catch { /* not seekable yet */ } }
        }}
        onTimeUpdate={onTime}
        onEnded={() => { pause(false); setProgress(0); }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
    </button>
  );
}
