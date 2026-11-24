import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GROUP = '11111111-2222-3333-4444-555555555555';
const ME = '0xabcdef0123456789abcdef0123456789abcdef01';

const mocks = vi.hoisted(() => ({
  token: vi.fn(), join: vi.fn(), leave: vi.fn(), publish: vi.fn(), subscribe: vi.fn(),
  insert: vi.fn(), update: vi.fn(), track: vi.fn(), presence: {} as Record<string, unknown[]>,
  handlers: {} as Record<string, (...args: any[]) => any>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: ME }) }));
vi.mock('@/lib/api/dehub/core', () => ({ apiCall: () => Promise.resolve(), getAuthToken: () => null }));
vi.mock('@/lib/wallet-session', () => ({ ensureWalletSession: () => Promise.resolve({ token: 'signed' }) }));
vi.mock('@/utils/simple-call-check', () => ({ simpleCallCheck: () => Promise.resolve(null), debugAllCalls: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
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
      presenceState: () => mocks.presence,
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
import { __resetChannelLeases } from '@/lib/realtime-channel-lease';
import { PUBLIC_CHAT_CALL_ID, groupCallUid, GROUP_CALL_MAX_PEOPLE, GROUP_CALL_MAX_CAMERAS } from '@/lib/group-call';
import { toast } from 'sonner';
import { visualActivity } from '@/lib/visual-activity';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.handlers = {}; mocks.presence = {};
  __resetChannelLeases();
  mocks.token.mockResolvedValue({ data: { appId: 'app', token: 'token' }, error: null });
  mocks.join.mockResolvedValue(undefined); mocks.leave.mockResolvedValue(undefined);
  mocks.publish.mockResolvedValue(undefined); mocks.subscribe.mockResolvedValue(undefined);
  mocks.insert.mockResolvedValue({ data: [{ id: 'ring-1' }, { id: 'ring-2' }], error: null });
});
afterEach(() => { cleanup(); visualActivity.setCall(false, false); vi.clearAllTimers(); vi.useRealTimers(); });

describe('group calls', () => {
  it('opens the group room under the wallet uid without ringing or notifying anyone, and announces itself', async () => {
    const { result } = renderHook(useCall);
    await act(async () => {
      void result.current.joinGroupCall({ id: GROUP, name: 'Friends' }, 'audio');
      await flush();
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    const uid = groupCallUid(ME);
    expect(mocks.token.mock.calls[0][1].body).toMatchObject({ channelName: `group-call-${GROUP}`, uid });
    expect(mocks.join).toHaveBeenCalledWith('app', `group-call-${GROUP}`, 'token', uid);
    expect(mocks.track).toHaveBeenLastCalledWith({ uid, wallet: ME, type: 'audio', cam: false });
    expect(result.current.isGroupCall).toBe(true);
    expect(result.current.isRinging).toBe(true);
  });

  it('stays up while others remain and ends when the last one leaves', async () => {
    const { result } = renderHook(useCall);
    await act(async () => {
      void result.current.joinGroupCall({ id: GROUP, name: 'Friends' }, 'audio');
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
  });

  it('keeps the room open while you wait, with no ring timeout', async () => {
    const { result } = renderHook(useCall);
    await act(async () => {
      void result.current.joinGroupCall({ id: PUBLIC_CHAT_CALL_ID, name: 'Public Chat' }, 'video');
      await flush();
    });
    expect(mocks.join).toHaveBeenCalledWith('app', `group-call-${PUBLIC_CHAT_CALL_ID}`, 'token', groupCallUid(ME));
    expect(mocks.track).toHaveBeenLastCalledWith({ uid: groupCallUid(ME), wallet: ME, type: 'video', cam: true });
    await act(async () => { vi.advanceTimersByTime(120_000); await flush(); });
    expect(result.current.currentCall).not.toBeNull();
  });

  it('refuses a full room before any call screen opens', async () => {
    mocks.presence = Object.fromEntries(Array.from({ length: GROUP_CALL_MAX_PEOPLE }, (_, i) =>
      [`k${i}`, [{ uid: i + 10, wallet: `0x${String(i).padStart(40, '0')}`, type: 'audio' }]]));
    const { result } = renderHook(useCall);
    await act(async () => {
      void result.current.joinGroupCall({ id: GROUP, name: 'Friends' }, 'audio');
      await flush();
    });
    expect(result.current.currentCall).toBeNull();
    expect(mocks.join).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('This call is full', expect.anything());
  });

  it('joins with the camera off when every camera slot is taken, and will not turn it on', async () => {
    mocks.presence = Object.fromEntries(Array.from({ length: GROUP_CALL_MAX_CAMERAS }, (_, i) =>
      [`k${i}`, [{ uid: i + 10, wallet: `0x${String(i).padStart(40, '0')}`, type: 'video', cam: true }]]));
    const { result } = renderHook(useCall);
    await act(async () => {
      void result.current.joinGroupCall({ id: GROUP, name: 'Friends' }, 'video');
      await flush();
    });
    expect(result.current.isCameraOff).toBe(true);
    expect(result.current.groupCamerasFull).toBe(true);
    expect(mocks.track).toHaveBeenLastCalledWith({ uid: groupCallUid(ME), wallet: ME, type: 'video', cam: false });
    act(() => { result.current.toggleCamera(); });
    expect(result.current.isCameraOff).toBe(true);
    expect(toast).toHaveBeenCalledWith('Cameras full', expect.anything());
  });
});
