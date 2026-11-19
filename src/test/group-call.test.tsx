import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP = '11111111-2222-3333-4444-555555555555';
const ME = '0xabcdef0123456789abcdef0123456789abcdef01';

const mocks = vi.hoisted(() => ({
  token: vi.fn(), join: vi.fn(), leave: vi.fn(), publish: vi.fn(), subscribe: vi.fn(),
  insert: vi.fn(), update: vi.fn(), track: vi.fn(),
  handlers: {} as Record<string, (...args: any[]) => any>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: ME }) }));
vi.mock('@/lib/api/dehub/core', () => ({ apiCall: () => Promise.resolve(), getAuthToken: () => null }));
vi.mock('@/lib/wallet-session', () => ({ ensureWalletSession: () => Promise.resolve({ token: 'signed' }) }));
vi.mock('@/utils/simple-call-check', () => ({ simpleCallCheck: () => Promise.resolve(null), debugAllCalls: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/supabase-wallet-client', async () => {
  const { supabase } = await import('@/integrations/supabase/client');
  return { walletScopedClient: () => supabase };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: mocks.token },
  from: () => ({
    insert: (rows: unknown) => ({ select: () => mocks.insert(rows) }),
    update: (data: unknown) => {
      const chain: any = { eq: () => chain, in: (_f: string, ids: string[]) => { mocks.update(data, ids); return chain; }, then: (r: any) => Promise.resolve({ error: null }).then(r) };
      return chain;
    },
  }),
  channel: () => {
    const channel: any = {
      on: () => channel,
      subscribe: (cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return channel; },
      presenceState: () => ({}),
      track: mocks.track,
      untrack: vi.fn(),
    };
    return channel;
  },
  removeChannel: vi.fn(),
} }));
vi.mock('agora-rtc-sdk-ng', () => ({ default: {
  setLogLevel: vi.fn(),
  createClient: () => ({
    on: (name: string, handler: (...args: any[]) => any) => { mocks.handlers[name] = handler; },
    join: mocks.join, leave: mocks.leave, publish: mocks.publish, subscribe: mocks.subscribe,
    removeAllListeners: vi.fn(), enableAudioVolumeIndicator: vi.fn(),
  }),
  createMicrophoneAudioTrack: () => Promise.resolve({ play: vi.fn(), stop: vi.fn(), close: vi.fn(), setMuted: vi.fn() }),
  createCameraVideoTrack: () => Promise.resolve({ play: vi.fn(), stop: vi.fn(), close: vi.fn(), setMuted: vi.fn() }),
} }));
import { useCall } from '@/hooks/use-call';
import { groupCallUid } from '@/lib/group-call';
import { visualActivity } from '@/lib/visual-activity';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.handlers = {};
  mocks.token.mockResolvedValue({ data: { appId: 'app', token: 'token' }, error: null });
  mocks.join.mockResolvedValue(undefined); mocks.leave.mockResolvedValue(undefined);
  mocks.publish.mockResolvedValue(undefined); mocks.subscribe.mockResolvedValue(undefined);
  mocks.insert.mockResolvedValue({ data: [{ id: 'ring-1' }, { id: 'ring-2' }], error: null });
});
afterEach(() => { cleanup(); visualActivity.setCall(false, false); vi.clearAllTimers(); vi.useRealTimers(); });

describe('group calls', () => {
  it('rings every other member, joins the group room under the wallet uid and announces itself', async () => {
    const { result } = renderHook(useCall);
    await act(async () => {
      void result.current.startGroupCall({ id: GROUP, name: 'Friends' }, [ME, '0xB', '0xc', '0xb'], 'audio');
      await flush();
    });
    const rows = mocks.insert.mock.calls[0][0] as Array<Record<string, string>>;
    expect(rows.map(row => row.recipient_address)).toEqual(['0xb', '0xc']);
    expect(rows.every(row => row.group_id === GROUP && row.group_name === 'Friends' && row.status === 'ringing')).toBe(true);
    const uid = groupCallUid(ME);
    expect(mocks.token.mock.calls[0][1].body).toMatchObject({ channelName: `group-call-${GROUP}`, uid });
    expect(mocks.join).toHaveBeenCalledWith('app', `group-call-${GROUP}`, 'token', uid);
    expect(mocks.track).toHaveBeenCalledWith({ uid, wallet: ME, type: 'audio' });
    expect(result.current.isGroupCall).toBe(true);
    expect(result.current.isRinging).toBe(true);
  });

  it('stays up while others remain, ends when the last one leaves, and never cancels answered rings', async () => {
    const { result } = renderHook(useCall);
    await act(async () => {
      void result.current.startGroupCall({ id: GROUP, name: 'Friends' }, [ME, '0xb', '0xc'], 'audio');
      await flush();
    });
    act(() => { mocks.handlers['user-joined']({ uid: 7 }); mocks.handlers['user-joined']({ uid: 9 }); });
    expect(result.current.isCallActive).toBe(true);
    expect(result.current.groupParticipants.map(p => p.uid)).toEqual([7, 9]);
    act(() => { mocks.handlers['user-left']({ uid: 7 }); });
    expect(result.current.currentCall).not.toBeNull();
    await act(async () => { mocks.handlers['user-left']({ uid: 9 }); await flush(); });
    expect(result.current.currentCall).toBeNull();
    expect(result.current.callSummary).toMatchObject({ outcome: 'ended', groupName: 'Friends' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('stops every ringing phone when nobody answers', async () => {
    const { result } = renderHook(useCall);
    await act(async () => {
      void result.current.startGroupCall({ id: GROUP, name: 'Friends' }, [ME, '0xb', '0xc'], 'video');
      await flush();
    });
    await act(async () => { vi.advanceTimersByTime(45_000); await flush(); });
    expect(result.current.currentCall).toBeNull();
    expect(result.current.callSummary).toMatchObject({ outcome: 'no_answer' });
    expect(mocks.update).toHaveBeenCalledWith({ status: 'ended' }, ['ring-1', 'ring-2']);
  });
});
