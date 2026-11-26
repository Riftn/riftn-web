import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitDmTyping, onDmTyping } from '@/lib/api/dehub/dm-socket';
import { useDmTyping } from '../use-dm-typing';

vi.mock('@/lib/api/dehub/dm-socket', () => ({
  emitDmTyping: vi.fn(),
  onDmTyping: vi.fn(),
}));

describe('private-message typing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(onDmTyping).mockImplementation(() => () => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('refreshes expiry on each peer heartbeat and clears on stop', () => {
    const { result, rerender } = renderHook(({ chat }) => useDmTyping(chat, 'me'), {
      initialProps: { chat: 'first' },
    });
    const receive = vi.mocked(onDmTyping).mock.calls[0][0];
    const peer = { dmId: 'first', userId: 'peer' };
    act(() => {
      receive({ ...peer, dmId: 'second' }, true);
      receive({ ...peer, userId: 'me' }, true);
    });
    expect(result.current.remoteTyping).toBe(false);
    act(() => receive(peer, true));
    act(() => vi.advanceTimersByTime(4000));
    act(() => receive(peer, true));
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.remoteTyping).toBe(true);
    act(() => receive(peer, false));
    expect(result.current.remoteTyping).toBe(false);
    act(() => receive(peer, true));
    act(() => vi.advanceTimersByTime(7000));
    expect(result.current.remoteTyping).toBe(false);
    act(() => receive(peer, true));
    rerender({ chat: 'second' });
    expect(result.current.remoteTyping).toBe(false);
  });

  it('sends immediately, limits heartbeats, and sends stop after idle or send', () => {
    const { result } = renderHook(() => useDmTyping('first', 'me'));
    act(() => {
      result.current.onTypingActivity(true);
      result.current.onTypingActivity(true);
    });
    expect(emitDmTyping).toHaveBeenCalledTimes(1);
    expect(emitDmTyping).toHaveBeenLastCalledWith('first', true);
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.onTypingActivity(true));
    expect(emitDmTyping).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(5000));
    expect(emitDmTyping).toHaveBeenLastCalledWith('first', false);
    act(() => {
      result.current.onTypingActivity(true);
      result.current.onTypingActivity(false);
    });
    expect(emitDmTyping).toHaveBeenCalledTimes(5);
    expect(emitDmTyping).toHaveBeenLastCalledWith('first', false);
  });
});
