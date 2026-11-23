import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: string, data: unknown) => void;

const made: FakeHls[] = [];

class FakeHls {
  static Events = { LEVEL_LOADED: 'levelLoaded', ERROR: 'error' };
  static isSupported = () => true;
  handlers = new Map<string, Set<Handler>>();
  destroyed = false;
  source: string | null = null;
  constructor(public config: Record<string, unknown>) {
    made.push(this);
  }
  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }
  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }
  emit(event: string, data: unknown) {
    this.handlers.get(event)?.forEach((handler) => handler(event, data));
  }
  loadSource(url: string) {
    this.source = url;
  }
  destroy() {
    this.destroyed = true;
  }
}

vi.mock('hls.js', () => ({ default: FakeHls }));

const { dropWarmLiveHls, takeWarmLiveHls, warmLiveHls } = await import('./hls-standby');

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let n = 0;
const nextUrl = () => `https://live.example/${++n}/index.m3u8`;

describe('HLS made ready while WebRTC tries', () => {
  beforeEach(() => {
    made.length = 0;
  });

  it('loads the playlists in the background and hands the same player over', async () => {
    const url = nextUrl();
    warmLiveHls(url, { lowLatencyMode: true });
    await settle();
    expect(made).toHaveLength(1);
    expect(made[0].source).toBe(url);
    expect(made[0].config.startFragPrefetch).toBe(true);

    const taken = await takeWarmLiveHls(url);
    expect(taken?.hls).toBe(made[0]);
    expect(made[0].destroyed).toBe(false);
    // Handed over once: the caller owns it now.
    expect(takeWarmLiveHls(url)).toBeNull();
  });

  it('lets a feed tile stop at the playlists', async () => {
    const url = nextUrl();
    warmLiveHls(url, { startFragPrefetch: false });
    await settle();
    expect(made[0].config.startFragPrefetch).toBe(false);
    dropWarmLiveHls(url);
  });

  it('reports how far apart the keyframes are, once', async () => {
    const url = nextUrl();
    const heard = vi.fn();
    warmLiveHls(url, {}, heard);
    await settle();
    made[0].emit('levelLoaded', { details: { targetduration: 8 } });
    made[0].emit('levelLoaded', { details: { targetduration: 2 } });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith(8);

    // A second caller for the same live gets the answer at once.
    const late = vi.fn();
    warmLiveHls(url, {}, late);
    expect(late).toHaveBeenCalledWith(8);
    expect(made).toHaveLength(1);
    dropWarmLiveHls(url);
  });

  it('is thrown away when WebRTC shows its picture', async () => {
    const url = nextUrl();
    warmLiveHls(url, {});
    await settle();
    dropWarmLiveHls(url);
    await settle();
    expect(made[0].destroyed).toBe(true);
    expect(takeWarmLiveHls(url)).toBeNull();
  });

  it('closes itself on an error that stops loading, so the player builds its own', async () => {
    const url = nextUrl();
    warmLiveHls(url, {});
    await settle();
    made[0].emit('error', { fatal: true });
    await settle();
    expect(made[0].destroyed).toBe(true);
    expect(takeWarmLiveHls(url)).toBeNull();
  });
});
