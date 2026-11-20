/**
 * Who reacted to a chat line, with one row of reaction filters on top.
 *
 * Two sources, one list:
 * - live chat (`messageId` + remote): /api/livechat/reactors pages people in
 *   from the server, newest first, with their badges.
 * - DMs, groups and community rooms: the line already carries every address
 *   per emoji, so the names come from one batch account lookup.
 *
 * Used inside the right-click menu on a computer and inside the reactions
 * sheet on a phone.
 */

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getChatReactors, getAccountSummaries, type ChatReactor } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { BadgedName } from '@/components/app/BadgedName';
import { AppState } from '@/components/app/AppState';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';
import { cn } from '@/lib/utils';
import '@/styles/chat-hold.css';

import { formatCount } from '@/lib/format-count';
const PAGE_SIZE = 50;
/** A DM line can't realistically carry more, and the lookup is one request per hundred. */
const LOCAL_CAP = 300;

export interface ReactorsSource {
  /** The line's reactions as the chat holds them: emoji -> addresses. */
  reactions?: Record<string, string[]>;
  /** Live chat: page people in from the server by this message id. */
  remoteMessageId?: string | null;
}

/** Emoji with at least one person, biggest first. */
export function reactionEntries(reactions?: Record<string, string[]>) {
  return Object.entries(reactions ?? {})
    .filter(([, who]) => (who?.length ?? 0) > 0)
    .sort((a, b) => b[1].length - a[1].length);
}

/** People who reacted at all (one person with two emoji counts once). */
export function reactorCount(reactions?: Record<string, string[]>) {
  return new Set(Object.values(reactions ?? {}).flat().map((a) => a.toLowerCase())).size;
}

function localRows(reactions: Record<string, string[]> | undefined) {
  const byAddress = new Map<string, string[]>();
  // Newest reactors sit at the end of each list, so walk backwards.
  for (const [emoji, who] of reactionEntries(reactions)) {
    for (let i = who.length - 1; i >= 0; i--) {
      const key = who[i].toLowerCase();
      const list = byAddress.get(key) ?? [];
      if (!list.includes(emoji)) list.push(emoji);
      byAddress.set(key, list);
    }
  }
  return [...byAddress.entries()].slice(0, LOCAL_CAP).map(([address, emojis]) => ({ address, emojis }));
}

