import { describe, expect, it, vi } from 'vitest';
import { watchFrozenPicture } from '../frozen-picture';
vi.mock('../logger', () => ({ logToBackend: vi.fn() }));

function fakeVideo() {
  const video = document.createElement('video');
  let cb: ((now: number, meta: { mediaTime: number }) => void) | null = null;
  const state = { time: 0, paused: false };
  Object.defineProperty(video, 'paused', { get: () => state.paused });
  Object.defineProperty(video, 'readyState', { get: () => 4 });
  Object.defineProperty(video, 'currentTime', { get: () => state.time, set: vi.fn() });
  (video as any).requestVideoFrameCallback = (f: typeof cb) => { cb = f; return 1; };
  (video as any).cancelVideoFrameCallback = vi.fn();
  const paint = (t: number) => cb?.(0, { mediaTime: t });
  const tick = (t: number) => { state.time = t; video.dispatchEvent(new Event('timeupdate')); };
  const setter = Object.getOwnPropertyDescriptor(video, 'currentTime')!.set as ReturnType<typeof vi.fn>;
  return { video, paint, tick, setter, state };
}

describe('frozen picture watchdog', () => {
  it('nudges when the clock runs on but no frame paints', () => {
    const { video, paint, tick, setter } = fakeVideo();
    const stop = watchFrozenPicture(video, 'Test', '1');
    paint(1); tick(1.2); tick(2); expect(setter).not.toHaveBeenCalled();
    tick(2.6); expect(setter).toHaveBeenCalledTimes(1);
    stop();
  });
  it('leaves a painting or paused video alone', () => {
    const { video, paint, tick, setter, state } = fakeVideo();
    const stop = watchFrozenPicture(video, 'Test', '1');
    for (let t = 0; t < 5; t += 0.25) { paint(t); tick(t + 0.1); }
    state.paused = true; tick(9);
    expect(setter).not.toHaveBeenCalled();
    stop();
  });
});
