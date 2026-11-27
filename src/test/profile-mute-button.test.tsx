import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { ProfileMuteButton } from '@/components/app/profile/ProfileMuteButton';
import { getMuteStatus, muteUser, unmuteUser } from '@/lib/api/dehub/mutes';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'viewer' }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/api/dehub/mutes', () => ({ getMuteStatus: vi.fn(), muteUser: vi.fn(), unmuteUser: vi.fn() }));

it('opens with the saved mute state and toggles the same profile both ways', async () => {
  vi.mocked(getMuteStatus).mockResolvedValue(true);
  vi.mocked(unmuteUser).mockResolvedValue({ status: true });
  vi.mocked(muteUser).mockResolvedValue({ status: true });
  const client = new QueryClient();
  const view = render(<QueryClientProvider client={client}><ProfileMuteButton address="author" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'keywordFilters.remove' }));
  fireEvent.click(await screen.findByRole('button', { name: 'keywordFilters.add' }));
  await screen.findByRole('button', { name: 'keywordFilters.remove' });
  expect(unmuteUser).toHaveBeenCalledWith('author');
  expect(muteUser).toHaveBeenCalledWith('author');
  view.unmount();
  client.clear();
});
