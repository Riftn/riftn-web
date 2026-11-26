import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DhbListingSoonCard } from '@/components/app/DhbListingSoonCard';

const launch = vi.hoisted(() => ({
  getTokenLaunchStatus: vi.fn(),
  joinTokenLaunch: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/contexts/AuthContext')>(),
  useAuth: () => ({ isAuthenticated: true, walletAddress: '0xabc' }),
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, fallback?: string | Record<string, string>) => {
      if (typeof fallback === 'string') return fallback;
      if (key === 'tokenLaunch.notifyMe') return 'Notify me';
      if (key === 'tokenLaunch.emailLabel') return 'Email address';
      if (key === 'tokenLaunch.joinedTitle') return "You're on the list";
      return key;
    },
  }),
}));
vi.mock('@/lib/api/dehub/token-launch', () => ({
  ...launch,
  isValidLaunchEmail: (value: string) => value.includes('@'),
}));

function renderTicker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DhbListingSoonCard /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
});

describe('RIFT ticker', () => {
  it('shows the reference price, launch status and unconfirmed contract', () => {
    renderTicker();
    expect(screen.getByText('$RIFT')).toBeTruthy();
    expect(screen.getByText('$0.001')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByRole('status').textContent).toBe('Coming soon');
    fireEvent.click(screen.getByRole('button', { name: 'Contract address' }));
    expect(screen.getByRole('status').textContent).toBe('To be confirmed');
  });

  it('uses the established launch signup with the account email', async () => {
    launch.getTokenLaunchStatus.mockResolvedValue({ joined: false, accountEmail: 'fan@example.com' });
    launch.joinTokenLaunch.mockResolvedValue({ joined: true, email: 'f***@example.com' });
    renderTicker();
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(screen.getByText('For now, you can only earn tokens by using the app.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Notify me' }));
    expect(await screen.findByText("You're on the list")).toBeTruthy();
    expect(launch.joinTokenLaunch).toHaveBeenCalledWith({ useAccountEmail: true, locale: 'en' });
  });

  it('lets a fan enter an email when the account has none', async () => {
    launch.getTokenLaunchStatus.mockResolvedValue({ joined: false, accountEmail: null });
    launch.joinTokenLaunch.mockResolvedValue({ joined: true, email: 'f***@example.com' });
    renderTicker();
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'fan@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    await waitFor(() => expect(launch.joinTokenLaunch).toHaveBeenCalledWith({ email: 'fan@example.com', locale: 'en' }));
  });

  it('recognizes a signup already recorded on this device', async () => {
    localStorage.setItem('dehub.tokenLaunch.joined', 'f***@example.com');
    launch.getTokenLaunchStatus.mockResolvedValue({ joined: false, accountEmail: null });
    renderTicker();
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(await screen.findByText("You're on the list")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Notify me' })).toBeNull();
  });
});
