import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { GlassIndicator, glideOnTabClick } from '@/components/app/feeds/GlassIndicator';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import type { MenuLayout } from '@/lib/menu-layout';
import type { NavItem } from '@/types/app.types';
import { MenuReorderHint, MobileMenuGrid, menuIconKey } from './MobileMenuGrid';
import type { MenuGroup } from './menu-groups';

/**
 * The phone menu's body, in the layout picked in Settings (lib/menu-layout):
 *
 *  - tabs (default): one group at a time, three big tiles a row. The tab row
 *    itself sits in the sheet's header beside the search button (MenuTabs);
 *    a sideways swipe on the tiles moves to the next group.
 *  - sections: every group under a small header, the classic four a row.
 *  - folders: Main's tiles, then one folder tile per other group showing four
 *    of its icons; tapping one opens it in place under the folders.
 *
 * Searching always shows one ranked list, whatever the layout.
 */

interface MobileMenuLayoutProps {
  layout: MenuLayout;
  groups: MenuGroup[];
  /** Search results, or every row in Kids Mode: shown flat. */
  flatItems: NavItem[];
  searching: boolean;
  activeTab: number;
  onTabChange: (index: number) => void;
  currentPath: string;
  notificationCount: number;
  messageCount?: number;
  onNavigate: () => void;
}

