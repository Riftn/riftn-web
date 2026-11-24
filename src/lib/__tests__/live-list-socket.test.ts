import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Set<Handler>>();
const fakeSocket = {
  connected: false,
  on: vi.fn((event: string, fn: Handler) => { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(fn); }),
  off: vi.fn((event: string, fn: Handler) => { handlers.get(event)?.delete(fn); }),
};
const fire = (event: string, ...args: unknown[]) => handlers.get(event)?.forEach(fn => fn(...args));
const release = vi.fn();

vi.mock('@/lib/api/dehub/stream-presence', () => ({
  acquireStreamSocket: () => ({ socket: fakeSocket }),
  releaseStreamSocket: (conn: unknown) => release(conn),
}));

import { watchLiveList, LIVE_LIST_CHANGED } from '@/lib/api/dehub/live-list-socket';

describe('watchLiveList', () => {
  beforeEach(() => { handlers.clear(); release.mockClear(); fakeSocket.connected = false; });

  it('passes on the backend ping', () => {
    const onChange = vi.fn();
    watchLiveList(onChange);
    fire(LIVE_LIST_CHANGED, { streamId: 's1', status: 'live' });
    expect(onChange).toHaveBeenCalledWith({ streamId: 's1', status: 'live' });
  });

  it('re-reads after a reconnect, not on the first connect', () => {
    const onChange = vi.fn();
    watchLiveList(onChange);
    fire('connect');
    expect(onChange).not.toHaveBeenCalled();
    fire('connect');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stops listening and gives the socket back once', () => {
    const onChange = vi.fn();
    const stop = watchLiveList(onChange);
    stop();
    stop();
    fire(LIVE_LIST_CHANGED, {});
    expect(onChange).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
