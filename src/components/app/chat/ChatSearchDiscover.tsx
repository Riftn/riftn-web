import { useTranslation as _useCopy } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Community } from '@/hooks/use-communities';
import type { DeHubUser } from '@/lib/api/dehub';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { buildAvatarUrl, extractAvatarPath, storageImage, deviceWidth } from '@/lib/media-url';
import Search from '@/components/ui/cut-icons/search';
import MessageCircle from '@/components/ui/cut-icons/message-envelope';
import Users from '@/components/ui/cut-icons/communities';
import Share from '@/components/ui/cut-icons/share';

/*
 * What the chat list shows when a search matches none of your chats: the
 * people and communities that do match, a few ways to start something new,
 * and a hand-off to the full search. The list is never left blank.
 */

/** People whose DM settings refuse new chats. */
type LooseUser = DeHubUser & { dmSettings?: unknown; dmSetting?: unknown; display_name?: string };
type DmSettings = { disables?: string[] } | undefined;

function dmClosed(user: DeHubUser): boolean {
  const u = user as LooseUser;
  const raw = u.dmSettings || u.dmSetting;
  const s = (Array.isArray(raw) ? raw[0] : raw) as DmSettings;
  return !!(s?.disables?.includes('NEW_DM') || s?.disables?.includes('all'));
}

/** Communities, groups and channels whose name matches the search. */
function useCommunitySearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['communities', 'chat-search', q.toLowerCase()],
    queryFn: async () => {
      // Commas and brackets would break the filter; anything else is literal.
      const term = q.replace(/[%_,()]/g, ' ').trim();
      if (!term) return [] as Community[];
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .ilike('name', `%${term}%`)
        .order('member_count', { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data ?? []) as Community[];
    },
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
}

/** Same hand-off as the menu search's "search Riftn for …" row. */
const exploreSearchHref = (q: string) => `/app/explore?q=${encodeURIComponent(q.trim())}`;

const compact = (n: number) =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

const GLASS = 'rounded-2xl border border-white/[0.14] bg-white/[0.04] shadow-[inset_0_1px_1px_rgba(255,255,255,0.18)]';

