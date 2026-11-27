import { beforeEach, describe, expect, it, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return import('@/lib/video-preferences');
}

describe('video speed memory', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a speed picked on one creator away from everyone else', async () => {
    const prefs = await load();
    prefs.setPlaybackRate(2, '0xAbC');
    expect(prefs.getPlaybackRateFor('0xabc')).toBe(2);
    expect(prefs.getPlaybackRateFor('0xdef')).toBe(1);
    expect(prefs.getPlaybackRateFor()).toBe(1);
  });

  it.each([undefined, 2])('puts a browser left at 2x back to normal speed once (scope %s), creators included', async (scope) => {
    localStorage.setItem('video-preferences', JSON.stringify({ playbackRate: 2, rateScope: scope, ratesByCreator: { '0xabc': 2 } }));
    const prefs = await load();
    expect(prefs.getPlaybackRateFor('0xdef')).toBe(1);
    expect(prefs.getPlaybackRateFor('0xabc')).toBe(1);
  });

  it('keeps speeds picked after the clear-out', async () => {
    const first = await load();
    first.setPlaybackRate(1.5, '0xabc');
    await new Promise((r) => setTimeout(r, 5));
    const prefs = await load();
    expect(prefs.getPlaybackRateFor('0xabc')).toBe(1.5);
  });

  it('still remembers the general speed for players with no creator', async () => {
    const prefs = await load();
    prefs.setPlaybackRate(1.5);
    expect(prefs.getPlaybackRateFor()).toBe(1.5);
  });
});
