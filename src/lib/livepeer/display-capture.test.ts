import { afterEach, describe, expect, it, vi } from 'vitest';
import { displaySurfaceOf, requestDisplayCapture, tuneDisplayTrack } from './display-capture';

function track(displaySurface?: string) {
  return { getSettings: () => ({ displaySurface }), contentHint: '' } as unknown as MediaStreamTrack;
}

describe('display capture', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the picked surface', () => {
    expect(displaySurfaceOf(track('window'))).toBe('window');
    expect(displaySurfaceOf(track('browser'))).toBe('browser');
    expect(displaySurfaceOf(track())).toBe('unknown');
    expect(displaySurfaceOf(null)).toBe('unknown');
  });

  it('treats windows, screens and tabs as motion', () => {
    const w = track('window');
    const m = track('monitor');
    const b = track('browser');
    tuneDisplayTrack(w);
    tuneDisplayTrack(m);
    tuneDisplayTrack(b);
    expect(w.contentHint).toBe('motion');
    expect(m.contentHint).toBe('motion');
    expect(b.contentHint).toBe('motion');
  });

  it('keeps Riftn in front and opens the picker with the share options', async () => {
    const setFocusBehavior = vi.fn();
    class FakeController {
      setFocusBehavior = setFocusBehavior;
    }
    vi.stubGlobal('CaptureController', FakeController);
    const video = track('window');
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    video.applyConstraints = applyConstraints;
    const getDisplayMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [video] });
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });

    const constraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
    await requestDisplayCapture(constraints);

    expect(setFocusBehavior).toHaveBeenCalledWith('no-focus-change');
    const opts = getDisplayMedia.mock.calls[0][0];
    expect(opts.video).toEqual(constraints);
    expect(opts.selfBrowserSurface).toBe('exclude');
    expect(opts.audio).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    expect(opts.controller).toBeInstanceOf(FakeController);
    expect(video.contentHint).toBe('motion');
    expect(applyConstraints).toHaveBeenCalledWith({ ...constraints, frameRate: { ideal: 30, min: 5 } });
  });

  it('keeps the selected browser tab if the minimum frame rate is unsupported', async () => {
    const video = track('browser');
    video.applyConstraints = vi.fn().mockRejectedValue(new DOMException('Unsupported', 'OverconstrainedError'));
    const stream = { getVideoTracks: () => [video] };
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });

    await expect(requestDisplayCapture({ frameRate: 30 })).resolves.toBe(stream);
    expect(video.applyConstraints).toHaveBeenCalledWith({ frameRate: { ideal: 30, min: 5 } });
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
  });

  it('still opens the picker where CaptureController is missing', async () => {
    vi.stubGlobal('CaptureController', undefined);
    const getDisplayMedia = vi.fn().mockResolvedValue({ getVideoTracks: () => [] });
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });
    await requestDisplayCapture({});
    expect(getDisplayMedia.mock.calls[0][0].controller).toBeUndefined();
  });
});