export function useChatReactors({ reactions, remoteMessageId }: ReactorsSource, emoji: string | null, enabled = true) {
  const remote = !!remoteMessageId;
  const remoteQuery = useInfiniteQuery({
    queryKey: ['chat-reactors', remoteMessageId, emoji],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getChatReactors(remoteMessageId!, { emoji: emoji ?? undefined, page: pageParam, limit: PAGE_SIZE });
      return { ...response, page: pageParam };
    },
    getNextPageParam: (lastPage) => (lastPage.pagination?.hasMore ? lastPage.page + 1 : undefined),
    initialPageParam: 0,
    enabled: enabled && remote,
    staleTime: 1000 * 15,
  });

  const local = useMemo(() => (remote ? [] : localRows(reactions)), [remote, reactions]);
  const addressKey = local.map((r) => r.address).sort().join(',');
  const localQuery = useQuery({
    queryKey: ['chat-reactor-names', addressKey],
    queryFn: () => getAccountSummaries(local.map((r) => r.address)),
    enabled: enabled && !remote && local.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const localCounts = useMemo(() => {
    const out: Record<string, number> = {};
    reactionEntries(reactions).forEach(([key, who]) => { out[key] = who.length; });
    return out;
  }, [reactions]);

  if (remote) {
    const first = remoteQuery.data?.pages?.[0];
    return {
      rows: remoteQuery.data?.pages.flatMap((page) => page.data ?? []) ?? [],
      counts: first?.reactionCounts ?? localCounts,
      peopleCount: first?.peopleCount ?? reactorCount(reactions),
      canView: first?.canViewLikers !== false,
      isLoading: remoteQuery.isLoading,
      hasNextPage: !!remoteQuery.hasNextPage,
      isFetchingNextPage: remoteQuery.isFetchingNextPage,
      fetchNextPage: () => { void remoteQuery.fetchNextPage(); },
    };
  }

  const names = new Map((localQuery.data ?? []).map((a) => [a.address.toLowerCase(), a]));
  const rows: ChatReactor[] = local
    .filter((r) => !emoji || r.emojis.includes(emoji))
    .map((r) => {
      const info = names.get(r.address);
      return {
        address: r.address,
        username: info?.username ?? null,
        displayName: info?.displayName ?? null,
        avatarImageUrl: info?.avatarImageUrl ?? null,
        badgeBalance: info?.badgeBalance ?? undefined,
        emojis: r.emojis,
      };
    });
  return {
    rows,
    counts: localCounts,
    peopleCount: local.length,
    canView: true,
    isLoading: local.length > 0 && localQuery.isLoading,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => undefined,
  };
}

interface ChatReactorsListProps extends ReactorsSource {
  /** Called before leaving for a profile, so the sheet or menu can close. */
  onNavigate?: () => void;
  /** Tighter rows for the right-click menu. */
  compact?: boolean;
  className?: string;
  /** Start on one reaction's people. */
  initialEmoji?: string | null;
}

export function ChatReactorsList({ reactions, remoteMessageId, onNavigate, compact = false, className, initialEmoji = null }: ChatReactorsListProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [emoji, setEmoji] = useState<string | null>(initialEmoji);
  useEffect(() => { setEmoji(initialEmoji); }, [remoteMessageId, initialEmoji]);

  const { rows, counts, peopleCount, canView, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useChatReactors({ reactions, remoteMessageId }, emoji);
  const filters = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

  const goToProfile = (person: ChatReactor) => {
    onNavigate?.();
    if (person.username) navigate(`/${person.username.replace('@', '')}`);
    else if (person.address) navigate(`/app/profile?id=${person.address}`);
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)} data-chat-reactors-list>
      {canView && filters.length > 1 && (
        <div data-chat-reactors-filters className={cn('shrink-0 flex gap-1.5 overflow-x-auto [scrollbar-width:none]', compact ? 'px-2 pb-2' : 'px-4 pb-3')}>
          <button type="button" onClick={() => setEmoji(null)} aria-pressed={emoji === null} data-chat-reactors-chip={emoji === null ? 'on' : ''}
            className={cn('shrink-0 inline-flex items-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors', compact ? 'h-7 px-2.5' : 'h-8 px-3')}>
            {t('filters.all')}
            <span className="tabular-nums opacity-60">{formatCount(peopleCount)}</span>
          </button>
          {filters.map(([key, n]) => (
            <button key={key} type="button" onClick={() => setEmoji(key)} aria-pressed={emoji === key} data-chat-reactors-chip={emoji === key ? 'on' : ''}
              className={cn('shrink-0 inline-flex items-center gap-1 rounded-full text-[13px] font-semibold transition-colors', compact ? 'h-7 px-2' : 'h-8 px-3')}>
              <span className="inline-flex items-center"><InlineEmoji value={key} className="h-4 m-0" /></span>
              <span className="tabular-nums opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}

      <div className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain', compact ? 'px-1 pb-1' : 'px-4 pb-6')}>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin opacity-50" />
          </div>
        ) : !canView ? (
          <AppState icon="lock" title={t('reactionInfo.privateTitle')} kind="restricted" size="drawer" />
        ) : rows.length === 0 ? (
          <AppState icon="pinned" title={t('reactionInfo.empty')} size="drawer" />
        ) : (
          <div className={compact ? 'space-y-0.5' : 'space-y-2'}>
            {rows.map((person) => {
              const displayName =
                person.displayName || person.username || person.address?.slice(0, 8) || t('comments.unknownUser');
              const avatarUrl = buildAvatarUrl(person.address, extractAvatarPath(person));
              return (
                <button
                  key={person.address}
                  type="button"
                  onClick={() => goToProfile(person)}
                  data-chat-reactor-row={compact ? 'compact' : ''}
                  className={cn(
                    'w-full flex items-center text-left transition-colors',
                    compact ? 'gap-2.5 rounded-xl px-2 py-1.5' : 'gap-3 rounded-xl p-3',
                  )}
                >
                  <Avatar className={cn('rounded-full', compact ? 'w-8 h-8' : 'w-10 h-10')}>
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                    <AvatarFallback className="bg-zinc-800 text-white text-sm">
                      {displayName[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <BadgedName
                      badgeBalance={person.badgeBalance}
                      username={person.username}
                      className="font-semibold text-sm"
                      wrapperClassName="flex w-full"
                    >
                      {displayName}
                    </BadgedName>
                    {person.username && !compact && (
                      <span className="text-xs truncate block opacity-55">
                        @{person.username.replace('@', '')}
                      </span>
                    )}
                  </div>
                  <span data-chat-reactor-emojis className="shrink-0 inline-flex items-center gap-1 text-lg leading-none">
                    {person.emojis.map((key) => (
                      <InlineEmoji key={key} value={key} className={compact ? 'h-4 m-0' : 'h-5 m-0'} />
                    ))}
                  </span>
                </button>
              );
            })}

            {hasNextPage && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                data-chat-reactors-chip
                className="w-full py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? t('common.loading') : t('common.loadMore')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
