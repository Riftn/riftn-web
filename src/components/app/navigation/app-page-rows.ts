/**
 * Our pages as menu rows, for surfaces that point at a page rather than
 * navigate the menu: the page card a riftn.com link turns into, and the
 * "Pages" group in the @ list.
 */
import type { NavItem } from '@/types/app.types';
import { NAV_ITEMS } from '@/constants/app.constants';
import { SEARCH_ONLY_ITEMS } from './nav-search';
import { NAV_LABEL_KEYS } from './SidebarNavItem';
import { appPageParent } from '@/lib/app-page-paths';

/** Every page someone can link to: the menu, then the search-only rows. */
export const LINKABLE_PAGE_ROWS: NavItem[] = [...NAV_ITEMS, ...SEARCH_ONLY_ITEMS].filter(
  (item) => !item.external && !item.action && item.path.startsWith('/'),
);

function swap(path: string): string {
  return path.startsWith('/app/') ? path.slice(4) : `/app${path}`;
}

/** The menu row for a page path, falling back to the page an item sits on. */
export function appPageRow(pagePath: string): NavItem | null {
  const find = (p: string) =>
    LINKABLE_PAGE_ROWS.find((item) => item.path === p || item.path === swap(p)) ?? null;
  const own = find(pagePath);
  if (own) return own;
  const parent = appPageParent(pagePath);
  return parent ? find(parent) : null;
}

type T = (key: string, fallback: string) => string;
export function appPageLabel(item: NavItem, t: T): string {
  return t(NAV_LABEL_KEYS[item.label] || item.label, item.label);
}
