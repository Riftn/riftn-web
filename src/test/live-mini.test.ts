import { describe, expect, it, vi } from 'vitest';
import { claimLiveMini, closeLiveMini, getLiveMini, openLiveMini, setLiveMiniMode } from '@/lib/live-mini';

const base = (streamId: string, seat: { leave: () => void } | null = null) => ({
  streamId,
  playbackId: null,
  urls: ['https://example.com/a.m3u8'],
  title: 'Live',
  host: '@host',
  path: '/app/post/1',
  session: null,
  seat,
});

describe('live mini', () => {
  it('opens in the corner window and switches to the listen bar', () => {
    openLiveMini(base('a'));
    expect(getLiveMini()?.mode).toBe('video');
    setLiveMiniMode('listen');
    expect(getLiveMini()?.mode).toBe('listen');
    closeLiveMini();
    expect(getLiveMini()).toBeNull();
  });

  it('gives up the seat when closed', () => {
    const leave = vi.fn();
    openLiveMini(base('a', { leave }));
    closeLiveMini();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('opening another live closes the first', () => {
    const leave = vi.fn();
    openLiveMini(base('a', { leave }));
    openLiveMini(base('b'));
    expect(leave).toHaveBeenCalledTimes(1);
    expect(getLiveMini()?.streamId).toBe('b');
    closeLiveMini();
  });

  it('hands the seat back to the same live with an overlap, no leave then join', () => {
    vi.useFakeTimers();
    const leave = vi.fn();
    openLiveMini(base('a', { leave }));
    claimLiveMini('a', null);
    expect(getLiveMini()).toBeNull();
    expect(leave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(6000);
    expect(leave).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('a different live opening closes it straight away', () => {
    const leave = vi.fn();
    openLiveMini(base('a', { leave }));
    claimLiveMini('b', null);
    expect(getLiveMini()).toBeNull();
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
