import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { House } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { preloadRoute } from '@/lib/route-preload';
import { isHomePath } from '@/lib/home-path';
import { resolveHomeNavIntent } from '@/lib/home-nav-intent';
import { scrollDocumentToSmooth } from '@/lib/document-scroll';
import { openStageModal } from '@/contexts/StageContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { ThemedIcon, type ThemeIconKey } from '@/components/app/war/WarHudIcon';
import type { NavItem } from '@/types/app.types';
import { NAV_LABEL_KEYS } from './SidebarNavItem';
import { NAV_ITEMS } from '@/constants/app.constants';
import { applyNavOrder } from '@/lib/nav-order';
import { useHomeShortcuts, useNavOrderEditor } from '@/hooks/use-nav-order';
import { useDragReorder } from '@/hooks/use-drag-reorder';
import { navItemId } from './nav-item-id';
import { defaultMenuGroupOf } from './menu-groups';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { MENU_GROUP_MOVES_PREF_KEY, isMenuGroupId, readMenuGroupMoves, useMenuGroupMoves, writeMenuGroupMoves } from '@/lib/menu-group-moves';

const DEFAULT_MENU_IDS = NAV_ITEMS.map(navItemId);

/**
 * The mobile menu sheet's tile grid.
 *
 * Four columns of glossy 3D icons, the same per-theme artwork the feed tabs
 * and empty states use (public/theme-icons/<theme>/<key>.webp), so the sheet
 * reskins with the theme for free. Every rail row maps to a piece of that set:
 * a flat glyph beside the glossy renders reads as a broken tile, so the glyph
 * is only the fallback for artwork that fails to load.
 */

// Rail row → artwork. Rows without a bespoke render borrow the closest one.
const NAV_ICON_KEYS: Record<string, ThemeIconKey> = {
  Home: 'home', Profile: 'profile', Explore: 'search', Notifications: 'notifications',
  Messages: 'messages', Arcade: 'arcade', Apps: 'stores', Communities: 'communities', Assistant: 'assistant',
  Settings: 'settings', Stages: 'stages', Bookmarks: 'bookmarks', Command: 'command',
  Editor: 'videos', Creator: 'paint',
  Feedback: 'messages', Events: 'events', Leaderboard: 'trophy', 'Feature Requests': 'features', Staking: 'staking',
  SuperPowers: 'superpowers', Governance: 'governance', DAO: 'dao', Bounties: 'bounties',
  Careers: 'careers', Stores: 'stores', Fractions: 'fractions', 'NFT Market': 'nfts', Usernames: 'usernames',
  Accounts: 'accounts', Advertising: 'ads', 'Live TV': 'tv', Prompt: 'wand',
  Glossary: 'glossary', 'Compare Riftn': 'glossary', Stats: 'stats', 'Buy Tokens': 'buy', Bridge: 'bridge',
  Wallet: 'buy', Affiliate: 'subscriptions', Converter: 'videos', Migrate: 'bridge',
  Guide: 'pinned', Docs: 'posts', Blog: 'email',
  // Search-only rows (nav-search.ts): only shown once something is typed.
  Videos: 'videos', Shorts: 'videos', Music: 'audio', 'Top 100': 'trophy', 'AI Agents': 'assistant',
  'My Bounties': 'bounties', Premium: 'superpowers', Pricing: 'buy', Creators: 'subscriptions',
  'Connect AI': 'command', Packs: 'images', 'Public Chat': 'messages', Planned: 'events',
  'Live Studio': 'live', Launchpad: 'buy',
};

/** The glossy artwork for a menu row, or undefined to fall back to its glyph. */
export const menuIconKey = (item: NavItem): ThemeIconKey | undefined => item.themedIcon ?? NAV_ICON_KEYS[item.label];

interface TileShellProps {
  /** Three-column grids (tabs, folders) get bigger art and names. */
  big?: boolean;
  label: string;
  iconKey?: ThemeIconKey;
  glyph: LucideIcon;
  active?: boolean;
  badge?: number;
}

function TileBody({ big = false, label, iconKey, glyph: Glyph, active, badge }: TileShellProps) {
  // A missing or blocked file would otherwise leave a broken-image box.
  const [artFailed, setArtFailed] = useState(false);
  const { theme } = useAppTheme();
  useEffect(() => setArtFailed(false), [iconKey, theme]);
  const labelRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      if (el.scrollWidth > el.clientWidth + 0.5) {
        el.style.fontSize = `${Math.max(10, ((big ? 13 : 11.5) * el.clientWidth) / el.scrollWidth).toFixed(2)}px`;
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el); // the tile: its width, not the label height the fit changes
    return () => ro.disconnect();
  }, [label, theme, big]);
  return (
    <>
      <span className={cn('relative flex items-center justify-center', big ? 'h-[58px] w-[58px]' : 'h-[44px] w-[44px]')}>
        {iconKey && !artFailed ? (
          <ThemedIcon
            icon={iconKey}
            alt=""
            className={cn('object-contain', big ? 'h-[58px] w-[58px]' : 'h-[44px] w-[44px]')}
            loading="lazy"
            decoding="async"
            onError={() => setArtFailed(true)}
          />
        ) : (
          <Glyph data-menu-glyph className={cn('text-zinc-200', big ? 'h-9 w-9' : 'h-7 w-7')} strokeWidth={1.75} />
        )}
        {!!badge && badge > 0 && (
          <span data-unread-chip data-menu-badge className="absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      {/* Names fit instead of ending in "…": two words wrap onto a second
          line, and only a single word too long for the tile eases down. */}
      <span ref={labelRef} className={cn('w-full line-clamp-2 text-center leading-tight [text-wrap:balance]', big ? 'text-[13px]' : 'text-[11.5px]', active ? 'font-semibold text-white' : 'font-medium text-zinc-200')}>
        {label}
      </span>
    </>
  );
}

