import { useTranslation as _useCopy } from 'react-i18next';
/**
 * UserMentionDrawer Component
 * ===========================
 * A clean bottom drawer for @mention user search.
 * Opens when user types @ in an input, with its own search bar.
 */

import { memo, useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { Loader2, AtSign } from "lucide-react";
import Search from "@/components/ui/cut-icons/search";
import CommunitiesIcon from "@/components/ui/cut-icons/communities";
import Link2 from "@/components/ui/cut-icons/link";

import { cn } from '@/lib/utils';
import { AppState } from '@/components/app/AppState';
import { BadgedName } from '@/components/app/BadgedName';
import { supabase } from '@/integrations/supabase/client';
import { escapeFilterValue } from '@/lib/postgrest-filter';
import { storageImage } from '@/lib/media-url';
import { mentionLinkFor } from '@/lib/dehub-links';
import { filterNavItems } from '@/components/app/navigation/nav-search';
import { LINKABLE_PAGE_ROWS, appPageLabel } from '@/components/app/navigation/app-page-rows';
import {
  AnswerCache,
  fetchPeople,
  guessPeople,
  normalizeMentionQuery,
  onMentionPeopleChange,
  rememberMentionPick,
  settledPeople,
  warmMentionPeople,
} from '@/lib/mention-people';
import type { NavItem } from '@/types/app.types';

export interface MentionUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  /** Staked DHB and grandfathered tier — the badge beside the name. */
  badgeBalance?: number;
  badgeLock?: { tier: string; requirement: number } | null;
  followerCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
  followsYou?: boolean;
  /** The official AI account, which is pinned and badged rather than ranked. */
  isAssistant?: boolean;
  /**
   * What the row is. People (the default) type `@username`; a community or a
   * page types its riftn.com link instead, which the message then shows as a
   * card that opens in the app.
   */
  kind?: 'user' | 'community' | 'page';
  /** Typed in place of `@username` when set. */
  insertText?: string;
  memberCount?: number;
  /** Page rows: the menu row, for its icon. */
  pageRow?: NavItem;
}

/** How many of each group the list shows. People lead; links follow. */
const MAX_COMMUNITIES = 4;
const MAX_PAGES = 4;

/**
 * How long after a letter the server is asked. The first letter of a list
 * goes at once; the wait only spaces out the letters that follow it.
 */
const ASK_AFTER_MS = 110;

const communityAnswers = new AnswerCache<MentionUser>();

/** Public communities and channels whose name or address matches. */
async function searchCommunities(query: string): Promise<MentionUser[]> {
  const pattern = escapeFilterValue(`%${query}%`);
  const { data, error } = await supabase
    .from('communities')
    // `*`: `kind` is newer than the generated types, and naming a column the
    // types do not know fails the build.
    .select('*')
    .eq('is_private', false)
    .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
    .order('member_count', { ascending: false })
    .limit(MAX_COMMUNITIES + 4);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as Array<{ id: string; name: string; slug: string; avatar_url: string | null; member_count: number | null; kind?: string | null }>)
    // Groups are private chats started from Messages, never something to link.
    .filter((c) => c.kind !== 'group')
    .slice(0, MAX_COMMUNITIES)
    .map((c) => ({
      id: `community:${c.id}`,
      kind: 'community' as const,
      username: c.slug,
      displayName: c.name,
      avatarUrl: c.avatar_url ? storageImage(c.avatar_url, 96) : null,
      isVerified: false,
      memberCount: c.member_count ?? undefined,
      insertText: mentionLinkFor.community(c.slug),
    }));
  communityAnswers.set(query, rows);
  return rows;
}

/** Communities an earlier answer named that still match, while the real answer loads. */
function guessCommunities(query: string): MentionUser[] {
  return communityAnswers
    .fromPrefix(query)
    .filter((c) => (c.displayName || '').toLowerCase().includes(query) || c.username.toLowerCase().includes(query))
    .slice(0, MAX_COMMUNITIES);
}

type Translate = (key: string, fallback: string) => string;

/** Our pages that match, through the same search the menu uses. */
export function searchPages(query: string, t: Translate): MentionUser[] {
  if (!query) return [];
  return filterNavItems(LINKABLE_PAGE_ROWS, query, t)
    .filter((item) => !item.external && !item.action && item.path.startsWith('/'))
    .slice(0, MAX_PAGES)
    .map((item) => ({
      id: `page:${item.path}`,
      kind: 'page' as const,
      username: item.path,
      displayName: appPageLabel(item, t),
      avatarUrl: null,
      isVerified: false,
      pageRow: item,
      insertText: mentionLinkFor.page(item.path),
    }));
}

