import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstWhepRoute, forgetWhepRouteBlocked, forgetWhepSilent, hasRealPicture, rememberWhepRouteBlocked, rememberWhepSilent, whepRecentlySilent, whepRouteBlocked } from './whep-memory';

describe('whep memory', () => {
  beforeEach(() => { localStorage.clear(); vi.useRealTimers(); });

  it('remembers a silent stream and forgets it once it plays', () => {
    expect(whepRecentlySilent('abc')).toBe(false);
    rememberWhepSilent('abc');
    expect(whepRecentlySilent('abc')).toBe(true);
    forgetWhepSilent('abc');
    expect(whepRecentlySilent('abc')).toBe(false);
  });

  it('tries WebRTC again after half an hour', () => {
    vi.useFakeTimers();
    rememberWhepSilent('abc');
    vi.advanceTimersByTime(31 * 60_000);
    expect(whepRecentlySilent('abc')).toBe(false);
  });

  it('opens the next live on the route after the one that carried no media', () => {
    expect(firstWhepRoute(true)).toBe('direct');
    rememberWhepRouteBlocked('direct');
    expect(firstWhepRoute(true)).toBe('relay');
    rememberWhepRouteBlocked('relay');
    expect(firstWhepRoute(true)).toBeNull();
    // A stream that is not on our ingest has one route and no memory of it.
    expect(firstWhepRoute(false)).toBe('direct');
  });

  it('gives a route back once it plays, and by itself after half an hour', () => {
    rememberWhepRouteBlocked('direct');
    forgetWhepRouteBlocked('direct');
    expect(whepRouteBlocked('direct')).toBe(false);
    vi.useFakeTimers();
    rememberWhepRouteBlocked('direct');
    vi.advanceTimersByTime(31 * 60_000);
    expect(firstWhepRoute(true)).toBe('direct');
  });

  it('keeps silent streams and blocked routes apart', () => {
    rememberWhepSilent('direct');
    expect(whepRouteBlocked('direct')).toBe(false);
    rememberWhepRouteBlocked('relay');
    expect(whepRecentlySilent('relay')).toBe(false);
  });

  it('does not count the 2x2 placeholder as a picture', () => {
    expect(hasRealPicture({ videoWidth: 2, videoHeight: 2 } as HTMLVideoElement)).toBe(false);
    expect(hasRealPicture({ videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement)).toBe(true);
  });
});
