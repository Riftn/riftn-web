import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { PenSquare, LogIn, CornerDownLeft } from "lucide-react";
import LogOut from "@/components/ui/cut-icons/sign-out";

import Search from "@/components/ui/cut-icons/search";
import X from "@/components/ui/cut-icons/close";

import { DhbCoin } from '@/components/app/DhbAmount';
import { useTranslation } from 'react-i18next';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { NAV_ITEMS } from '@/constants/app.constants';
import { useKidsModeLock } from '@/hooks/use-kids-mode';
import { MobileHeader } from './navigation/MobileHeader';
import { DesktopSidebar } from './navigation/DesktopSidebar';
import { groupMenuItems } from './navigation/menu-groups';
import { useMenuLayout } from '@/lib/menu-layout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl } from '@/lib/media-url';
import { useSelfBadge } from '@/hooks/use-self-badge-balance';
import { BadgedName } from '@/components/app/BadgedName';
import { useUnreadNotificationCount } from '@/hooks/use-notifications';
import { useCustomUnreadCount } from '@/hooks/use-custom-notifications';
import { useDmUnreadCount as useTotalUnreadCount } from '@/lib/dm-unread-store';
import { usePublicChatUnreadCount } from '@/hooks/use-public-chat-unread';
import { useIsDesktopViewport } from '@/hooks/use-is-desktop';
import { filterNavItems, exploreSearchHref } from './navigation/nav-search';
import { isOnLiveFeed } from '@/lib/home-path';
import { useSearchHistory } from '@/hooks/use-search-history';
// Lazy: PostModal drags in usePostForm → minting/wallet contract code. A
// static import here would pull the wallet stack into the entry bundle
// (AppSidebar is eager via AppLayout) — scripts/check-entry-bundle.mjs
// fails the build if that happens.
// Lazy for the same reason: @/lib/profiles reaches the wallet vault, and a
// static import from this eager component would put the wallet stack in the
// entry bundle.
const compactFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
function compactCount(n: number): string {
  return compactFormat.format(n);
}

const loadAccountSwitcher = () => import('./navigation/MenuAccountSwitcher');
const MenuAccountSwitcher = React.lazy(() =>
  loadAccountSwitcher().then(m => ({ default: m.MenuAccountSwitcher }))
);
const FollowersListDrawer = React.lazy(() =>
  import('./profile/FollowersListDrawer').then((m) => ({ default: m.FollowersListDrawer })),
);
const PostModal = React.lazy(() =>
  import('@/features/post/PostModal').then(m => ({ default: m.PostModal }))
);
import { useAuth } from '@/contexts/AuthContext';
import { canManageAgents } from '@/lib/agent-access';

// Loaded on first empty search: it pulls in the Requests board's submit code.
// The phone menu's tiles and tab row: only drawn once the menu opens, so they
// load then (and on idle before that), off the first paint.
const loadMenuLayout = () => import('./navigation/MobileMenuLayout');
const MobileMenuLayout = lazy(() => loadMenuLayout().then((m) => ({ default: m.MobileMenuLayout })));
const MenuTabs = lazy(() => loadMenuLayout().then((m) => ({ default: m.MenuTabs })));
const SearchRequestPrompt = lazy(() => import('./navigation/SearchRequestPrompt').then((m) => ({ default: m.SearchRequestPrompt })));