const tileClass = (active: boolean, big = false) => cn(
  // justify-start: in a row where one name wraps, every icon stays on one line.
  'flex flex-col items-center justify-start rounded-[14px] border transition-colors',
  big ? 'gap-2 px-1 pt-3 pb-2.5 min-h-[104px]' : 'gap-1.5 px-1 py-2.5 min-h-[84px]',
  active
    ? 'bg-white/[0.12] border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
    : 'bg-white/[0.04] border-white/[0.08] active:bg-white/[0.08]',
);

interface MobileMenuGridProps {
  /** Rail rows to show, already filtered by the menu search. */
  items: NavItem[];
  /** True while a search query is typed: order is by rank. */
  searching?: boolean;
  currentPath: string;
  notificationCount: number;
  messageCount?: number;
  onNavigate: () => void;
  /** 3 = big tiles (tabs and folders layouts), 4 = the classic grid. */
  columns?: 3 | 4;
  /** The "hold and drag" line under the grid; one per menu, not per group. */
  showHint?: boolean;
  /** Part of a grouped menu: tiles can be dropped on another group. */
  moveHint?: boolean;
}

export function MobileMenuGrid({ items, searching = false, currentPath, notificationCount, messageCount, onNavigate, columns = 4, showHint = true, moveHint = false }: MobileMenuGridProps) {
  const big = columns === 3;
  const { t } = useTranslation();
  const onHome = isHomePath(currentPath);

  // Hold a tile and drag it to rearrange. Off while searching: the results
  // are ordered by how well they match, not by the person's order.
  const { order: savedOrder, customised, save, reset } = useNavOrderEditor('menu', DEFAULT_MENU_IDS);
  const ordered = useMemo(
    () => (searching ? items : applyNavOrder(items, savedOrder, navItemId)),
    [items, savedOrder, searching],
  );
  const byId = useMemo(() => new Map(ordered.map((item) => [navItemId(item), item])), [ordered]);
  const ids = useMemo(() => ordered.map(navItemId), [ordered]);
  const onCommit = useCallback((next: string[]) => save(next), [save]);
  const { pins, toggle } = useHomeShortcuts();
  const prefs = useUserPreferences();
  const homeTarget = useRef<HTMLDivElement>(null);
  const onDropOutside = (id: string, x: number, y: number) => {
    // Dropped on another group's tab, section header or folder: move it there.
    const target = document.elementsFromPoint(x, y)
      .map((el) => (el as HTMLElement).closest?.('[data-menu-drop-group]') as HTMLElement | null)
      .find(Boolean);
    const groupId = target?.dataset.menuDropGroup;
    if (groupId && isMenuGroupId(groupId)) {
      const item = byId.get(id);
      if (!item || !items.some((i) => navItemId(i) === id)) return false;
      const moves = { ...readMenuGroupMoves() };
      const home = defaultMenuGroupOf(item);
      const current = moves[id] ?? home;
      if (current === groupId) return false;
      if (home === groupId) delete moves[id];
      else moves[id] = groupId;
      writeMenuGroupMoves(moves);
      prefs?.setPref(MENU_GROUP_MOVES_PREF_KEY, readMenuGroupMoves());
      return true;
    }
    const rect = homeTarget.current?.getBoundingClientRect();
    if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
    toggle(id);
    return true;
  };
  const { order, draggingId, animateNextChange, itemProps } = useDragReorder({ ids, onCommit, onDropOutside, disabled: searching });
  const onReset = useCallback(() => { animateNextChange(); reset(); }, [animateNextChange, reset]);

  const isActive = (item: NavItem) =>
    item.path === '/app'
      ? onHome
      : !item.external && !item.action && currentPath.startsWith(item.path);

  const renderNavTile = (item: NavItem) => {
    const label = t(NAV_LABEL_KEYS[item.label] || item.label, item.label);
    const active = isActive(item);
    const drag = itemProps(navItemId(item));
    const lifted = draggingId === navItemId(item);
    const body = (
      <TileBody
        big={big}
        label={label}
        iconKey={menuIconKey(item)}
        glyph={item.icon}
        active={active}
        badge={item.path === '/app/notifications' ? notificationCount : item.path === '/app/messages' ? messageCount : undefined}
      />
    );

    if (item.external) {
      return (
        <a key={item.label} {...drag} href={item.path} target="_blank" rel="noopener noreferrer" onClick={onNavigate} data-menu-tile="idle" className={cn(tileClass(false, big), lifted && liftedClass)}>
          {body}
        </a>
      );
    }
    if (item.action) {
      return (
        <button
          key={item.label}
          {...drag}
          type="button"
          onClick={() => { if (item.action === 'open-stages') openStageModal(); onNavigate(); }}
          data-menu-tile="idle" className={cn(tileClass(false, big), lifted && liftedClass)}
        >
          {body}
        </button>
      );
    }
    return (
      <Link
        key={item.label}
        {...drag}
        to={item.path}
        aria-current={active ? 'page' : undefined}
        onClick={(e) => {
          if (item.path === '/app') {
            // Same Home semantics as the rail: first tap on Home scrolls to
            // the top, a second one refreshes (lib/home-nav-intent).
            const intent = resolveHomeNavIntent(onHome);
            if (intent === 'refresh') window.dispatchEvent(new CustomEvent('home-refresh'));
            else if (intent === 'scrollToTop') scrollDocumentToSmooth();
            if (onHome) e.preventDefault();
          }
          onNavigate();
        }}
        onTouchStart={() => preloadRoute(item.path)}
        onFocus={() => preloadRoute(item.path)}
        data-menu-tile={active ? 'active' : 'idle'} className={cn(tileClass(active, big), lifted && liftedClass)}
      >
        {body}
      </Link>
    );
  };

  // The person's own order (default: the rail's), one continuous grid.
  return (
    <>
      {draggingId && createPortal(
        <div ref={homeTarget} data-home-shortcut-drop role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[10000] flex h-[14dvh] items-end justify-center pb-2">
          <span className="flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-lg">
            <House className="size-4" />{t(pins.includes(draggingId) ? 'communities.unpin' : 'communities.pin')} · {t('nav.home')}
          </span>
        </div>, document.body)}
      {draggingId && moveHint && createPortal(
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-0 z-[10000] flex justify-center pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <span className="rounded-full bg-background px-4 py-2 text-[13px] font-semibold text-foreground shadow-lg">
            {t('nav.moveGroupHint', { defaultValue: 'Drop on another tab to move it there' })}
          </span>
        </div>, document.body)}
      <nav className={cn('grid gap-2', big ? 'grid-cols-3' : 'grid-cols-4')} data-menu-reorder={draggingId ? 'dragging' : 'idle'}>
        {order.map((id) => byId.get(id)).filter((item): item is NavItem => !!item).map(renderNavTile)}
      </nav>
      {!searching && showHint && (
        <p data-menu-reorder-hint className="mt-3 flex items-center justify-center gap-1 px-2 text-center text-[13px] leading-[1.35] text-zinc-500">
          <span>{t('nav.reorderHint', { defaultValue: 'Hold and drag any icon to rearrange' })}</span>
          {customised && (
            <button type="button" onClick={onReset} className="-my-3 flex-none px-2 py-3 font-semibold text-zinc-300 underline-offset-2 hover:underline">
              {t('nav.reorderReset', { defaultValue: 'Reset' })}
            </button>
          )}
        </p>
      )}
    </>
  );
}

