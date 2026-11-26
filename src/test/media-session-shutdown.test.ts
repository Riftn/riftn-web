import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimMediaSession, releaseMediaSession, suspendPageMediaSessions } from '@/lib/media-session';

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pageshow'));
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('page playback shutdown', () => {
  it('pauses detached players during a Story, including late requests', async () => {
    const pause = vi.fn();
    const stop = vi.fn();
    const latePause = vi.fn();
    claimMediaSession('radio', { title: 'Radio' }, { pause, stop });
    const resume = suspendPageMediaSessions();
    try {
      expect(pause).toHaveBeenCalledOnce();
      expect(stop).not.toHaveBeenCalled();
      claimMediaSession('late', { title: 'Late' }, { pause: latePause });
      await Promise.resolve();
      expect(latePause).toHaveBeenCalledOnce();
    } finally {
      resume();
    }
    claimMediaSession('late', { title: 'Late' }, { pause: latePause });
    await Promise.resolve();
    expect(latePause).toHaveBeenCalledOnce();
  });

  it('stops detached players even without the Media Session API', () => {
    const stop = vi.fn();
    claimMediaSession('radio', { title: 'Radio' }, { stop });
    window.dispatchEvent(new Event('pagehide'));
    expect(stop).toHaveBeenCalledOnce();
  });

  it('stops every registered player and mounted video despite a failed cleanup', () => {
    const pause = vi.fn();
    const video = document.createElement('video');
    document.body.append(video);
    const pauseVideo = vi.spyOn(video, 'pause').mockImplementation(() => {});
    claimMediaSession('broken', { title: 'Broken' }, { stop: () => { throw Error(); } });
    claimMediaSession('recording', { title: 'Recording' }, { pause });
    window.dispatchEvent(new Event('pagehide'));
    expect(pause).toHaveBeenCalledOnce();
    expect(pauseVideo).toHaveBeenCalledOnce();
  });

  it('preserves background listening and unregisters released players', () => {
    const stop = vi.fn();
    claimMediaSession('radio', { title: 'Radio' }, { stop });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stop).not.toHaveBeenCalled();
    releaseMediaSession('radio');
    window.dispatchEvent(new Event('pagehide'));
    expect(stop).not.toHaveBeenCalled();
  });

  it('rejects late playback until the cached page is restored', () => {
    window.dispatchEvent(new Event('pagehide'));
    const stop = vi.fn();
    claimMediaSession('late', { title: 'Late' }, { stop });
    expect(stop).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('pageshow'));
    claimMediaSession('late', { title: 'Late' }, { stop });
    expect(stop).toHaveBeenCalledOnce();
  });
});