interface AppSidebarProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppSidebar({ isOpen, onOpenChange }: AppSidebarProps) {
  const closeMenu = useCallback(() => onOpenChange(false), [onOpenChange]);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, disconnect, user, walletAddress } = useAuth();
  // Read-only: SelfBadgeSync and the header already own these fetches.
  const dhbBalance = useSelfBadge().balance ?? 0;
  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: customUnread } = useCustomUnreadCount();
  const notificationCount = (unreadCount?.total ?? 0) + (customUnread ?? 0);
  const messagesUnread = useTotalUnreadCount() + usePublicChatUnreadCount();
  const isDesktop = useIsDesktopViewport();

  const { t } = useTranslation();
  // Menu search. Unlike the desktop rail this field is always shown: the sheet
  // is opened deliberately and closed again straight away, so there is no
  // resting state to keep uncluttered.
  const [menuQuery, setMenuQuery] = useSurfaceDraft("components/app/AppSidebar.tsx:menuQuery", '');
  const { addToHistory } = useSearchHistory();
  // `isKidsMode` is in the deps because `filterNavItems` reads the lock
  // directly rather than taking it as an argument — without it here the sheet
  // keeps its adult destinations until the query or the language changes.
  const isKidsMode = useKidsModeLock();
  const visibleNavItems = useMemo(
    () => filterNavItems(NAV_ITEMS, menuQuery, t, canManageAgents(walletAddress)),
    [menuQuery, t, isKidsMode, walletAddress],
  );
  // Every page the menu may show, before any search: what the groups sort.
  const allNavItems = useMemo(
    () => filterNavItems(NAV_ITEMS, '', t, canManageAgents(walletAddress)),
    [t, isKidsMode, walletAddress],
  );
  const menuGroups = useMemo(() => groupMenuItems(allNavItems), [allNavItems]);
  const menuLayout = useMenuLayout();
  const [menuTab, setMenuTab] = useState(0);
  // Tabs layout: search is a button on the tab row until tapped, then that
  // row turns into the search field (X turns it back).
  const tabsHeader = menuLayout === 'tabs' && !isKidsMode && menuGroups.length > 1;
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const showSearchField = !tabsHeader || searchOpen || !!menuQuery;
  const closeSearch = useCallback(() => {
    setMenuQuery.complete(menuQuery, '');
    setSearchOpen(false);
  }, [menuQuery, setMenuQuery]);
  // Fetch the menu's tiles once the page is idle, so the first open is instant.
  useEffect(() => {
    const idle = (window as any).requestIdleCallback as ((cb: () => void) => number) | undefined;
    const id = idle ? idle(() => { void loadMenuLayout(); void loadAccountSwitcher(); }) : window.setTimeout(() => { void loadMenuLayout(); void loadAccountSwitcher(); }, 2000);
    return () => {
      const cancel = (window as any).cancelIdleCallback as ((id: number) => void) | undefined;
      if (idle && cancel) cancel(id); else window.clearTimeout(id);
    };
  }, []);
  // Reset whenever the sheet closes, so it never reopens mid-filter, and
  // always reopens on the first group.
  useEffect(() => {
    if (!isOpen) {
      setMenuQuery.initialize('');
      setSearchOpen(false);
      setMenuTab(0);
    }
  }, [isOpen, setMenuQuery]);

  const runFullSearch = useCallback(() => {
    const query = menuQuery.trim();
    if (!query) return;
    addToHistory(query);
    navigate(exploreSearchHref(query));
    setMenuQuery.complete(menuQuery, '');
    closeMenu();
  }, [menuQuery, addToHistory, navigate, closeMenu, setMenuQuery]);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [postLiveMode, setPostLiveMode] = useState<'video' | undefined>();
  // From the Live feed, the post button opens the composer on Livestream.
  const openPostModal = useCallback(() => {
    if (/^\/(?:app\/)?(?:work|bounty)(?:\/|$)/.test(location.pathname)) {
      navigate('/work/post');
      return;
    }
    setPostLiveMode(isOnLiveFeed(location.pathname) ? 'video' : undefined);
    setIsPostModalOpen(true);
  }, [location.pathname, navigate]);
  // Mount on first open, keep mounted afterwards (close animation).
  const [postModalMounted, setPostModalMounted] = useState(false);
  useEffect(() => {
    if (isPostModalOpen) setPostModalMounted(true);
  }, [isPostModalOpen]);

  // Follower and following numbers under your name in the phone menu, like
  // the app's menu header. Falls back to the @handle when the counts are not
  // on the signed-in user yet.
  const countOf = (n: unknown, alt: unknown): number | null =>
    typeof n === 'number' ? n : Array.isArray(n) ? n.length : typeof alt === 'number' ? alt : null;
  const menuFollowers = user ? countOf(user.followers, user.follower_count) : null;
  const menuFollowing = user ? countOf(user.followings, user.following_count) : null;
  // Tapping a count closes the menu and opens that list, as on the profile.
  const [followList, setFollowList] = useState<'followers' | 'following' | null>(null);
  const [followListMounted, setFollowListMounted] = useState(false);
  const openFollowList = (type: 'followers' | 'following') => {
    closeMenu();
    setFollowListMounted(true);
    setFollowList(type);
  };
  const lastFollowListType = useRef<'followers' | 'following'>('followers');
  if (followList) lastFollowListType.current = followList;

  const mobileNavContent = (
    <>
      {/* Pinned top: identity + menu search */}
      <div className="shrink-0">
      {/* Log in Button - shown at top when not authenticated */}
      {!isAuthenticated && (
        <div className="mb-4 pb-4 px-1">
          <LiquidGlassBubble shimmer noBorder className="w-full box-border cursor-pointer border border-white/30 rounded-2xl" onClick={() => { closeMenu(); setIsPostModalOpen(true); }}>
            <div className="flex items-center justify-center gap-2 font-semibold text-base text-white py-1.5">
              <LogIn className="w-5 h-5" />
              {t('sidebar.logIn')}
            </div>
          </LiquidGlassBubble>
        </div>
      )}

      {/* Who is signed in, and what they hold. The chip opens the wallet. */}
      {isAuthenticated && user && (
        <div className="mb-3 flex items-center gap-3 px-1">
          <Avatar className="h-11 w-11 flex-shrink-0 rounded-xl">
            {user.avatarImageUrl && user.address && (
              <AvatarImage src={buildAvatarUrl(user.address, user.avatarImageUrl)} alt="" className="object-cover rounded-xl" />
            )}
            <AvatarFallback className="rounded-xl bg-zinc-700 text-white text-sm font-medium">
              {(user.displayName || user.username)?.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 text-[15px] font-semibold text-white">
              <BadgedName badgeBalance={user.badgeBalance} username={user.username} lookupId={user.username || user.address}>
                {user.displayName || user.username}
              </BadgedName>
            </p>
            {menuFollowers != null || menuFollowing != null ? (
              <p data-testid="menu-follow-counts" className="flex min-w-0 items-center gap-1 text-[13px] font-semibold text-zinc-400 tabular-nums">
                <button type="button" data-testid="menu-followers" onClick={() => openFollowList('followers')} className="flex min-w-0 items-center gap-1 py-1 -my-1 text-left">
                  <span className="truncate"><span className="font-bold text-zinc-200">{compactCount(menuFollowers ?? 0)}</span> {t('profile.followers')}</span>
                </button>
                <span aria-hidden className="mx-1 flex-shrink-0 font-bold">·</span>
                <button type="button" data-testid="menu-following" onClick={() => openFollowList('following')} className="flex min-w-0 items-center gap-1 py-1 -my-1 text-left">
                  <span className="truncate"><span className="font-bold text-zinc-200">{compactCount(menuFollowing ?? 0)}</span> {t('profile.following')}</span>
                </button>
              </p>
            ) : user.username && <p className="truncate text-[13px] text-zinc-400">@{user.username}</p>}
          </div>
          {Math.floor(dhbBalance) > 0 && (
            <button
              type="button"
              onClick={() => { closeMenu(); navigate('/app/wallet'); }}
              aria-label={t('nav.wallet')}
              data-menu-chip className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-[13px] font-semibold text-white tabular-nums"
            >
              <DhbCoin className="h-4 w-4 align-middle" />
              {Math.floor(dhbBalance).toLocaleString()}
            </button>
          )}
          {/* Every other account saved on this device, one tap away. */}
          <Suspense fallback={null}>
            <MenuAccountSwitcher onNavigate={closeMenu} />
          </Suspense>
        </div>
      )}

      {/* Menu search — filters the list below. Content search is one row away
          via the hand-off at the bottom, which runs whatever is typed on
          Explore rather than leaving the field as a dead end. */}
      {!showSearchField ? (
        <div className="mb-3 flex items-stretch gap-1.5 px-1">
          <button
            type="button"
            // Focus inside the tap itself, or iOS will not raise the keyboard.
            onClick={() => { flushSync(() => setSearchOpen(true)); searchInputRef.current?.focus(); }}
            aria-label={t('sidebar.searchMenu')}
            data-menu-search-button
            data-search-surface
            className="flex w-[42px] flex-none items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 transition-colors active:bg-white/10"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <Suspense fallback={<div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5" />}>
            <MenuTabs groups={menuGroups} activeTab={menuTab} onTabChange={setMenuTab} />
          </Suspense>
        </div>
      ) : (
      <div className="relative mb-3 px-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          ref={searchInputRef}
          type="text"
          value={menuQuery}
          onChange={(e) => setMenuQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); runFullSearch(); }
            if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
          }}
          placeholder={t('sidebar.searchMenu')}
          aria-label={t('sidebar.searchMenu')}
          data-menu-search
          data-search-surface
          className="w-full h-[42px] pl-10 pr-9 rounded-xl bg-white/5 border border-white/10 text-[15px] text-white placeholder:text-zinc-500 outline-none focus:border-white/30 transition-colors"
        />
        {(menuQuery || (tabsHeader && searchOpen)) && (
          <button
            type="button"
            onClick={closeSearch}
            aria-label={t('sidebar.clearSearch')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      )}

      </div>

      {/* Only the tiles scroll. No-drag, as in the app: the sheet drags from
          its top only, so a swipe on the tiles never nudges the whole sheet
          (which also smeared the pinned footer while it moved). */}
      <div data-vaul-no-drag className="-mx-1 -mt-1 pt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2 [touch-action:pan-y]">
      {/* Navigation tiles */}
      <Suspense fallback={null}>
      <MobileMenuLayout
        layout={menuLayout}
        groups={menuGroups}
        flatItems={visibleNavItems}
        searching={!!menuQuery.trim()}
        activeTab={menuTab}
        onTabChange={setMenuTab}
        currentPath={location.pathname}
        notificationCount={notificationCount}
        messageCount={messagesUnread}
        onNavigate={closeMenu}
      />
      </Suspense>

      {menuQuery && (
        <>
          {visibleNavItems.length === 0 && (
            menuQuery.trim().length >= 2
              ? <Suspense fallback={null}><SearchRequestPrompt query={menuQuery} source="menu" onNavigate={closeMenu} className="mt-1" /></Suspense>
              : <p className="px-3 py-3 text-sm text-zinc-500">{t('sidebar.noMenuMatches')}</p>
          )}
          <button
            type="button"
            onClick={runFullSearch}
            className="mt-2 flex w-full items-center gap-3 px-3 py-3 rounded-xl text-left text-sm text-zinc-400 border-t border-white/10 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Search className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="truncate">{t('sidebar.searchDehubFor', { query: menuQuery.trim() })}</span>
            <CornerDownLeft className="w-4 h-4 ml-auto flex-shrink-0 opacity-60" />
          </button>
        </>
      )}

      </div>

      {/* Pinned bottom: account actions - only shown when authenticated */}
      {isAuthenticated && (
        <div data-vaul-no-drag data-menu-footer className="shrink-0 -mx-4 space-y-1 border-t border-white/10 px-4 pt-2">
          <div className="-mx-1.5 flex items-center justify-between">
            {/* forgetProfile: logging out revokes this session's tokens
                server-side, so its stored snapshot is dead the moment this
                runs. Left on the list it looked like a working profile and
                dumped you into the sign-in sheet on tap. Other saved accounts
                are untouched — that is what makes this a log out of ONE
                account rather than of the device. */}
            <button
              onClick={() => { closeMenu(); disconnect({ forgetProfile: true }); }}
              className="flex h-12 items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium text-zinc-400 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
              {t('sidebar.logOut')}
            </button>
            <button
              type="button"
              onClick={() => { closeMenu(); openPostModal(); }}
              aria-label={t('sidebar.post')}
              title={t('sidebar.post')}
              className="flex h-12 w-12 items-center justify-center text-white hover:text-zinc-300 transition-colors"
            >
              <PenSquare className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile Header with Drawer */}
      <MobileHeader isOpen={isOpen} onOpenChange={onOpenChange}>
        {mobileNavContent}
      </MobileHeader>

      {/* Desktop Sidebar. Its root is `hidden lg:flex`, so below lg it was a
          fully rendered, fully hidden tree: on a phone 563 of the home page's
          3,672 DOM nodes sat inside display:none desktop chrome, all built and
          diffed by React on every boot. Mounting it only on a desktop viewport
          skips that work; the hook is live, so a rotation or resize past lg
          mounts it at that moment, exactly where the CSS would have revealed
          it. Same gate the right rail uses. */}
      {isDesktop && <DesktopSidebar onPostClick={openPostModal} />}

      {followListMounted && (user?.address || walletAddress) && (
        <Suspense fallback={null}>
          <FollowersListDrawer
            open={followList != null}
            onOpenChange={(open) => { if (!open) setFollowList(null); }}
            profileAddress={user?.address || walletAddress || ''}
            listType={lastFollowListType.current}
          />
        </Suspense>
      )}

      {/* Post Modal */}
      {postModalMounted && (
        <Suspense fallback={null}>
          <PostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} initialLiveMode={postLiveMode} />
        </Suspense>
      )}
    </>
  );
}
