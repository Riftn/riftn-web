import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

let finishWrite: () => void = () => {};
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('@/lib/api/dehub', () => ({
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationAsRead: vi.fn(),
  markAllNotificationsAsRead: vi.fn(() => new Promise<void>((resolve) => { finishWrite = resolve; })),
}));

import { MARK_ALL_READ_KEY, applyMarkedAllRead, notificationKeys, useMarkAllNotificationsAsRead } from '@/hooks/use-notifications';

type Row = { id: string; read: boolean };
type List = { pages: { items: Row[] }[] };

const row = (id: string, type: string, read = false) => ({ id, type, read, category: 'engagement', createdAt: '2026-01-01' });

describe('mark all as read', () => {
  it('turns every loaded row read at once, so the tab counts go straight to nothing', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const all = notificationKeys.list(undefined, undefined);
    const likes = notificationKeys.list(undefined, ['like']);
    client.setQueryData(all, { pages: [{ items: [row('a', 'like'), row('b', 'following'), row('c', 'comment', true)] }], pageParams: [1] });
    client.setQueryData(likes, { pages: [{ items: [row('a', 'like')] }], pageParams: [1] });
    client.setQueryData(notificationKeys.unreadCount(), { total: 2, byCategory: { engagement: 2 } });

    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useMarkAllNotificationsAsRead(), { wrapper });
    act(() => result.current.mutate(undefined));

    await waitFor(() => {
      const unread = (key: readonly unknown[]) =>
        (client.getQueryData<List>(key)?.pages ?? []).flatMap((p) => p.items).filter((n) => !n.read).length;
      expect(unread(all)).toBe(0);
      expect(unread(likes)).toBe(0);
    });
    expect(client.getQueryData<{ total: number }>(notificationKeys.unreadCount())?.total).toBe(0);
    // Live refreshes check this to hold off until the write has landed.
    expect(client.isMutating({ mutationKey: MARK_ALL_READ_KEY })).toBe(1);
    // A list answer that left before the write landed still shows the rows
    // the reader marked as read; a row newer than the tap stays unread.
    const stale = applyMarkedAllRead([
      { ...row('a', 'like'), createdAt: '2026-01-01' },
      { ...row('new', 'like'), createdAt: '2026-01-05' },
    ] as never);
    expect(stale.map((n) => n.read)).toEqual([true, false]);
    finishWrite();
    await waitFor(() => expect(client.isMutating({ mutationKey: MARK_ALL_READ_KEY })).toBe(0));
  });
});
