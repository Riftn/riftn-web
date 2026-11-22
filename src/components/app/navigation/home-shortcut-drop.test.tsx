import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { NAV_ITEMS } from '@/constants/app.constants';
import { readNavOrder } from '@/lib/nav-order';
import { MobileMenuGrid } from './MobileMenuGrid';
import { HomeShortcuts } from './HomeShortcuts';
import { navItemId } from './nav-item-id';

vi.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ walletAddress: null }) }));
vi.mock('@/contexts/UserPreferencesContext', () => ({ useUserPreferences: () => null }));
vi.mock('@/contexts/StageContext', () => ({ openStageModal: vi.fn() }));
vi.mock('@/components/app/war/WarHudIcon', () => ({ ThemedIcon: () => null }));
vi.mock('@/hooks/use-kids-mode', () => ({ useKidsModeLock: () => false }));

function pointer(target: EventTarget, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerType: { value: 'mouse' }, pointerId: { value: 1 } });
  fireEvent(target as HTMLElement, event);
}

it('drops a menu destination onto Home, restores its link after remount, and unpins it with a second drop', () => {
  localStorage.clear();
  const item = NAV_ITEMS.find(row => row.label === 'Arcade')!;
  const renderMenu = () => render(<MemoryRouter>
    <MobileMenuGrid items={[item]} currentPath="/app" notificationCount={0} onNavigate={vi.fn()} />
    <HomeShortcuts />
  </MemoryRouter>);
  const drop = (cancel = false) => {
    const tile = document.querySelector('[data-reorder-item]')!;
    pointer(tile, 'pointerdown', 100, 250);
    pointer(document, 'pointermove', 100, 220);
    const target = document.querySelector('[data-home-shortcut-drop]')!;
    expect(target).toBeTruthy();
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ ...target.getBoundingClientRect(), left: 0, top: 0, right: 390, bottom: 100 });
    pointer(document, cancel ? 'pointercancel' : 'pointerup', 95, 43);
  };
  let view = renderMenu();
  drop(true);
  expect(readNavOrder('home')).toEqual([]);
  drop();
  expect(readNavOrder('menu')).toEqual([]);
  expect(readNavOrder('home')).toEqual([navItemId(item)]);
  view.unmount();
  view = renderMenu();
  expect(view.container.querySelector('[data-home-shortcuts] a')?.getAttribute('href')).toBe(item.path);
  drop();
  expect(view.container.querySelector('[data-home-shortcuts]')).toBeNull();
});
