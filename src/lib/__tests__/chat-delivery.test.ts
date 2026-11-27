import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { confirmChatDelivery, liveTextConfirmation, roomMessageMatches, waitForChatRoom } from '../chat-delivery';

afterEach(() => vi.useRealTimers());
function channel() {
  const handlers = new Map<string, Set<(message: any) => void>>();
  return {
    listen(event: string, handler: (message: any) => void) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler); handlers.set(event, set);
      return () => { set.delete(handler); };
    },
    receive(event: string, message: any = {}) { handlers.get(event)?.forEach(handler => handler(message)); },
    count() { return [...handlers.values()].reduce((n, set) => n + set.size, 0); },
  };
}
const expected = { account: 'alice', room: 'one', content: 'hello' };
const accepted = { _id: 'server-id', roomId: 'one', senderAddress: 'ALICE', content: 'hello' };

function roomSocket({ active = false, connected = false } = {}) {
  const events = channel();
  const listeners = new Map<() => void, () => void>();
  const state = {
    active,
    connected,
    connect: vi.fn(),
    on(event: string, handler: () => void) {
      listeners.set(handler, events.listen(event, handler));
    },
    off(_event: string, handler: () => void) {
      listeners.get(handler)?.();
    },
  };
  return { events, state, socket: state as unknown as Socket };
}

describe('stream chat connection recovery', () => {
  it('restarts an inactive socket and waits for the intended room', async () => {
    const { events, state, socket } = roomSocket();
    const rejoin = vi.fn();
    let room = '';
    const ready = waitForChatRoom(socket, () => room === 'stream:42', ['roomJoined'], rejoin);
    expect(state.connect).toHaveBeenCalledTimes(1);
    state.connected = true;
    room = 'global';
    events.receive('roomJoined');
    expect(events.count()).toBe(2);
    room = 'stream:42';
    events.receive('roomJoined');
    expect(await ready).toBe(true);
    expect(rejoin).not.toHaveBeenCalled();
    expect(events.count()).toBe(0);
  });

  it('lets automatic reconnect run and removes listeners when the room times out', async () => {
    vi.useFakeTimers();
    const { events, state, socket } = roomSocket({ active: true });
    const ready = waitForChatRoom(socket, () => false, ['roomJoined'], vi.fn());
    events.receive('connect_error');
    expect(state.connect).not.toHaveBeenCalled();
    expect(events.count()).toBe(2);
    vi.advanceTimersByTime(12_000);
    expect(await ready).toBe(false);
    expect(events.count()).toBe(0);
  });

  it('asks a connected socket with no room confirmation to rejoin', async () => {
    const { events, state, socket } = roomSocket({ active: true, connected: true });
    let joined = false;
    const rejoin = vi.fn(() => {
      joined = true;
      events.receive('roomJoined');
    });
    expect(await waitForChatRoom(socket, () => joined, ['roomJoined'], rejoin)).toBe(true);
    expect(rejoin).toHaveBeenCalledTimes(1);
    expect(state.connect).not.toHaveBeenCalled();
    expect(events.count()).toBe(0);
  });
});

describe('confirmed chat submission', () => {
  it('registers before emission and accepts the matching server message', async () => {
    const socket = channel();
    const sent = confirmChatDelivery({ ...socket, emit: () => socket.receive('message', accepted),
      messageEvent: 'message', errorEvent: 'error', matches: value => roomMessageMatches(value, expected) });
    expect(await sent).toBe(true);
    expect(socket.count()).toBe(0);
  });
  it('does not treat emitting, another sender, or another room as success', async () => {
    vi.useFakeTimers();
    const socket = channel();
    const sent = confirmChatDelivery({ ...socket, emit: () => {}, messageEvent: 'message', errorEvent: 'error',
      matches: value => roomMessageMatches(value, expected), timeoutMs: 50 });
    socket.receive('message', { ...accepted, senderAddress: 'bob' });
    socket.receive('message', { ...accepted, roomId: 'two' });
    socket.receive('message', { ...accepted, _id: undefined });
    await vi.advanceTimersByTimeAsync(50);
    expect(await sent).toBe(false);
    expect(socket.count()).toBe(0);
  });
  it.each(['error', 'disconnect'])('keeps a draft on %s and removes listeners', async event => {
    const socket = channel();
    const sent = confirmChatDelivery({ ...socket, emit: () => {}, messageEvent: 'message', errorEvent: 'error', matches: () => true });
    socket.receive(event);
    expect(await sent).toBe(false);
    expect(socket.count()).toBe(0);
  });
  it('matches an edited message and attachment only when their identities agree', () => {
    expect(roomMessageMatches(accepted, { ...expected, messageId: 'other' })).toBe(false);
    expect(roomMessageMatches(accepted, { ...expected, attachment: 'photo' })).toBe(false);
    expect(roomMessageMatches({ ...accepted, media: [{ url: 'photo' }] }, { ...expected, attachment: 'photo' })).toBe(true);
  });
});

describe('live text delivery from room history', () => {
  it('checks history once when an emitted send misses its echo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
    const socket = channel();
    const recover = vi.fn(async () => true);
    const emit = vi.fn();
    const sent = confirmChatDelivery({ ...socket, emit, messageEvent: 'message', errorEvent: 'error',
      matches: () => false, recover, timeoutMs: 50 });
    vi.advanceTimersByTime(50);
    expect(await sent).toBe(true);
    expect(recover).toHaveBeenCalledWith(Date.parse('2026-11-27T12:00:00Z'));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(socket.count()).toBe(0);
  });

  it('honours an explicit refusal without reading history', async () => {
    const socket = channel();
    const recover = vi.fn(async () => true);
    const sent = confirmChatDelivery({ ...socket, emit: () => socket.receive('error'),
      messageEvent: 'message', errorEvent: 'error', matches: () => true, recover });
    expect(await sent).toBe(false);
    expect(recover).not.toHaveBeenCalled();
  });

  it('rejects a stale or different row and uses a stored message only once', () => {
    const { socket } = roomSocket();
    const first = liveTextConfirmation(socket, expected);
    const second = liveTextConfirmation(socket, expected);
    const stored = { ...accepted, messageType: 'text', createdAt: '2026-11-27T12:00:01Z' };
    const sentAt = Date.parse('2026-11-27T12:00:00Z');
    expect(first({ ...stored, createdAt: '2026-11-27T11:59:59Z' }, sentAt)).toBe(false);
    expect(first({ ...stored, roomId: 'two' }, sentAt)).toBe(false);
    expect(first({ ...stored, replyTo: { id: 'other' } }, sentAt)).toBe(false);
    expect(first(stored, sentAt)).toBe(true);
    expect(second(stored, sentAt)).toBe(false);
  });
});
