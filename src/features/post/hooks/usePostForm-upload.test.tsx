import type { ChangeEvent } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { usePostForm } from './usePostForm';

const { account, getPostQuota, error } = vi.hoisted(() => ({
  account: { address: 'first', badgeBalance: 0 },
  getPostQuota: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', async importOriginal => ({
  ...await importOriginal<typeof import('@/contexts/AuthContext')>(), useAuth: () => ({ user: account }),
}));
vi.mock('react-router-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error } }));
vi.mock('@/lib/api/dehub', () => ({ getPostQuota }));
vi.mock('@/hooks/use-creator-plans', () => ({ useCreatorPlansLite: () => ({ planIds: [] }) }));
vi.mock('@/hooks/use-posting-chain', () => ({ usePostingChain: () => ({ chainId: 1 }) }));
vi.mock('@/hooks/use-optimistic-posts', () => ({ useOptimisticPosts: () => ({}) }));
vi.mock('../lib/draft-video', () => ({
  startDraftVideo: () => ({ getSnapshot: () => null, subscribe: () => () => {}, abort: () => {} }),
}));
vi.mock('@/lib/post-quota-settle', () => ({ flushPendingSettlements: async () => {} }));

it('uses the current account allowance when a video is picked after the composer opens', async () => {
  const gb = 1024 ** 3;
  const cobra = { tier: 'King Cobra', mediaBytesPerDay: 1.5 * gb };
  let resolveQuota!: (quota: typeof cobra) => void;
  getPostQuota.mockImplementationOnce(() => new Promise(resolve => { resolveQuota = resolve; }));
  const { result, rerender } = renderHook(() => usePostForm(() => {}));
  await waitFor(() => expect(getPostQuota).toHaveBeenCalledOnce());

  function select(size: number) {
    const video = Object.defineProperty(new File([], 'video.mp4', { type: 'video/mp4' }), 'size', { value: size });
    const target = { files: [video], value: 'video.mp4' };
    return act(() => result.current.actions.handleVideoSelect({ target } as unknown as ChangeEvent<HTMLInputElement>));
  }
  // A metadata error ends the decoder's work after the picker has accepted the file.
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('error'));
  });
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL() { return 'blob:test'; }
    static revokeObjectURL() {}
  });
  try {
    await select(gb + 1);
    expect(result.current.state.media).toHaveLength(0);
    await act(async () => resolveQuota(cobra));
    await select(1.5 * gb + 1);
    expect(result.current.state.media).toHaveLength(0);
    await select(1.5 * gb);
    expect(result.current.state.media[0]?.file.size).toBe(1.5 * gb);
    act(() => result.current.actions.removeMedia(0));
    account.address = 'second';
    getPostQuota.mockImplementation(() => new Promise(() => {}));
    rerender();
    await select(gb + 1);
    expect(result.current.state.media).toHaveLength(0);
    account.badgeBalance = 250_000;
    rerender();
    await select(1.5 * gb);
    expect(result.current.state.media[0]?.file.size).toBe(1.5 * gb);
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

it('keeps one copy of a synced draft after reopening and clears it when deleted', async () => {
  const saved = {
    id: '32667e3c-f892-4c33-b8b5-a5e25d17a7e8',
    text: 'A private draft for later',
    created_at: new Date().toISOString(),
  };
  let exists = false;
  const from = vi.spyOn(supabase, 'from').mockImplementation(() => ({
    select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: exists ? [saved] : [] }) }) }) }),
    insert: () => ({ select: () => ({ single: async () => {
      exists = true;
      return { data: { id: saved.id } };
    } }) }),
    delete: () => ({ eq: async (_column: string, id: string) => {
      if (id === saved.id) exists = false;
      return {};
    } }),
  }) as never);
  const draftsKey = 'guest|post_drafts';
  const originalDrafts = localStorage.getItem(draftsKey);
  localStorage.removeItem(draftsKey);
  try {
    const composer = renderHook(() => usePostForm(() => {}));
    act(() => composer.result.current.actions.setText(saved.text));
    act(() => composer.result.current.actions.saveDraft());
    await waitFor(() => expect(composer.result.current.state.drafts.map(draft => draft.id)).toEqual([saved.id]));
    composer.unmount();

    from.mockClear();
    const reopened = renderHook(() => usePostForm(() => {}));
    await waitFor(() => {
      expect(from).toHaveBeenCalledWith('post_drafts');
      expect(reopened.result.current.state.drafts.map(draft => draft.id)).toEqual([saved.id]);
    });
    act(() => reopened.result.current.actions.deleteDraft(saved.id));
    expect(reopened.result.current.state.drafts).toEqual([]);
    expect(exists).toBe(false);
  } finally {
    if (originalDrafts === null) localStorage.removeItem(draftsKey);
    else localStorage.setItem(draftsKey, originalDrafts);
    from.mockRestore();
  }
});
