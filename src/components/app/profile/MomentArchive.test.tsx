import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { MomentArchive } from './MomentArchive';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'owner' }) }));
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
  const archiveToggle = screen.getByRole('button', { name: 'stories.momentArchive' });
  expect(archiveToggle).toHaveAccessibleDescription('stories.archiveOnlyYou');
  expect(screen.getByText('stories.archiveOnlyYou')).not.toBeVisible();
  fireEvent.click(archiveToggle);
  const link = await screen.findByRole('link');
  expect(link).toHaveAttribute('href', '/app/moment/expired');
  expect(link).not.toHaveAccessibleName(/yesterday/);
  expect(link.querySelector('img')).toBeNull();
  expect(screen.getAllByRole('link')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'common.loadMore' }));
  await waitFor(() => expect(screen.getAllByRole('link').map(item => item.getAttribute('href'))).toContain('/app/moment/older'));
  expect(read).toHaveBeenNthCalledWith(2, 'cursor');
  view.rerender(app('visitor'));
  expect(screen.queryByRole('link')).toBeNull();
});
