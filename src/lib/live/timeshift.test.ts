import { describe, expect, it } from 'vitest';
import { behindForRatio, formatBehind, isBehindLive, liveEdgeSnap, timeForBehind, timelineSnap, TIMESHIFT_WINDOW_SEC } from './timeshift';

describe('live timeshift', () => {
  it('places the viewer on the last three minutes', () => {
    // 10 minutes kept, live at 600: the line starts at 420.
    const snap = timelineSnap(558, 600, 0, false);
    expect(snap.windowSec).toBe(TIMESHIFT_WINDOW_SEC);
    expect(snap.behind).toBe(42);
    expect(snap.ratio).toBeCloseTo((558 - 420) / 180);
  });

  it('spans only what exists early in a broadcast', () => {
    const snap = timelineSnap(20, 30, 5, true);
    expect(snap.windowSec).toBe(25);
    expect(snap.ratio).toBeCloseTo(15 / 25);
    expect(snap.paused).toBe(true);
  });

  it('counts a viewer ahead of the sync point as live', () => {
    const snap = timelineSnap(101, 100, 0, false);
    expect(snap.behind).toBe(0);
    expect(snap.ratio).toBe(1);
    expect(isBehindLive(snap)).toBe(false);
  });

  it('is behind past a few seconds only', () => {
    expect(isBehindLive({ behind: 2 })).toBe(false);
    expect(isBehindLive({ behind: 4 })).toBe(true);
    expect(isBehindLive(null)).toBe(false);
  });

  it('maps the line back to seconds and to a clock time', () => {
    expect(behindForRatio(0.5, 180)).toBe(90);
    expect(behindForRatio(1.2, 180)).toBe(0);
    expect(timeForBehind(600, 420, 90)).toBe(510);
    // Never before what is kept, never past live.
    expect(timeForBehind(600, 420, 500)).toBe(420.5);
    expect(timeForBehind(600, 420, -5)).toBe(600);
  });

  it('reads WebRTC as live, and a pending pause as how long ago', () => {
    expect(liveEdgeSnap(false).ratio).toBe(1);
    const paused = liveEdgeSnap(true, 45);
    expect(paused.behind).toBe(45);
    expect(paused.ratio).toBeCloseTo(0.75);
  });

  it('writes the gap the way the tag shows it', () => {
    expect(formatBehind(42)).toBe('−0:42');
    expect(formatBehind(125.4)).toBe('−2:05');
  });
});
