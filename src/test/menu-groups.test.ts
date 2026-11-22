import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/constants/app.constants';
import { MENU_GROUPS, MENU_UNGROUPED, groupMenuItems } from '@/components/app/navigation/menu-groups';
import { normaliseMenuLayout } from '@/lib/menu-layout';
import { sanitiseMenuGroupMoves } from '@/lib/menu-group-moves';
import { navItemId } from '@/components/app/navigation/nav-item-id';

describe('menu groups', () => {
  it('gives every menu page a group, except the ones left out on purpose', () => {
    const named = new Set(MENU_GROUPS.flatMap((group) => group.labels));
    const homeless = NAV_ITEMS.map((item) => item.label).filter((label) => !named.has(label) && !MENU_UNGROUPED.has(label));
    expect(homeless).toEqual([]);
  });

  it('never names a page twice', () => {
    const labels = MENU_GROUPS.flatMap((group) => group.labels);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('keeps Main to one 3x3 screen', () => {
    const main = groupMenuItems(NAV_ITEMS)[0];
    expect(main.id).toBe('main');
    expect(main.items.length).toBeLessThanOrEqual(9);
  });

  it('puts a page no group names at the end of the last group', () => {
    const extra = { ...NAV_ITEMS[1], label: 'Brand New Page', path: '/brand-new' };
    const groups = groupMenuItems([...NAV_ITEMS, extra]);
    expect(groups[groups.length - 1].items.at(-1)?.label).toBe('Brand New Page');
  });

  it('drops empty groups and leaves Home out', () => {
    const groups = groupMenuItems(NAV_ITEMS.filter((item) => item.label === 'Home' || item.label === 'Settings'));
    expect(groups.map((group) => group.id)).toEqual(['main']);
    expect(groups[0].items.map((item) => item.label)).toEqual(['Settings']);
  });

  it('defaults the layout to tabs', () => {
    expect(normaliseMenuLayout(undefined)).toBe('tabs');
    expect(normaliseMenuLayout('junk')).toBe('tabs');
    expect(normaliseMenuLayout('folders')).toBe('folders');
  });

  it('moves a page to the group the person dropped it on, and only there', () => {
    const wallet = NAV_ITEMS.find((item) => item.label === 'Wallet')!;
    const id = navItemId(wallet);
    const groups = groupMenuItems(NAV_ITEMS, { [id]: 'create' });
    expect(groups.find((g) => g.id === 'main')!.items.map((i) => i.label)).not.toContain('Wallet');
    expect(groups.find((g) => g.id === 'create')!.items.map((i) => i.label)).toContain('Wallet');
    expect(groups.flatMap((g) => g.items).filter((i) => i.label === 'Wallet')).toHaveLength(1);
  });

  it('drops moves that are not a real group', () => {
    expect(sanitiseMenuGroupMoves({ 'nav.wallet': 'nowhere', 'nav.stats': 'money' })).toEqual({ 'nav.stats': 'money' });
  });
});

