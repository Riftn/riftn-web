import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('where a viewer hangs up', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_MEDIAMTX_HOST', 'live.dehub.io');
  });

  it('sends the hang-up for a session on the ingest host through the signaling edge', async () => {
    const { whepHangUpUrl } = await import('@/lib/live-ingest');
    expect(whepHangUpUrl('https://live.dehub.io/abc123/whep/0f0e-session')).toBe(
      'https://api.dehub.io/live-edge/abc123/whep/0f0e-session',
    );
  });

  it('leaves every other session where it is', async () => {
    const { whepHangUpUrl } = await import('@/lib/live-ingest');
    const edge = 'https://api.dehub.io/live-edge/abc123/whep/0f0e-session';
    expect(whepHangUpUrl(edge)).toBe(edge);
    const livepeer = 'https://lon-prod-catalyst-1.lp-playback.studio/webrtc/abc123/session';
    expect(whepHangUpUrl(livepeer)).toBe(livepeer);
    expect(whepHangUpUrl('https://live.dehub.io/abc123/index.m3u8')).toBe('https://live.dehub.io/abc123/index.m3u8');
    expect(whepHangUpUrl('not a url')).toBe('not a url');
  });
});
