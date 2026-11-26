import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/app/AppSidebar';
import { NAV_ITEMS } from '@/constants/app.constants';
import { NAV_LABEL_KEYS } from '@/components/app/navigation/SidebarNavItem';

const { openStage, disconnect, counts, wallet } = vi.hoisted(() => ({
  openStage: vi.fn(), disconnect: vi.fn(), counts: { dm: 0, publicChat: 0 },
  wallet: { signedInProfile: false, legacy: 0, balance: '0' },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
vi.mock('@/contexts/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/contexts/AuthContext')>(), useAuth: () => ({
    isAuthenticated: true, disconnect,
    user: wallet.signedInProfile ? { username: 'member', address: '0xmember' } : undefined,
  }) }));
vi.mock('@/contexts/StageContext', () => ({ openStageModal: openStage }));
vi.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/hooks/use-self-badge-balance', () => ({ useSelfBadge: () => ({ balance: wallet.legacy }) }));
vi.mock('@/hooks/use-app-tokens', () => ({
  useAppTokensConfig: () => ({ data: { enabled: true } }),
  useAppTokens: () => ({ data: { balance: wallet.balance } }),
}));
vi.mock('@/hooks/use-notifications', () => ({ useUnreadNotificationCount: () => ({ data: undefined }) }));
vi.mock('@/hooks/use-custom-notifications', () => ({ useCustomUnreadCount: () => ({ data: undefined }) }));
vi.mock('@/lib/dm-unread-store', () => ({ useDmUnreadCount: () => counts.dm }));
vi.mock('@/hooks/use-public-chat-unread', () => ({ usePublicChatUnreadCount: () => counts.publicChat }));
vi.mock('@/hooks/use-is-desktop', () => ({ useIsDesktopViewport: () => false }));
vi.mock('@/hooks/use-search-history', () => ({ useSearchHistory: () => ({ addToHistory: vi.fn() }) }));
vi.mock('@/lib/route-preload', () => ({ preloadRoute: vi.fn() }));
vi.mock('@/lib/document-scroll', () => ({ scrollDocumentToSmooth: vi.fn() }));
vi.mock('@/components/app/war/WarHudIcon', () => ({ ThemedIcon: () => null }));
vi.mock('@/contexts/UserPreferencesContext', () => ({ useUserPreferences: () => null }));
vi.mock('@/components/app/navigation/DesktopSidebar', () => ({ DesktopSidebar: () => null }));
vi.mock('@/components/app/BadgedName', () => ({ BadgedName: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/app/navigation/MenuAccountSwitcher', () => ({ MenuAccountSwitcher: () => null }));
vi.mock('@/components/ui/liquid-glass-bubble', () => ({ LiquidGlassBubble: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button> }));
vi.mock('@/features/post/PostModal', () => ({ PostModal: ({ isOpen }: any) => isOpen ? <div>Composer open</div> : null }));
vi.mock('@/components/app/navigation/MobileHeader', () => ({
  MobileHeader: ({ isOpen, onOpenChange, children }: any) => <>
    <button onClick={() => onOpenChange(true)}>Open menu</button>
    {isOpen && <div data-testid="menu"><button onClick={() => { onOpenChange(false); onOpenChange(false); }}>Dismiss twice</button>{children}</div>}
  </>,
}));

function Harness() {
  const [open, setOpen] = useState(true);
  const location = useLocation();
  return <><output data-testid="path">{location.pathname}</output><AppSidebar isOpen={open} onOpenChange={setOpen} /></>;
}

beforeEach(() => {
  vi.clearAllMocks();
  counts.dm = 0;
  counts.publicChat = 0;
  wallet.signedInProfile = false;
  wallet.legacy = 0;
  wallet.balance = '0';
  // Every page on one screen; the tabs layout has its own test below.
  localStorage.setItem('menu-layout', 'sections');
});
// The menu's tiles load on demand (React.lazy): wait for them to land.
const mount = async () => {
  const view = render(<MemoryRouter initialEntries={['/app']}><Harness /></MemoryRouter>);
  await waitFor(() => expect(document.querySelector('[data-menu-layout]')).not.toBeNull());
  return view;
};

describe('mobile menu dismissal', () => {
  it('uses spendable RIFT for the wallet chip when legacy holdings are larger', async () => {
    wallet.signedInProfile = true;
    wallet.legacy = 3_550_000;
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'nav.wallet 0' }));
    expect(screen.getByTestId('path').textContent).toBe('/app/wallet');
  });

  it('toggles the wallet amount from a separate eye button and remembers the choice', async () => {
    wallet.signedInProfile = true;
    wallet.balance = '530';
    await mount();

    const eye = screen.getByRole('button', { name: 'wallet.hideBalance' });
    expect(eye.nextElementSibling).toBe(screen.getByRole('button', { name: 'nav.wallet 530' }));
    expect(eye.closest('[data-menu-chip]')).toBeNull();
    fireEvent.click(eye);
    expect(screen.getByTestId('path').textContent).toBe('/app');
    expect(screen.getByRole('button', { name: 'nav.wallet', exact: true }).textContent).toContain('••••');
    expect(screen.queryByRole('button', { name: 'nav.wallet 530' })).toBeNull();
    expect(localStorage.getItem('riftn.hideBalance')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'wallet.showBalance' }));
    expect(screen.getByRole('button', { name: 'nav.wallet 530' })).toBeTruthy();
    expect(localStorage.getItem('riftn.hideBalance')).toBe('0');
  });

  it('shows the combined direct and public chat unread count on Messages', async () => {
    counts.dm = 2;
    counts.publicChat = 3;
    await mount();
    const messages = screen.getByText('settings.chat').closest('a');
    expect(messages?.querySelector('[data-menu-badge]')?.textContent).toBe('5');
  });

  it.each(NAV_ITEMS.filter(item => !item.external && !item.action && item.label !== 'Home').map(item => [NAV_LABEL_KEYS[item.label] || item.label, item.path]))('opens %s and closes the menu', async (label, path) => {
    await mount();
    fireEvent.click(screen.getByText(label));
    expect(screen.getByTestId('path').textContent).toBe(path);
    expect(screen.queryByTestId('menu')).toBeNull();
  });

  it('opens on the Main tab by default and switches groups', async () => {
    localStorage.removeItem('menu-layout');
    await mount();
    expect(screen.getByText('nav.profile')).toBeTruthy();
    expect(screen.queryByText('nav.dao')).toBeNull();
    fireEvent.click(await screen.findByRole('tab', { name: 'nav.groups.riftn' }));
    expect(screen.getByText('nav.dao')).toBeTruthy();
    expect(screen.queryByText('nav.profile')).toBeNull();
  });

  it('moves to the next group with a sideways swipe on the tiles', async () => {
    localStorage.removeItem('menu-layout');
    await mount();
    const pager = document.querySelector('[data-menu-pager]')!;
    const at = (x: number) => ({ touches: [{ clientX: x, clientY: 300 }], changedTouches: [{ clientX: x, clientY: 300 }] });
    fireEvent.touchStart(pager, at(300));
    fireEvent.touchMove(pager, at(260));
    fireEvent.touchMove(pager, at(120));
    fireEvent.touchEnd(pager, at(120));
    expect(screen.getByRole('tab', { name: 'nav.groups.create' }).getAttribute('aria-selected')).toBe('true');
  });

  it('turns the tab row into the search field and back', async () => {
    localStorage.removeItem('menu-layout');
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.searchMenu' }));
    const field = screen.getByRole('textbox', { name: 'sidebar.searchMenu' });
    fireEvent.change(field, { target: { value: 'dao' } });
    expect(screen.getByText('nav.dao')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.clearSearch' }));
    expect(screen.queryByRole('textbox', { name: 'sidebar.searchMenu' })).toBeNull();
    expect(screen.getByText('nav.groups.main')).toBeTruthy();
  });

  it('clears the query and focus in sections, then reopens with an empty search', async () => {
    await mount();
    const field = screen.getByRole('textbox', { name: 'sidebar.searchMenu' }) as HTMLInputElement;
    field.focus();
    fireEvent.change(field, { target: { value: 'dao' } });
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.clearSearch' }));
    expect(field.value).toBe('');
    expect(document.activeElement).not.toBe(field);
    expect(screen.getByTestId('menu')).toBeTruthy();

    fireEvent.change(field, { target: { value: 'wallet' } });
    fireEvent.click(screen.getByText('Dismiss twice'));
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const reopened = screen.getByRole('textbox', { name: 'sidebar.searchMenu' }) as HTMLInputElement;
    expect(reopened.value).toBe('');
  });

  it('keeps repeated close requests closed', async () => {
    await mount();
    fireEvent.click(screen.getByText('Dismiss twice'));
    expect(screen.queryByTestId('menu')).toBeNull();
  });

  it('closes the menu when opening the composer', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.post' }));
    expect(screen.queryByTestId('menu')).toBeNull();
    expect(await screen.findByText('Composer open')).toBeTruthy();
  });
});
