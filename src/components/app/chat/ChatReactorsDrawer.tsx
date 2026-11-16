/**
 * Chat Reactors Drawer
 * ====================
 * Who reacted to a chat line, and with what. Opened by tapping a reaction on
 * your own line, the same door as the like button on your own comment.
 *
 * AUTHOR-ONLY, ON BOTH SIDES
 * Only your own lines route here, and the server holds the same line:
 * /api/livechat/reactors returns `canViewLikers: false` with an empty list to
 * anyone who didn't write the message.
 *
 * Same sheet as CommentLikersDrawer, pinned to the middle column on desktop,
 * with one row of reaction filters on top since a line can carry several.
 */

import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getChatReactors, type ChatReactor } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { BadgedName } from '@/components/app/BadgedName';
import { AppState } from '@/components/app/AppState';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';

const PAGE_SIZE = 50;

interface ChatReactorsDrawerProps {
  /** The line to list; null keeps the sheet closed. */
  messageId: string | null;
  onClose: () => void;
  /** The line's reactions as the chat already holds them, for the filters before the list lands. */
  reactions?: Record<string, string[]>;
}

export function ChatReactorsDrawer({ messageId, onClose, reactions }: ChatReactorsDrawerProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [emoji, setEmoji] = useState<string | null>(null);
  const open = !!messageId;

  useEffect(() => { setEmoji(null); }, [messageId]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['chat-reactors', messageId, emoji],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getChatReactors(messageId!, { emoji: emoji ?? undefined, page: pageParam, limit: PAGE_SIZE });
      return { ...response, page: pageParam };
    },
    getNextPageParam: (lastPage) => (lastPage.pagination?.hasMore ? lastPage.page + 1 : undefined),
    initialPageParam: 0,
    enabled: open,
    staleTime: 1000 * 15,
  });

  const firstPage = data?.pages?.[0];
  const canView = firstPage?.canViewLikers !== false;
  const rows = useMemo(() => data?.pages.flatMap((page) => page.data ?? []) ?? [], [data]);

  const counts = useMemo(() => {
    if (firstPage?.reactionCounts) return firstPage.reactionCounts;
    const local: Record<string, number> = {};
    Object.entries(reactions ?? {}).forEach(([key, who]) => { if (who?.length) local[key] = who.length; });
    return local;
  }, [firstPage, reactions]);
  const filters = Object.entries(counts).filter(([, n]) => n > 0);
  const peopleCount = firstPage?.peopleCount
    ?? new Set(Object.values(reactions ?? {}).flat().map((a) => a.toLowerCase())).size;

  const goToProfile = (person: ChatReactor) => {
    onClose();
    if (person.username) navigate(`/${person.username.replace('@', '')}`);
    else if (person.address) navigate(`/app/profile?id=${person.address}`);
  };

  const chip = (active: boolean) =>
    `shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm transition-colors ${
      active ? 'bg-white/15 border-white/30 text-white' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
    }`;

  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DrawerContent
        data-chat-reactors-drawer
        column
        className="bg-black/60 backdrop-blur-2xl backdrop-saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden z-[200] flex flex-col max-h-[80dvh]"
      >
        <DrawerHeader className="px-5 pt-4 pb-3 shrink-0">
          <DrawerTitle className="text-base font-medium text-white text-center">
            {t('reactionInfo.title')}
            {peopleCount > 0 && <span className="text-white/40 font-normal"> · {peopleCount}</span>}
          </DrawerTitle>
        </DrawerHeader>

        {canView && filters.length > 1 && (
          <div data-chat-reactors-filters className="shrink-0 flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
            <button type="button" onClick={() => setEmoji(null)} aria-pressed={emoji === null} className={chip(emoji === null)}>
              {t('filters.all')}
              <span className="text-white/50 tabular-nums">{peopleCount}</span>
            </button>
            {filters.map(([key, n]) => (
              <button key={key} type="button" onClick={() => setEmoji(key)} aria-pressed={emoji === key} className={chip(emoji === key)}>
                <span className="inline-flex items-center"><InlineEmoji value={key} className="h-4 m-0" /></span>
                <span className="text-white/50 tabular-nums">{n}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            </div>
          ) : !canView ? (
            <AppState icon="lock" title={t('reactionInfo.privateTitle')} kind="restricted" size="drawer" />
          ) : rows.length === 0 ? (
            <AppState icon="pinned" title={t('reactionInfo.empty')} size="drawer" />
          ) : (
            <div className="space-y-2">
              {rows.map((person) => {
                const displayName =
                  person.displayName || person.username || person.address?.slice(0, 8) || t('comments.unknownUser');
                const avatarUrl = buildAvatarUrl(person.address, extractAvatarPath(person));
                return (
                  <button
                    key={person.address}
                    onClick={() => goToProfile(person)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
                  >
                    <Avatar className="w-10 h-10 rounded-lg">
                      {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                      <AvatarFallback className="bg-zinc-800 text-white rounded-lg text-sm">
                        {displayName[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <BadgedName
                        badgeBalance={person.badgeBalance}
                        username={person.username}
                        className="font-semibold text-white text-sm"
                        wrapperClassName="flex w-full"
                      >
                        {displayName}
                      </BadgedName>
                      {person.username && (
                        <span className="text-zinc-500 text-xs truncate block">
                          @{person.username.replace('@', '')}
                        </span>
                      )}
                    </div>
                    <span data-chat-reactor-emojis className="shrink-0 inline-flex items-center gap-1 text-lg leading-none">
                      {person.emojis.map((key) => (
                        <InlineEmoji key={key} value={key} className="h-5 m-0" />
                      ))}
                    </span>
                  </button>
                );
              })}

              {hasNextPage && (
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isFetchingNextPage ? t('common.loading') : t('common.loadMore')}
                </button>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default ChatReactorsDrawer;
