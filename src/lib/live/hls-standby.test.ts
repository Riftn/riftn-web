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

const bigEvents = new Set<string>();
const handedOver = new Set<string>();
vi.mock('@/lib/live-ingest', () => ({
  liveSourceFromHlsUrl: (url?: string) => {
    const m = url ? /^https:\/\/(live|livepeer)\.example\/([^/]+)\//.exec(url) : null;
    return m ? { provider: m[1] === 'live' ? 'mediamtx' : 'livepeer', playbackId: m[2] } : null;
  },
  isAacCopyUrl: (url?: string) => !!url && url.includes('-aac/'),
  isBigEventPlayback: (url?: string) => !!url && [...bigEvents].some((id) => url.includes(`/${id}/`)),
}));
vi.mock('@/lib/live-handoff', () => ({
  peekLiveSession: (id?: string | null) => (id && handedOver.has(id) ? {} : null),
}));

const { dropWarmLiveHls, takeWarmLiveHls, warmLiveHls, warmLiveStandbyFor, warmNativeLiveHls } = await import('./hls-standby');

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let n = 0;
const nextUrl = () => `https://live.example/${++n}/index.m3u8`;

it('starts only the on-demand AAC copy for native playback and can cancel the request', () => {
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('#EXTM3U'));
  const aac = 'https://live.example/stream-aac/index.m3u8';
  try {
    expect(warmNativeLiveHls(undefined)).toBeUndefined();
    expect(warmNativeLiveHls(nextUrl())).toBeUndefined();
    const stop = warmNativeLiveHls(aac);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(aac, { signal: expect.any(AbortSignal) });
    const signal = request.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    stop?.();
    expect(signal?.aborted).toBe(true);
  } finally {
    request.mockRestore();
  }
});

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

describe('a live started loading before its player is drawn', () => {
  beforeEach(() => {
    made.length = 0;
    bigEvents.clear();
    handedOver.clear();
  });

  const live = (extra: Record<string, unknown> = {}) => {
    const url = nextUrl();
    return { url, stream: { isLive: true, playbackUrl: url, playbackUrls: [url], ...extra } };
  };

  it('loads a live stream and hands the player the same instance', async () => {
    const { url, stream } = live();
    warmLiveStandbyFor(stream);
    await settle();
    expect(made).toHaveLength(1);
    expect(made[0].source).toBe(url);
    expect(made[0].config.lowLatencyMode).toBe(true);

    // The player asks again when it mounts: no second download.
    const heard = vi.fn();
    warmLiveHls(url, {}, heard);
    made[0].emit('levelLoaded', { details: { targetduration: 8 } });
    expect(heard).toHaveBeenCalledWith(8);
    expect(made).toHaveLength(1);
    expect((await takeWarmLiveHls(url))?.hls).toBe(made[0]);
  });

  it.each([
    ['is over', { isLive: false }],
    ['is pay per view', { isPPV: true }],
    ['is locked to holders', { isLocked: true }],
    ['is for subscribers', { subscriberPlans: [{}] }],
    ['is marked mature', { contentRating: 'mature' }],
  ])('leaves a stream that %s alone', async (_, extra) => {
    warmLiveStandbyFor(live(extra).stream);
    await settle();
    expect(made).toHaveLength(0);
  });

  it('leaves a big event, a Livepeer stream and a handed-over session alone', async () => {
    const event = live();
    bigEvents.add(event.url.split('/')[3]);
    warmLiveStandbyFor(event.stream);

    const livepeer = 'https://livepeer.example/abc/index.m3u8';
    warmLiveStandbyFor({ isLive: true, playbackUrl: livepeer });

    const handed = live();
    handedOver.add(handed.url.split('/')[3]);
    warmLiveStandbyFor(handed.stream);

    warmLiveStandbyFor(null);
    await settle();
    expect(made).toHaveLength(0);
  });
});
