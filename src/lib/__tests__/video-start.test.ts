import { describe, expect, it, vi } from 'vitest';
import { requestVideoPlayback } from '../video-start';

describe('video startup', () => {
  it('submits play immediately without waiting for metadata', () => {
    const player = { error: null, load: vi.fn(), play: vi.fn().mockResolvedValue(undefined) };
    requestVideoPlayback(player);
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.load).not.toHaveBeenCalled();
  });

  it('rewinds an ended video before play without reloading its source', async () => {
    const player = {
      ended: true,
      currentTime: 12,
      error: null,
      load: vi.fn(),
      play: vi.fn(async () => { expect(player.currentTime).toBe(0); }),
    };
    await requestVideoPlayback(player);
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.load).not.toHaveBeenCalled();
  });

  it('clears a failed media source before retrying play', async () => {
    const order: string[] = [];
    const player = {
      error: {} as MediaError,
      load: vi.fn(() => { order.push('load'); }),
      play: vi.fn(() => { order.push('play'); return Promise.resolve(); }),
    };
    await requestVideoPlayback(player);
    expect(order).toEqual(['load', 'play']);
  });

  it('propagates a failed play request to the card', async () => {
    const error = new Error('offline');
    const player = { error: null, load: vi.fn(), play: vi.fn().mockRejectedValue(error) };
    await expect(requestVideoPlayback(player)).rejects.toBe(error);
  });
});
