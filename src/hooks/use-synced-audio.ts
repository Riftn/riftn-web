import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { bindSoundWindow, mixGain, soundMix, soundTimeFor } from '@/lib/sound-window';
import { applyVideoVolume, setSongMixGain } from '@/lib/dub-volume';
import { claimHandoffAudio, getHandoffAudio, isHandoffAudioActive, releaseHandoffAudio, setHandoffAudio, subscribeHandoffAudio } from '@/lib/audio-handoff';

interface UseSyncedAudioOptions {
  mediaKey: string;
  soundtrackUrl?: string;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  videoRef: React.RefObject<HTMLVideoElement>;
}

/** The soundtrack travels with the video instead of rebuilding on navigation. */
export function useSyncedAudio({ mediaKey, soundtrackUrl, isPlaying, isMuted, volume, videoRef }: UseSyncedAudioOptions) {
  const surfaceActive = useContext(CachedPageActiveContext);
  const key = soundtrackUrl ? `synced:${mediaKey}:${soundtrackUrl}` : '';
  const token = useRef<object | null>(null);
  const [, refresh] = useState(0);
  useLayoutEffect(() => {
    if (!key || !soundtrackUrl || !surfaceActive) return;
    token.current = claimHandoffAudio(key, () => videoRef.current, mediaKey);
    if (!getHandoffAudio(key, token.current)) {
      const el = new Audio();
      el.preload = 'none';
      el.src = soundtrackUrl;
      bindSoundWindow(el);
      setHandoffAudio(key, token.current, { el, source: null, analyser: null });
    }
    const unsubscribe = subscribeHandoffAudio(key, () => refresh(version => version + 1));
    refresh(version => version + 1);
    return () => {
      unsubscribe();
      releaseHandoffAudio(key, token.current!);
      token.current = null;
    };
  }, [key, soundtrackUrl, videoRef, surfaceActive, mediaKey]);
  const active = isHandoffAudioActive(key, token.current);
  useEffect(() => {
    const audio = getHandoffAudio(key, token.current)?.el;
    const video = videoRef.current;
    if (!active || !audio || !video) return;
    // The poster sets how loud the song and the video's own sound are;
    // old posts carry no levels and play the song alone.
    const mix = soundMix(soundtrackUrl);
    audio.muted = isMuted || mix.song === 0;
    audio.volume = Math.max(0, Math.min(1, volume)) * mixGain(mix.song);
    audio.playbackRate = video.playbackRate;
    setSongMixGain(video, mixGain(mix.video));
    applyVideoVolume(video, volume);
    video.muted = isMuted || mix.video === 0;
    if (!video.paused) {
      const target = soundTimeFor(soundtrackUrl, video.currentTime);
      if (Math.abs(audio.currentTime - target) > 0.3) audio.currentTime = target;
      if (audio.paused) audio.play().catch(() => {});
    } else audio.pause();
  }, [active, key, isPlaying, isMuted, volume, videoRef, soundtrackUrl]);
  // Once the song lets go, the video's own sound is back at full level.
  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;
    return () => { setSongMixGain(video, null); };
  }, [active, videoRef]);
  useEffect(() => {
    const video = videoRef.current;
    const audio = getHandoffAudio(key, token.current)?.el;
    if (!active || !video || !audio) return;
    const owns = () => isHandoffAudioActive(key, token.current) && videoRef.current === video;
    const sync = () => {
      if (!owns()) return;
      audio.playbackRate = video.playbackRate;
      // A post can use one part of the song; the part loops under the video.
      const target = soundTimeFor(soundtrackUrl, video.currentTime);
      if (Math.abs(audio.currentTime - target) > 0.3) audio.currentTime = target;
    };
    const pause = () => { if (owns()) audio.pause(); };
    const play = () => { if (owns() && !video.paused && audio.paused) { sync(); audio.play().catch(() => {}); } };
    const events = { seeked: sync, timeupdate: sync, ratechange: sync, waiting: pause, pause, ended: pause, playing: play };
    Object.entries(events).forEach(([name, callback]) => video.addEventListener(name, callback));
    return () => Object.entries(events).forEach(([name, callback]) => video.removeEventListener(name, callback));
  }, [active, key, videoRef, soundtrackUrl]);
  return { hasSoundtrack: !!soundtrackUrl };
}