export function MobileMenuLayout({
  layout, groups, flatItems, searching, activeTab, onTabChange,
  currentPath, notificationCount, messageCount, onNavigate,
}: MobileMenuLayoutProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const swipeRef = useRef<{ x: number; y: number; dir: number } | null>(null);
  const lastDirRef = useRef(0);
  const kidsMode = useKidsModeLock();
  // An opened folder lands under the folders, often below the fold.
  const openPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openFolder) openPanelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [openFolder, reduceMotion]);

  const gridProps = { currentPath, notificationCount, messageCount, onNavigate };

  if (searching || kidsMode || groups.length === 0) {
    return <MobileMenuGrid {...gridProps} items={flatItems} searching={searching} columns={layout === 'sections' ? 4 : 3} />;
  }

  if (layout === 'sections') {
    return (
      <div data-menu-layout="sections">
        {groups.map((group, i) => (
          <section key={group.id} data-menu-group={group.id}>
            <h3 className={cn('mx-0.5 mb-2 flex items-baseline justify-between', i === 0 ? 'mt-0.5' : 'mt-4')}>
              <span className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-zinc-200">{t(group.labelKey, group.fallback)}</span>
              <span className="text-[12px] text-zinc-500 tabular-nums">{group.items.length}</span>
            </h3>
            <MobileMenuGrid {...gridProps} items={group.items} columns={4} showHint={false} />
          </section>
        ))}
        <MenuReorderHint />
      </div>
    );
  }

  if (layout === 'folders') {
    const [main, ...folders] = groups;
    const open = folders.find((group) => group.id === openFolder) ?? null;
    return (
      <div data-menu-layout="folders">
        <MobileMenuGrid {...gridProps} items={main.items} columns={3} showHint={false} />
        <div className="grid grid-cols-4 gap-2 mt-2">
          {folders.map((group) => {
            const isOpen = group.id === openFolder;
            return (
              <button
                key={group.id}
                type="button"
                data-menu-folder={group.id}
                aria-expanded={isOpen}
                onClick={() => setOpenFolder(isOpen ? null : group.id)}
                className={cn(
                  'flex min-h-[96px] flex-col items-center justify-start gap-1.5 rounded-[14px] border px-1 pt-2.5 pb-2 transition-colors',
                  isOpen
                    ? 'bg-white/[0.12] border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                    : 'bg-white/[0.04] border-white/[0.08] active:bg-white/[0.08]',
                )}
              >
                <span data-menu-folder-icons className="grid grid-cols-2 gap-[3px] rounded-[10px] bg-white/[0.06] p-[4px]">
                  {group.items.slice(0, 4).map((item) => {
                    const key = menuIconKey(item);
                    return key
                      ? <ThemedIcon key={item.label} icon={key} alt="" className="h-[20px] w-[20px] object-contain" loading="lazy" decoding="async" />
                      : <span key={item.label} className="h-[20px] w-[20px]" />;
                  })}
                </span>
                <span className="w-full truncate text-center text-[12px] font-bold leading-tight text-zinc-100">{t(group.labelKey, group.fallback)}</span>
                <span className="-mt-1 text-[10.5px] leading-none text-zinc-500 tabular-nums">{group.items.length}</span>
              </button>
            );
          })}
        </div>
        {open && (
          <motion.div
            key={open.id}
            ref={openPanelRef}
            data-menu-folder-open={open.id}
            initial={reduceMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-3 rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-3"
          >
            <p className="mx-0.5 mb-2.5 text-[15px] font-extrabold text-zinc-100">{t(open.labelKey, open.fallback)}</p>
            <MobileMenuGrid {...gridProps} items={open.items} columns={3} showHint={false} />
          </motion.div>
        )}
        <MenuReorderHint />
      </div>
    );
  }

  // Tabs.
  const index = Math.min(activeTab, groups.length - 1);
  const group = groups[index];
  const go = (next: number) => {
    if (next < 0 || next >= groups.length || next === index) return;
    lastDirRef.current = next > index ? 1 : -1;
    onTabChange(next);
  };
  return (
    <div
      data-menu-layout="tabs"
      onTouchStart={(e) => {
        const touch = e.touches[0];
        swipeRef.current = touch ? { x: touch.clientX, y: touch.clientY, dir: 0 } : null;
      }}
      onTouchEnd={(e) => {
        const start = swipeRef.current;
        swipeRef.current = null;
        const touch = e.changedTouches[0];
        if (!start || !touch) return;
        // A held tile is being dragged (use-drag-reorder): leave it alone.
        if ((e.currentTarget as HTMLElement).querySelector('[data-menu-reorder="dragging"]')) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <motion.div
        key={group.id}
        // Every tab as tall as the longest, so the sheet does not jump in
        // height as you move between them.
        style={{ minHeight: tabsMinHeight(groups) }}
        initial={reduceMotion || !lastDirRef.current ? false : { opacity: 0, x: lastDirRef.current * 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <MobileMenuGrid {...gridProps} items={group.items} columns={3} showHint={false} />
      </motion.div>
      <div className="mt-3.5 flex justify-center gap-1.5" aria-hidden>
        {groups.map((g, i) => (
          <span key={g.id} className={cn('h-1.5 rounded-full bg-zinc-400 transition-all', i === index ? 'w-[18px] opacity-90' : 'w-1.5 opacity-35')} />
        ))}
      </div>
      <MenuReorderHint />
    </div>
  );
}

/** Height of the longest group's three-a-row grid (104px tiles, 8px gaps). */
const tabsMinHeight = (groups: MenuGroup[]) => {
  const rows = Math.ceil(Math.max(...groups.map((g) => g.items.length)) / 3);
  return rows * 104 + Math.max(0, rows - 1) * 8;
};

interface MenuTabsProps {
  groups: MenuGroup[];
  activeTab: number;
  onTabChange: (index: number) => void;
  className?: string;
}

/**
 * The group words, in the sheet's header beside the search button. Same 12px
 * corners as the search field; the lit word wears the feed tabs' glass.
 */
export function MenuTabs({ groups, activeTab, onTabChange, className }: MenuTabsProps) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [rect, setRect] = useState({ x: 0, y: 0, width: 0, height: 0, ready: false });
  const [glide, setGlide] = useState(false);
  const index = Math.min(activeTab, groups.length - 1);

  useLayoutEffect(() => {
    const measure = () => {
      const button = buttonRefs.current[index];
      if (!button) return;
      const next = { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight, ready: true };
      // Same rect, same state: a fresh object every pass would loop renders.
      setRect((prev) => (prev.ready && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height ? prev : next));
    };
    measure();
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [index, groups]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      data-menu-tabs
      data-search-surface
      className={cn('relative flex min-w-0 flex-1 items-stretch rounded-xl border border-white/10 bg-white/5 p-[3px]', className)}
    >
      <GlassIndicator rect={rect} borderRadius="9px" enableTransition={glide} />
      {groups.map((group, i) => (
        <button
          key={group.id}
          ref={(el) => { buttonRefs.current[i] = el; }}
          type="button"
          role="tab"
          aria-selected={i === index}
          data-menu-tab={group.id}
          onClick={() => { setGlide(glideOnTabClick()); onTabChange(i); }}
          className={cn(
            'relative z-[1] flex h-[34px] min-w-0 flex-auto items-center justify-center whitespace-nowrap rounded-[9px] px-1.5 text-[13px] font-semibold transition-colors',
            i === index ? 'text-white' : 'text-zinc-400',
          )}
        >
          {t(group.labelKey, group.fallback)}
        </button>
      ))}
    </div>
  );
}
