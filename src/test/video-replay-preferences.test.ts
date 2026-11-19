import { beforeEach, afterEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

it('defaults replay to off, resets the brief loop-on default once, and rejects an invalid stored loop value', async () => {
  const prefs = await import('@/lib/video-preferences');
  expect(prefs.getVideoPreferences().isLooping).toBe(false);
  // Scope 2 turned loop on for everyone; those blobs go back to off once.
  localStorage.setItem('video-preferences', JSON.stringify({ isLooping: true, loopScope: 2 }));
  vi.resetModules();
  expect((await import('@/lib/video-preferences')).getVideoPreferences().isLooping).toBe(false);
  localStorage.setItem('video-preferences', JSON.stringify({ isLooping: 'true', loopScope: 3 }));
  vi.resetModules();
  const reopened = await import('@/lib/video-preferences');
  expect(reopened.getVideoPreferences().isLooping).toBe(false);
});

it.each([true, false])('persists replay=%s before deferred notifications run', async looping => {
  const prefs = await import('@/lib/video-preferences');
  prefs.setIsLooping(looping);
  expect(JSON.parse(localStorage.getItem('video-preferences')!).isLooping).toBe(looping);
  vi.resetModules();
  const reopened = await import('@/lib/video-preferences');
  expect(reopened.getVideoPreferences().isLooping).toBe(looping);
});
