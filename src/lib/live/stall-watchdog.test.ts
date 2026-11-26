import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchLiveProgress } from './stall-watchdog';

function fakeVideo() {
  return { currentTime: 0, paused: false, getVideoPlaybackQuality: () => ({ totalVideoFrames: 0, droppedVideoFrames: 0 }) } as unknown as HTMLVideoElement & { currentTime: number; paused: boolean };
}

describe('watchLiveProgress', () => {
  afterEach(() => vi.useRealTimers());

  it('reports a frozen picture and counts repeats', () => {
    vi.useFakeTimers();
    const video = fakeVideo();
    const onStall = vi.fn();
    const stop = watchLiveProgress(video, { stallMs: 6000, onStall });
    vi.advanceTimersByTime(6000);
    expect(onStall).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(6000);
    expect(onStall).toHaveBeenLastCalledWith(2);
    stop();
  });

  it('stays quiet while the clock moves or the video is paused', () => {
    vi.useFakeTimers();
    const video = fakeVideo();
    const onStall = vi.fn();
    const stop = watchLiveProgress(video, { stallMs: 4000, onStall });
    for (let i = 0; i < 5; i++) { video.currentTime += 2; vi.advanceTimersByTime(2000); }
    video.paused = true;
    vi.advanceTimersByTime(20000);
    expect(onStall).not.toHaveBeenCalled();
    stop();
  });

  it('catches a frozen WebRTC picture even when audio and dropped frames advance', () => {
    vi.useFakeTimers();
    const video = fakeVideo();
    const quality = { totalVideoFrames: 20, droppedVideoFrames: 0 } as VideoPlaybackQuality;
    video.getVideoPlaybackQuality = () => quality;
    const onStall = vi.fn();
    const stop = watchLiveProgress(video, { stallMs: 6000, onStall, preferVideoFrames: () => true });
    for (let i = 0; i < 3; i++) {
      video.currentTime += 2;
      Object.assign(quality, { totalVideoFrames: 21 + i, droppedVideoFrames: 1 + i });
      vi.advanceTimersByTime(2000);
    }
    expect(onStall).toHaveBeenCalledExactlyOnceWith(1);
    stop();
  });

  it('uses the clock when WebRTC does not expose a frame count', () => {
    vi.useFakeTimers();
    const video = fakeVideo();
    const onStall = vi.fn();
    const stop = watchLiveProgress(video, { stallMs: 6000, onStall, preferVideoFrames: () => true });
    for (let i = 0; i < 3; i++) {
      video.currentTime += 2;
      vi.advanceTimersByTime(2000);
    }
    expect(onStall).not.toHaveBeenCalled();
    stop();
  });

  it('checks a floating video while its tab is hidden', () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const video = Object.assign(fakeVideo(), { webkitPresentationMode: 'inline' });
    const onStall = vi.fn();
    const stop = watchLiveProgress(video, { stallMs: 6000, onStall, watchInPictureInPicture: true });
    try {
      vi.advanceTimersByTime(6000);
      expect(onStall).not.toHaveBeenCalled();
      video.webkitPresentationMode = 'picture-in-picture';
      vi.advanceTimersByTime(6000);
      expect(onStall).toHaveBeenCalledOnce();
    } finally {
      stop();
      visibility.mockRestore();
    }
  });

  it('recovers a player that stayed paused after handoff, but respects an intentional pause', () => {
    vi.useFakeTimers();
    const video = fakeVideo();
    video.paused = true;
    let wantsPlayback = true;
    const onStall = vi.fn();
    const stop = watchLiveProgress(video, {
      stallMs: 6000,
      shouldWatch: () => wantsPlayback,
      watchWhilePaused: true,
      onStall,
    });
    vi.advanceTimersByTime(6000);
    expect(onStall).toHaveBeenCalledOnce();
    wantsPlayback = false;
    vi.advanceTimersByTime(12000);
    expect(onStall).toHaveBeenCalledOnce();
    stop();
  });
});