const liftedClass = 'bg-white/[0.16] border-white/30 shadow-[0_12px_28px_rgba(0,0,0,0.45)]';

/**
 * The "hold and drag" line with its Reset, for a layout made of several grids
 * (lib/menu-layout), where each grid would otherwise print its own copy.
 */
export function MenuReorderHint() {
  const { t } = useTranslation();
  const { customised: reordered, reset: resetOrder } = useNavOrderEditor('menu', DEFAULT_MENU_IDS);
  const moves = useMenuGroupMoves();
  const prefs = useUserPreferences();
  const moved = Object.keys(moves).length > 0;
  const customised = reordered || moved;
  // Reset puts every tile back in its own group and order.
  const reset = () => {
    resetOrder();
    if (moved) { writeMenuGroupMoves({}); prefs?.setPref(MENU_GROUP_MOVES_PREF_KEY, {}); }
  };
  return (
    <p data-menu-reorder-hint className="mt-3 flex items-center justify-center gap-1 px-2 text-center text-[13px] leading-[1.35] text-zinc-500">
      <span>{t('nav.reorderHintGroups', { defaultValue: 'Hold and drag any icon to rearrange, or onto another tab to move it' })}</span>
      {customised && (
        <button type="button" onClick={reset} className="-my-3 flex-none px-2 py-3 font-semibold text-zinc-300 underline-offset-2 hover:underline">
          {t('nav.reorderReset', { defaultValue: 'Reset' })}
        </button>
      )}
    </p>
  );
}
