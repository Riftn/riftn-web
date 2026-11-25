/**
 * The phone menu's default groups.
 *
 * The menu used to be one grid of 40+ tiles. It now sorts them into five
 * groups, shown as tabs (default), as headed sections or as folders, picked in
 * Settings > Layout (lib/menu-layout). Same groups and order in the app
 * (riftn-mobile libs/menuGroups.ts), keyed there by the same ids.
 *
 * Keyed by NAV_ITEMS label. Home is left out on purpose: the bottom bar and the
 * logo already go home, and it kept the Main tab at a clean 3x3. A page in
 * NAV_ITEMS that no group names still shows, at the end of the last group, so a
 * new page can never fall out of the menu (src/test/menu-groups.test.ts checks
 * every page has a home).
 */
import type { NavItem } from '@/types/app.types';
import type { MenuGroupMoves } from '@/lib/menu-group-moves';
import { navItemId } from './nav-item-id';

export type MenuGroupId = 'main' | 'create' | 'discover' | 'money' | 'riftn';

export interface MenuGroupDef {
  id: MenuGroupId;
  labelKey: string;
  fallback: string;
  labels: readonly string[];
}

export const MENU_GROUPS: readonly MenuGroupDef[] = [
  { id: 'main', labelKey: 'nav.groups.main', fallback: 'Main', labels: ['Profile', 'Explore', 'Notifications', 'Messages', 'Communities', 'Bookmarks', 'Assistant', 'Wallet', 'Settings'] },
  { id: 'create', labelKey: 'nav.groups.create', fallback: 'Create', labels: ['Creator', 'Editor', 'Stages', 'Live TV', 'Prompt', 'Command', 'Converter', 'Migrate', 'Packs'] },
  { id: 'discover', labelKey: 'nav.groups.discover', fallback: 'Discover', labels: ['Events', 'Arcade', 'Apps', 'Leaderboard', 'Stats', 'AI Agents', 'Creators'] },
  { id: 'money', labelKey: 'nav.groups.money', fallback: 'Money', labels: ['Staking', 'SuperPowers', 'Fractions', 'Usernames', 'Accounts', 'Bounties', 'Affiliate', 'Advertising', 'Stores'] },
  { id: 'riftn', labelKey: 'nav.groups.riftn', fallback: 'Riftn', labels: ['Feature Requests', 'Feedback', 'Governance', 'DAO', 'Careers', 'Guide', 'Glossary', 'Compare Riftn', 'Docs', 'Blog', 'Connect AI'] },
];

/** Shown only by the menu search, never in a group. */
export const MENU_UNGROUPED = new Set(['Home']);

export interface MenuGroup extends MenuGroupDef {
  items: NavItem[];
}

/** The group a page sits in by default, if any. */
export function defaultMenuGroupOf(item: NavItem): MenuGroupId | null {
  return MENU_GROUPS.find((def) => def.labels.includes(item.label))?.id ?? null;
}

/**
 * Sort the visible rows into the groups, in each group's default order. Pages
 * the person moved to another group (lib/menu-group-moves) go to the end of
 * that group instead; the dragged menu order then places them within it.
 */
export function groupMenuItems(items: readonly NavItem[], moves: MenuGroupMoves = {}): MenuGroup[] {
  const byLabel = new Map(items.map((item) => [item.label, item]));
  const movedTo = (item: NavItem) => moves[navItemId(item)];
  const placed = new Set<string>(MENU_UNGROUPED);
  const groups = MENU_GROUPS.map((def) => {
    const groupItems: NavItem[] = [];
    for (const label of def.labels) {
      const item = byLabel.get(label);
      if (!item) continue;
      const target = movedTo(item);
      if (target && target !== def.id) continue;
      groupItems.push(item); placed.add(label);
    }
    return { ...def, items: groupItems };
  });
  for (const item of items) {
    if (placed.has(item.label)) continue;
    const target = movedTo(item);
    const group = target ? groups.find((g) => g.id === target) : undefined;
    if (group) { group.items.push(item); placed.add(item.label); }
  }
  const leftovers = items.filter((item) => !placed.has(item.label));
  if (leftovers.length) groups[groups.length - 1].items.push(...leftovers);
  // A group with nothing in it (Kids Mode keeps only a few pages) is dropped.
  return groups.filter((group) => group.items.length > 0);
}