interface UserMentionDropdownProps {
  query: string;
  isOpen: boolean;
  position: { top: number; left: number };
  onSelect: (user: MentionUser) => void;
  onClose: () => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  /**
   * Also offer communities and our pages, which type their link rather than
   * an @. On by default; off where only a person makes sense.
   */
  includeLinks?: boolean;
  /**
   * An @ was just typed in the box this list belongs to. The sheet is built
   * now, closed, so the first letter only has to slide it up.
   */
  armed?: boolean;
}

// Legacy export for compatibility
export function searchUsers(_query: string, _limit: number = 5): MentionUser[] {
  return [];
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

/** Everything a row draws, so a row whose person is unchanged is not drawn again. */
function sameRow(a: MentionUser, b: MentionUser): boolean {
  return a === b || (
    a.id === b.id && a.kind === b.kind && a.username === b.username && a.displayName === b.displayName &&
    a.avatarUrl === b.avatarUrl && a.isVerified === b.isVerified && a.isAssistant === b.isAssistant &&
    a.badgeBalance === b.badgeBalance && a.badgeLock?.tier === b.badgeLock?.tier &&
    a.followerCount === b.followerCount && a.isFollowing === b.isFollowing && a.followsYou === b.followsYou &&
    a.memberCount === b.memberCount && a.insertText === b.insertText && a.pageRow === b.pageRow
  );
}

interface MentionRowProps {
  user: MentionUser;
  index: number;
  selected: boolean;
  /** The group title drawn above this row, when it starts a group in a mixed list. */
  showHeading: boolean;
  onPick: (user: MentionUser) => void;
  onHover: (index: number) => void;
  _copy: ReturnType<typeof _useCopy>['t'];
}

/**
 * One row of the list. Kept apart and memoised because the list is redrawn on
 * every letter while most of its rows stay the same people: narrowing "ma" to
 * "mal" should cost the rows that left, not all ten.
 */
const MentionRow = memo(function MentionRow({ user, index, selected, showHeading, onPick, onHover, _copy }: MentionRowProps) {
  const kind = user.kind ?? 'user';
  const heading = kind === 'community'
    ? _copy('mentionLinks.communities', { defaultValue: 'Communities' })
    : kind === 'page'
      ? _copy('mentionLinks.pages', { defaultValue: 'Pages' })
      : _copy('mentionLinks.people', { defaultValue: 'People' });
  const PageIcon = user.pageRow?.icon;
  return (
              <div>
              {showHeading && (
                <p data-mention-group={kind} className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/35">
                  {heading}
                </p>
              )}
              <button
                type="button"
                data-mention-kind={kind}
                aria-label={kind === 'user'
                  ? _copy("copy.6aad3f5a25b5", { defaultValue: "Mention @{{value1}}", value1: user.username })
                  : _copy('mentionLinks.linkTo', { defaultValue: 'Link {{name}}', name: user.displayName || user.username })}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(user);
                }}
                // Touch-end arrives after the keyboard has already started
                // resizing the drawer, which can move this row and cancel the
                // selection. Commit while the row is still under the finger.
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPick(user);
                }}
                // Assistive technology and keyboard activation do not emit a
                // mouse/touch start event.
                onClick={(e) => {
                  if (e.detail === 0) onPick(user);
                }}
                onMouseEnter={() => onHover(index)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all duration-100",
                  selected
                    ? "bg-white/[0.08]"
                    : "bg-transparent active:bg-white/[0.06]"
                )}
              >
                {kind === 'user' ? (
                  <>
                    <Avatar className="w-10 h-10 flex-shrink-0 rounded-xl ring-1 ring-white/[0.06]">
                      <AvatarImage src={user.avatarUrl || undefined} className="object-cover" />
                      <AvatarFallback className="bg-white/[0.06] text-white/50 text-sm rounded-xl">
                        {(user.username || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <BadgedName
                          badgeBalance={user.badgeBalance}
                          badgeLock={user.badgeLock}
                          username={user.username}
                          className="text-[17px] font-medium text-white truncate"
                        >
                          {user.displayName || user.username}
                        </BadgedName>
                        {user.isVerified && <VerifiedBadge className="w-3.5 h-3.5 flex-shrink-0" />}
                        {user.isAssistant && (
                          <span className="px-1.5 py-0.5 rounded-md bg-white/[0.12] border border-white/[0.12] text-[10px] font-semibold text-white/75 leading-none flex-shrink-0">
                            AI
                          </span>
                        )}
                        {user.followsYou && (
                          <span className="px-1.5 py-0.5 rounded-md bg-white/[0.08] border border-white/[0.08] text-[10px] font-medium text-white/60 leading-none flex-shrink-0">{_copy("copy.3457098e7042", { defaultValue: "Follows you" })}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[15px] text-white/35 truncate">
                        <span className="truncate">@{user.username}</span>
                        {typeof user.followerCount === 'number' && (
                          <>
                            <span className="text-white/20">·</span>
                            <span className="flex-shrink-0">
                              <span className="text-white/55 font-medium">{formatCount(user.followerCount)}</span>{_copy("copy.916a8b871759", { defaultValue: " followers" })}</span>
                          </>
                        )}
                        {user.isFollowing && (
                          <>
                            <span className="text-white/20">·</span>
                            <span className="flex-shrink-0 text-white/55">{_copy("copy.344b4271ca01", { defaultValue: "Following" })}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                ) : kind === 'community' ? (
                  <>
                    <Avatar className="w-10 h-10 flex-shrink-0 rounded-xl ring-1 ring-white/[0.06]">
                      <AvatarImage src={user.avatarUrl || undefined} className="object-cover" />
                      <AvatarFallback className="bg-white/[0.06] text-white/50 rounded-xl">
                        <CommunitiesIcon className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[17px] font-medium text-white truncate">{user.displayName || user.username}</span>
                      <div className="flex items-center gap-2 text-[15px] text-white/35 truncate">
                        <span className="truncate">/{user.username}</span>
                        {typeof user.memberCount === 'number' && (
                          <>
                            <span className="text-white/20">·</span>
                            <span className="flex-shrink-0">
                              <span className="text-white/55 font-medium">{formatCount(user.memberCount)}</span>
                              {_copy('mentionLinks.members', { defaultValue: ' members' })}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 flex-shrink-0 rounded-xl bg-white/[0.06] ring-1 ring-white/[0.06] flex items-center justify-center">
                      {PageIcon ? <PageIcon className="w-5 h-5 text-white/80" /> : <Link2 className="w-5 h-5 text-white/60" />}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[17px] font-medium text-white truncate">{user.displayName}</span>
                      <span className="text-[15px] text-white/35 truncate">riftn.com{user.username}</span>
                    </div>
                  </>
                )}
              </button>
              </div>
  );
}, (a, b) =>
  a.index === b.index && a.selected === b.selected && a.showHeading === b.showHeading &&
  a.onPick === b.onPick && a.onHover === b.onHover && a._copy === b._copy && sameRow(a.user, b.user));

export function UserMentionDropdown({
  query: initialQuery,
  isOpen,
  onSelect,
  onClose,
  selectedIndex,
  onSelectedIndexChange,
  includeLinks = true,
  armed = false,
}: UserMentionDropdownProps) {
  const { t: _copy } = _useCopy();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The server's word on the letters typed, kept with those letters so an
  // answer that lands late is never shown against newer ones.
  const [peopleAnswer, setPeopleAnswer] = useState<{ q: string; people: MentionUser[] } | null>(null);
  const [communityAnswer, setCommunityAnswer] = useState<{ q: string; rows: MentionUser[] } | null>(null);
  // Bumped when the viewer's own short list arrives, to redo the guess.
  const [known, setKnown] = useState(0);
  const firstAskRef = useRef(true);

  const q = normalizeMentionQuery(searchQuery);

  // Sync initial query when drawer opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(initialQuery);
      // Focus search input after drawer animates in
      const focus = setTimeout(() => searchInputRef.current?.focus(), 150);
      return () => clearTimeout(focus);
    }
    setSearchQuery('');
    setPeopleAnswer(null);
    setCommunityAnswer(null);
    firstAskRef.current = true;
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (!isOpen) return;
    warmMentionPeople();
    return onMentionPeopleChange(() => setKnown((n) => n + 1));
  }, [isOpen]);

  // People: the server's answer once it is in; until then whatever the device
  // already knows that matches, so the list is never left empty to wait.
  const settled = q && peopleAnswer?.q === q ? peopleAnswer.people : q ? settledPeople(q) : null;
  const people = useMemo(
    () => (!isOpen || !q ? [] : settled ?? guessPeople(q)),
    // `known`: the guess reads the short list, which can arrive while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, q, settled, known],
  );
  const settledCommunities = q && communityAnswer?.q === q ? communityAnswer.rows : q ? communityAnswers.fresh(q) : null;
  const communities = useMemo(
    () => (!isOpen || !q || !includeLinks ? [] : settledCommunities ?? guessCommunities(q)),
    [isOpen, q, includeLinks, settledCommunities],
  );
  const pages = useMemo(
    () => (isOpen && q && includeLinks ? searchPages(q, (k, d) => _copy(k, d) as string) : []),
    [isOpen, q, includeLinks, _copy],
  );
  // People, then communities, then pages: one flat list for the arrow keys.
  const users = useMemo(() => [...people, ...communities, ...pages], [people, communities, pages]);
  const loading = !!q && isOpen && !settled;

  // Ask the server. People and communities each show as they arrive: the
  // community lookup is the slower of the two and no longer holds people back.
  useEffect(() => {
    if (!isOpen || !q) return;
    let current = true;
    const needPeople = !settledPeople(q);
    const needCommunities = includeLinks && !communityAnswers.fresh(q);
    if (!needPeople && !needCommunities) return;
    const wait = firstAskRef.current ? 0 : ASK_AFTER_MS;
    firstAskRef.current = false;
    const timer = setTimeout(() => {
      if (needPeople) {
        fetchPeople(q)
          .then((found) => {
            if (current) setPeopleAnswer({ q, people: found });
          })
          .catch((err) => {
            console.error('[Mentions] search failed:', err);
            // Settle on what the device knows; communities and pages can still answer.
            if (current) setPeopleAnswer({ q, people: guessPeople(q) });
          });
      }
      if (needCommunities) {
        // A failed community lookup just leaves that group out.
        searchCommunities(q)
          .catch(() => [] as MentionUser[])
          .then((rows) => {
            if (current) setCommunityAnswer({ q, rows });
          });
      }
    }, wait);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [isOpen, q, includeLinks]);

  // A shorter list can leave the highlight past its end.
  useEffect(() => {
    if (users.length > 0 && selectedIndex >= users.length) onSelectedIndexChange(0);
  }, [users.length, selectedIndex, onSelectedIndexChange]);

  // Expose users for keyboard selection from parent. Before paint, so Enter
  // in the composer picks from the list that is on screen.
  useLayoutEffect(() => {
    if (users.length > 0) {
      (window as any).__mentionResults = users;
    } else {
      delete (window as any).__mentionResults;
    }
    return () => { delete (window as any).__mentionResults; };
  }, [users]);

  const handleSelect = useCallback((user: MentionUser) => {
    rememberMentionPick(user);
    onSelect(user);
  }, [onSelect]);

  const showEmpty = !loading && users.length === 0 && searchQuery.length >= 2;
  const mixedKinds = users.some((u) => (u.kind ?? 'user') !== (users[0]?.kind ?? 'user'));

  return (
    <Drawer
      open={isOpen}
      warm={armed}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent column
        className="bg-black/95 border-t border-white/[0.08] max-h-[70dvh] rounded-t-3xl"
        style={{
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header + Search */}
        <div className="px-4 pb-3 space-y-3">
          <div className="flex items-center gap-2">
            <AtSign className="w-4 h-4 text-white/40" />
            <span className="text-sm font-semibold text-white/70 tracking-wide">{includeLinks
              ? _copy('mentionLinks.title', { defaultValue: 'Mention or link' })
              : _copy("copy.bcbaa814d3ca", { defaultValue: "Mention a user" })}</span>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSelectedIndexChange(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const maxIdx = Math.max(0, users.length - 1);
                  onSelectedIndexChange(Math.min(selectedIndex + 1, maxIdx));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
                } else if (e.key === 'Enter' && users[selectedIndex]) {
                  e.preventDefault();
                  handleSelect(users[selectedIndex]);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
              placeholder={includeLinks
                ? _copy('mentionLinks.placeholder', { defaultValue: 'Search people, communities, pages...' })
                : _copy("copy.c45e9566dc3b", { defaultValue: "Search by username..." })}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {loading && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 animate-spin" />
            )}
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto px-2 pb-6" style={{ maxHeight: 'calc(70vh - 140px)' }}>
          {/* Empty state */}
          {showEmpty && (
            <AppState icon="search" title={includeLinks ? _copy('mentionLinks.empty', { defaultValue: 'Nothing found' }) : _copy("copy.bf1e104fb3c8", { defaultValue: "No users found" })} kind="search-empty" size="compact" className="py-10" />
          )}

          {/* Initial state */}
          {!loading && users.length === 0 && searchQuery.length < 2 && (
            <AppState icon="usernames" title={includeLinks ? _copy('mentionLinks.hint', { defaultValue: 'Type to find people, communities and pages' }) : _copy("copy.8f1aa08d3a21", { defaultValue: "Type to search users" })} size="compact" className="py-10" />
          )}

          {/* People, then communities, then pages. One flat list underneath,
              so the arrow keys and Enter walk straight through the groups. */}
            {users.map((user, index) => {
              const kind = user.kind ?? 'user';
              const groupStart = index === 0 || (users[index - 1].kind ?? 'user') !== kind;
              return (
                // Plain rows: a list that fades and slides each name in on
                // every letter reads as slow however fast the answer came.
                <MentionRow
                  key={user.id || user.username}
                  user={user}
                  index={index}
                  selected={index === selectedIndex}
                  showHeading={groupStart && mixedKinds}
                  onPick={handleSelect}
                  onHover={onSelectedIndexChange}
                  _copy={_copy}
                />
              );
            })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default UserMentionDropdown;
