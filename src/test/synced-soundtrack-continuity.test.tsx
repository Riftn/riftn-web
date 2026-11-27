import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSyncedAudio } from '@/hooks/use-synced-audio';
import { handoffAudioFor } from '@/lib/audio-handoff';

const key = 'synced:test-post:https://example.com/sound.mp3';
function Surface({ video }: { video: HTMLVideoElement }) {
  const ref = useRef(video);
  useSyncedAudio({ mediaKey: 'test-post', soundtrackUrl: 'https://example.com/sound.mp3', isPlaying: true, isMuted: false, volume: 0.7, videoRef: ref });
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
});
afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('keeps the same soundtrack and playback choices while the video changes surfaces', () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  video.currentTime = 12;
  video.playbackRate = 1.5;
  const view = render(<><Surface video={video} /><span /></>);
  const audio = handoffAudioFor(key)!;
  expect(audio.currentTime).toBe(12);
  expect(audio.playbackRate).toBe(1.5);
  expect(audio.volume).toBe(0.7);
  expect(audio.paused).toBe(false);
  const plays = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
  view.rerender(<><Surface video={video} /><Surface video={video} /></>);
  expect(handoffAudioFor(key)).toBe(audio);
  expect(audio.paused).toBe(false);
  view.rerender(<><Surface video={video} /><span /></>);
  expect(handoffAudioFor(key)).toBe(audio);
  expect(audio.currentTime).toBe(12);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(plays);
});

it('plays the song and the video sound at the levels the poster set', () => {
  const url = 'https://example.com/mix.mp3#sv=80&vv=40';
  function Mixed({ video }: { video: HTMLVideoElement }) {
    const ref = useRef(video);
    useSyncedAudio({ mediaKey: 'mix-post', soundtrackUrl: url, isPlaying: true, isMuted: false, volume: 1, videoRef: ref });
    return null;
  }
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  render(<Mixed video={video} />);
  const audio = handoffAudioFor(`synced:mix-post:${url}`)!;
  expect(audio.volume).toBeCloseTo(0.64);
  expect(video.muted).toBe(false);
  expect(video.volume).toBeCloseTo(0.16);
});

it('keeps the video silent under a song on posts without levels', () => {
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  render(<Surface video={video} />);
  expect(video.muted).toBe(true);
});
