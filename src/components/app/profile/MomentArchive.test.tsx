import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { MomentArchive } from './MomentArchive';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', async () => {
  const { createContext } = await import('react');
  const auth = { isAuthenticated: true, walletAddress: 'owner' };
  return { AuthContext: createContext(auth), useAuth: () => auth };
});
vi.mock('@/hooks/use-mature-content', () => ({ useMatureContent: () => ({ showMatureContent: false }) }));
vi.mock('@/hooks/use-kids-mode', () => ({ useKidsModeLock: () => false }));
vi.mock('@/lib/api/dehub/stories', () => ({ getStoryArchive: read }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));

it('opens the owner’s expired Moments on demand, paginates, and excludes other accounts and restricted media', async () => {
  const item = { id: 'expired', address: 'OWNER', caption: 'yesterday', createdAt: '2026-08-15', expired: true, type: 'photo', mediaUrl: '/a.jpg' };
  read.mockResolvedValueOnce({ items: [item, { ...item, id: 'other', address: 'other' }, { ...item, id: 'restricted', isMature: true }], next: 'cursor' })
    .mockResolvedValueOnce({ items: [{ ...item, id: 'older', caption: 'older' }], next: null });
  const client = new QueryClient();
  const app = (address: string) => <QueryClientProvider client={client}><MemoryRouter><MomentArchive profileAddress={address} /></MemoryRouter></QueryClientProvider>;
  const view = render(app('visitor'));
  expect(screen.queryByRole('button')).toBeNull();
  view.rerender(app('OWNER'));
  expect(read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'stories.momentArchive' }));
  expect(await screen.findByRole('link', { name: /yesterday/ })).toHaveAttribute('href', '/app/moment/expired');
  expect(screen.getAllByRole('link')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'common.loadMore' }));
  expect(await screen.findByRole('link', { name: /older/ })).toHaveAttribute('href', '/app/moment/older');
  expect(read).toHaveBeenNthCalledWith(2, 'cursor');
  view.rerender(app('visitor'));
  expect(screen.queryByRole('link')).toBeNull();
});
