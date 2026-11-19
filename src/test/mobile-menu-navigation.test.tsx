import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/app/AppSidebar';
import { NAV_ITEMS } from '@/constants/app.constants';
import { NAV_LABEL_KEYS } from '@/components/app/navigation/SidebarNavItem';

const { openStage, disconnect, counts } = vi.hoisted(() => ({
  openStage: vi.fn(), disconnect: vi.fn(), counts: { dm: 0, publicChat: 0 },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
vi.mock('@/contexts/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/contexts/AuthContext')>(), useAuth: () => ({ isAuthenticated: true, disconnect }) }));
vi.mock('@/contexts/StageContext', () => ({ openStageModal: openStage }));
vi.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/hooks/use-self-badge-balance', () => ({ useSelfBadge: () => ({ balance: 0 }) }));
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
vi.mock('@/components/app/navigation/SidebarProfileSwitcher', () => ({ SidebarProfileSwitcher: () => null }));
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
  // Every page on one screen; the tabs layout has its own test below.
  localStorage.setItem('menu-layout', 'sections');
});
const mount = () => render(<MemoryRouter initialEntries={['/app']}><Harness /></MemoryRouter>);

describe('mobile menu dismissal', () => {
  it('shows the combined direct and public chat unread count on Messages', () => {
    counts.dm = 2;
    counts.publicChat = 3;
    mount();
    const messages = screen.getByText('settings.chat').closest('a');
    expect(messages?.querySelector('[data-menu-badge]')?.textContent).toBe('5');
  });

  it.each(NAV_ITEMS.filter(item => !item.external && !item.action && item.label !== 'Home').map(item => [NAV_LABEL_KEYS[item.label] || item.label, item.path]))('opens %s and closes the menu', (label, path) => {
    mount();
    fireEvent.click(screen.getByText(label));
    expect(screen.getByTestId('path').textContent).toBe(path);
    expect(screen.queryByTestId('menu')).toBeNull();
  });

  it('opens on the Main tab by default and switches groups', () => {
    localStorage.removeItem('menu-layout');
    mount();
    expect(screen.getByText('nav.profile')).toBeTruthy();
    expect(screen.queryByText('nav.dao')).toBeNull();
    fireEvent.click(screen.getByText('nav.groups.riftn'));
    expect(screen.getByText('nav.dao')).toBeTruthy();
    expect(screen.queryByText('nav.profile')).toBeNull();
  });

  it('moves to the next group with a sideways swipe on the tiles', () => {
    localStorage.removeItem('menu-layout');
    mount();
    const pager = document.querySelector('[data-menu-pager]')!;
    const at = (x: number) => ({ touches: [{ clientX: x, clientY: 300 }], changedTouches: [{ clientX: x, clientY: 300 }] });
    fireEvent.touchStart(pager, at(300));
    fireEvent.touchMove(pager, at(260));
    fireEvent.touchMove(pager, at(120));
    fireEvent.touchEnd(pager, at(120));
    expect(screen.getByRole('tab', { name: 'nav.groups.create' }).getAttribute('aria-selected')).toBe('true');
  });

  it('turns the tab row into the search field and back', () => {
    localStorage.removeItem('menu-layout');
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.searchMenu' }));
    const field = screen.getByRole('textbox', { name: 'sidebar.searchMenu' });
    fireEvent.change(field, { target: { value: 'dao' } });
    expect(screen.getByText('nav.dao')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.clearSearch' }));
    expect(screen.queryByRole('textbox', { name: 'sidebar.searchMenu' })).toBeNull();
    expect(screen.getByText('nav.groups.main')).toBeTruthy();
  });

  it('keeps repeated close requests closed', () => {
    mount();
    fireEvent.click(screen.getByText('Dismiss twice'));
    expect(screen.queryByTestId('menu')).toBeNull();
  });

  it('closes the menu when opening the composer', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.post' }));
    expect(screen.queryByTestId('menu')).toBeNull();
    expect(await screen.findByText('Composer open')).toBeTruthy();
  });
});
