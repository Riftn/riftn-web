import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ClearNotificationsControl } from '@/components/app/notifications/ClearNotificationsControl';
import { clearAllNotifications } from '@/lib/api/dehub/notifications';

vi.mock('@/lib/api/dehub/notifications', () => ({ clearAllNotifications: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('clear all notifications', () => {
  it('does not write until confirmed, then refreshes both stores and their counts', async () => {
    const client = new QueryClient();
    const clear = vi.mocked(clearAllNotifications);
    let complete!: (value: { clearedThrough: string }) => void;
    clear.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    client.setQueryData(['notifications', 'unreadCount'], { total: 12 });
    client.setQueryData(['custom-notifications', 'unread', 'wallet'], 3);

    render(
      <QueryClientProvider client={client}>
        <ClearNotificationsControl wallet="wallet" disabled={false} />
      </QueryClientProvider>,
    );

    const trigger = screen.getByRole('button', { name: /notifications\.clearAll/ });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('alertdialog');
    const cancel = within(dialog).getByRole('button', { name: 'common.cancel' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(clear).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(trigger);
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'notifications.clearAllAction' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledWith('wallet', expect.any(Number));
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(client.getQueryData(['notifications', 'unreadCount'])).toEqual({ total: 12 });

    await act(async () => complete({ clearedThrough: '2026-11-26T01:00:00Z' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(client.getQueryData(['notifications', 'unreadCount'])).toBeUndefined();
    expect(client.getQueryData(['custom-notifications', 'unread', 'wallet'])).toBeUndefined();
  });
});
