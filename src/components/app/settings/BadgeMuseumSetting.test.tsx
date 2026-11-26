import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BadgeMuseumSetting } from './BadgeMuseumSetting';

const account = vi.hoisted(() => ({ address: '0xabc' as string | undefined }));
const updateProfile = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/AuthContext', async () => {
  const { createContext } = await import('react');
  return { AuthContext: createContext({ user: account }) };
});
vi.mock('@/lib/api/dehub', () => ({ getAuthToken: () => null, updateProfile }));
vi.mock('@/components/app/profile/BadgeMuseum', () => ({
  BadgeMuseumSheet: () => null,
  MedalPodium: () => null,
}));
vi.mock('@/components/app/war/WarHudIcon', () => ({ ThemedIcon: () => null }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => {
  account.address = '0xabc';
  updateProfile.mockReset();
  vi.unstubAllGlobals();
});

it('reads a pending save after navigation and reads the account again in a fresh session', async () => {
  let hidden = true;
  let finishSave: () => void = () => {};
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ result: { hidden, milestones: [], earned: 0, total: 0 } }),
  })));
  updateProfile.mockImplementationOnce(() => new Promise((resolve) => {
    finishSave = () => {
      hidden = false;
      resolve({ result: true });
    };
  }));

  const queryClient = new QueryClient();
  const mount = (client: QueryClient) => render(
    <QueryClientProvider client={client}><BadgeMuseumSetting /></QueryClientProvider>,
  );
  const control = () => screen.getByRole('switch', { name: 'badgeMuseum.showSetting' });
  const first = mount(queryClient);
  await waitFor(() => expect(control()).toBeEnabled());
  expect(control()).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(control());
  await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({
    badgeMuseumVisibility: 'public',
    badgeMuseumViewer: '0xabc',
  }));
  first.unmount();

  const returned = mount(queryClient);
  expect(control()).toBeDisabled();
  await act(async () => finishSave());
  await waitFor(() => expect(control()).toHaveAttribute('aria-checked', 'true'));
  returned.unmount();
  queryClient.clear();

  account.address = undefined;
  const signedOut = mount(new QueryClient());
  expect(screen.queryByRole('switch')).toBeNull();
  signedOut.unmount();

  account.address = '0xabc';
  const freshClient = new QueryClient();
  mount(freshClient);
  await waitFor(() => expect(control()).toHaveAttribute('aria-checked', 'true'));
  await waitFor(() => expect(control()).toBeEnabled());
  updateProfile.mockImplementationOnce(async () => {
    hidden = true;
    return { result: true };
  });
  fireEvent.click(control());
  await waitFor(() => expect(control()).toHaveAttribute('aria-checked', 'false'));
  expect(updateProfile).toHaveBeenLastCalledWith({
    badgeMuseumVisibility: 'hidden',
    badgeMuseumViewer: '0xabc',
  });
});