export function ChatSearchDiscover({ query, users, usersLoading, onMessageUser, onNewChat, onNewGroup }: {
  query: string;
  users: DeHubUser[];
  usersLoading: boolean;
  onMessageUser: (user: DeHubUser) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
}) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const q = query.trim();
  const { data: communities = [], isLoading: communitiesLoading } = useCommunitySearch(q);
  const nothingAnywhere = !usersLoading && !communitiesLoading && !users.length && !communities.length;

  const section = (label: string) => (
    <p className="px-1 pb-2.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
  );

  return (
    <div data-chat-search-discover className="px-3 pb-6 pt-3 md:px-4">
      <p className="flex items-center gap-2 px-1 text-[13px] text-zinc-400">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
        <span className="min-w-0">
          {nothingAnywhere
            ? _copy('chatSearch.nothing', { defaultValue: 'Nothing matches "{{q}}" yet. Start something new.', q })
            : _copy('chatSearch.noChats', { defaultValue: 'No chats with "{{q}}" yet. Here\'s who and what matches.', q })}
        </span>
      </p>

      {/* People: round bubbles, one tap opens a chat */}
      {(usersLoading || users.length > 0) && (
        <>
          {section(_copy('chatSearch.people', { defaultValue: 'People' }))}
          <div data-chat-search-people className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 scrollbar-hide md:-mx-4 md:px-4">
            {usersLoading && !users.length
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                    <Skeleton className="h-14 w-14 rounded-full" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))
              : users.map((user) => {
                  const name = user.displayName || (user as LooseUser).display_name || user.username || _copy('copy.b512d97e7cbf', { defaultValue: 'User' });
                  const src = user.address ? buildAvatarUrl(user.address, extractAvatarPath(user)) : undefined;
                  const closed = dmClosed(user);
                  return (
                    <button
                      key={user._id || user.address}
                      type="button"
                      onClick={() => onMessageUser(user)}
                      disabled={closed}
                      title={closed ? _copy('copy.c20ed70dd868', { defaultValue: 'DMs disabled' }) : name}
                      className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-[12px] text-zinc-200 disabled:opacity-40"
                    >
                      <Avatar className="h-14 w-14 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2),0_0_0_3px_rgba(255,255,255,0.08)]">
                        {src && <AvatarImage src={src} alt="" className="rounded-full object-cover" />}
                        <AvatarFallback className="rounded-full bg-zinc-700 text-lg font-semibold text-white">
                          {name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="w-full truncate text-center">{name.split(/\s+/)[0]}</span>
                    </button>
                  );
                })}
          </div>
        </>
      )}

      {/* Communities: cards with their cover art */}
      {(communitiesLoading || communities.length > 0) && (
        <>
          {section(_copy('chatSearch.communities', { defaultValue: 'Communities' }))}
          <div data-chat-search-communities className="grid grid-cols-2 gap-2.5">
            {communitiesLoading
              ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
              : communities.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate(`/app/communities/${c.slug}?tab=chat`)}
                    className={`${GLASS} relative flex h-[104px] flex-col justify-between overflow-hidden p-3 text-left transition-colors hover:bg-white/[0.08]`}
                  >
                    {c.banner_url && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-35"
                        style={{ backgroundImage: `url(${storageImage(c.banner_url, deviceWidth(240))})` }}
                      />
                    )}
                    <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-black/80" />
                    <span className="relative h-7 w-7 overflow-hidden rounded-lg bg-zinc-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
                      {c.avatar_url
                        ? <img src={storageImage(c.avatar_url, deviceWidth(56))} alt="" className="h-full w-full object-cover" />
                        : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">{c.name.charAt(0).toUpperCase()}</span>}
                    </span>
                    <span className="relative min-w-0">
                      <span className="block truncate text-[14px] font-bold text-white">{c.name}</span>
                      <span className="block truncate text-[12px] text-zinc-400">
                        {_copy('chatSearch.members', { defaultValue: '{{n}} members', n: compact(c.member_count) })}
                      </span>
                    </span>
                  </button>
                ))}
          </div>
        </>
      )}

      {/* Ways to start something, so the screen is never a dead end */}
      {section(_copy('chatSearch.start', { defaultValue: 'Or start something' }))}
      <div data-chat-search-actions className="grid grid-cols-3 gap-2.5">
        {[
          { icon: MessageCircle, label: _copy('chatSearch.newChat', { defaultValue: 'New chat' }), sub: _copy('chatSearch.newChatSub', { defaultValue: 'Pick anyone' }), onClick: onNewChat },
          { icon: Users, label: _copy('chatSearch.newGroup', { defaultValue: 'New group' }), sub: _copy('chatSearch.newGroupSub', { defaultValue: 'Chat together' }), onClick: onNewGroup },
          { icon: Share, label: _copy('chatSearch.invite', { defaultValue: 'Invite' }), sub: _copy('chatSearch.inviteSub', { defaultValue: 'Share a link' }), onClick: () => navigate('/app/affiliate') },
        ].map(({ icon: Icon, label, sub, onClick }) => (
          <button key={label} type="button" onClick={onClick} className={`${GLASS} p-3 text-left transition-colors hover:bg-white/[0.08]`}>
            <span className="mb-2.5 flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.18] bg-white/[0.07]">
              <Icon className="h-4 w-4 text-white" />
            </span>
            <span className="block truncate text-[13px] font-bold text-white">{label}</span>
            <span className="block truncate text-[11.5px] text-zinc-500">{sub}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate(exploreSearchHref(q))}
        className={`${GLASS} mt-3 flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.08]`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.18] bg-white/[0.06]">
          <Search className="h-4 w-4 text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-white">
            {_copy('chatSearch.searchAll', { defaultValue: 'Search all of Riftn for "{{q}}"', q })}
          </span>
          <span className="block truncate text-[12px] text-zinc-500">
            {_copy('chatSearch.searchAllSub', { defaultValue: 'Posts, videos, live streams' })}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
      </button>
    </div>
  );
}
