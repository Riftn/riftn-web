import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, Plus as PlusLine, SlidersHorizontal } from 'lucide-react';
import { Check } from 'lucide-react';
import Search from '@/components/ui/cut-icons/search';
import Plus from '@/components/ui/cut-icons/add';
import CloseIcon from '@/components/ui/cut-icons/close';
import RefreshCw from '@/components/ui/cut-icons/refresh';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CHAT_MENU_CONTENT } from '@/components/app/chat/ChatOptionsMenu';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { CHAT_TEXT_SCALE, setChatTextSize, useChatTextSize } from '@/lib/chat-text-size';
import { useChatTextSizeOptions } from '@/hooks/use-chat-text-size-options';
import { cn } from '@/lib/utils';

/*
 * Phones only (riftn.com/chat and /app/messages under 1024px): no pill. One
 * row holds the filter chips (All, Unread, Direct, Groups...) that scroll
 * sideways, and three buttons pinned at its right end: the one menu (tabs,
 * select, refresh, text size), new chat, and search. Search swaps the row for
 * a field. Computers keep their own header.
 */

const ROW = 'flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-[14px] text-zinc-100 outline-none focus:bg-white/10 data-[highlighted]:bg-white/10 data-[disabled]:opacity-40 [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:text-zinc-400';
const TOOL_ROUND = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white transition-colors active:bg-white/15 [&>svg]:h-[18px] [&>svg]:w-[18px]';
const TOOL = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors active:bg-white/10 [@media(hover:hover)]:hover:bg-white/10 [@media(hover:hover)]:hover:text-white [&>svg]:h-5 [&>svg]:w-5';

export function PhoneChatListTop({
  title,
  chips,
  searchValue,
  onSearch,
  searchPlaceholder,
  onNewChat,
  onRefresh,
  refreshing,
  picking,
  onTogglePicking,
  onNewTab,
  onEditTabs,
  big,
  className,
}: {
  title: string;
  /**
   * /app/messages on phones: a big title with the menu and new chat next to
   * it, the search field always showing under it, then the tabs on their own
   * row (underlined, as everywhere). riftn.com/chat keeps the single row.
   */
  big?: boolean;
  /** The filter chips (ChatTabBar bare). Null when signed out or searching. */
  chips: ReactNode;
  searchValue: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  onNewChat: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  picking?: boolean;
  /** Signed-in only. */
  onTogglePicking?: () => void;
  onNewTab?: () => void;
  onEditTabs?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(() => !!searchValue.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  const size = useChatTextSize();
  const sizes = useChatTextSizeOptions();
  useEffect(() => {
    if (!searchOpen) return;
    const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(id);
  }, [searchOpen]);

  const closeSearch = () => { onSearch(''); setSearchOpen(false); };
  const newChatLabel = t('copy.4787aa7e2d5c', 'Start new conversation');
  const searchLabel = t('fullscreenChat.search', 'Search chats');
  const menuLabel = t('chatTabs.menu', 'Chat options');

  const menu = (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" data-phone-chat-tool="menu" aria-label={menuLabel}
          className={cn(big ? TOOL_ROUND : TOOL, picking && 'bg-white/15 text-white')}>
          <SlidersHorizontal strokeWidth={1.9} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} data-phone-chat-menu className={cn(CHAT_MENU_CONTENT, 'text-white')}>
        {onNewTab && (
          <DropdownMenuItem className={ROW} onSelect={onNewTab}>
            <PlusLine />{t('chatTabs.new', 'New tab')}
          </DropdownMenuItem>
        )}
        {onEditTabs && (
          <DropdownMenuItem className={ROW} onSelect={onEditTabs}>
            <SlidersHorizontal />{t('chatTabs.edit', 'Edit tabs')}
          </DropdownMenuItem>
        )}
        {onTogglePicking && (
          <DropdownMenuItem className={ROW} onSelect={onTogglePicking}>
            <ListChecks />{picking ? t('chatBulk.cancel', 'Cancel') : t('chatBulk.select', 'Select chats')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className={ROW} disabled={refreshing} onSelect={onRefresh}>
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />{t('copy.0e9161011702', 'Refresh')}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 h-px bg-white/10" />
        <DropdownMenuLabel className="px-2.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
          {t('chatTextSize.title', 'Text size')}
        </DropdownMenuLabel>
        {sizes.map((o) => (
          <DropdownMenuItem key={o.value} className={cn(ROW, 'justify-between')} onSelect={(e) => { e.preventDefault(); setChatTextSize(o.value); }}
            role="menuitemradio" aria-checked={o.value === size}>
            <span style={{ fontSize: `calc(0.875rem * ${CHAT_TEXT_SCALE[o.value]})` }}>{o.label}</span>
            {o.value === size && <Check className="!text-white" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (big) {
    return (
      <div data-phone-chat-top data-phone-chat-big className={cn('shrink-0 pt-1', className)}>
        <div className="flex h-12 items-center gap-1.5 pl-4 pr-3">
          <ThemedIcon icon="messages" alt="" className="mr-1 h-8 w-8 shrink-0 object-contain" />
          <h1 data-phone-chat-title className="min-w-0 flex-1 truncate text-[30px] font-extrabold leading-none tracking-[-0.02em] text-white">{title}</h1>
          <div data-phone-chat-tools className="flex shrink-0 items-center gap-1.5">
            {menu}
            <button type="button" data-phone-chat-tool="new" onClick={onNewChat} aria-label={newChatLabel} className={TOOL_ROUND}>
              <Plus />
            </button>
          </div>
        </div>
        <div className="relative mx-4 mt-1.5 flex items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            data-search-surface
            data-phone-chat-search
            enterKeyHint="search"
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { onSearch(''); e.currentTarget.blur(); } }}
            className="h-10 w-full rounded-xl border-0 bg-white/[0.06] pl-10 pr-10 text-[15px] text-white outline-none placeholder:text-zinc-500"
          />
          {searchValue && (
            <button type="button" data-phone-chat-tool="close-search" onClick={() => onSearch('')}
              aria-label={t('common.close', 'Close')} className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 [&>svg]:h-4 [&>svg]:w-4">
              <CloseIcon />
            </button>
          )}
        </div>
        {chips && (
          <div data-phone-chat-tabs className="mt-2 [mask-image:linear-gradient(to_right,#000_calc(100%-18px),transparent)]">
            {chips}
          </div>
        )}
      </div>
    );
  }

  if (searchOpen) {
    return (
      <div data-phone-chat-top data-searching="" className={cn('flex shrink-0 items-center gap-1.5 px-3 pb-1.5 pt-2', className)}>
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            data-search-surface
            data-phone-chat-search
            enterKeyHint="search"
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
            className="h-10 w-full rounded-xl border-0 bg-white/[0.06] pl-10 pr-3 text-[15px] text-white outline-none placeholder:text-zinc-500"
          />
        </div>
        <button type="button" data-phone-chat-tool="close-search" onClick={closeSearch}
          aria-label={t('common.close', 'Close')} className={TOOL}>
          <CloseIcon />
        </button>
      </div>
    );
  }

  return (
    <div data-phone-chat-top className={cn('flex shrink-0 items-center pt-2 pb-1', className)}>
      {/* Fades out at the right so a cut-off chip reads as "scroll for more". */}
      <div className="min-w-0 flex-1 [mask-image:linear-gradient(to_right,#000_calc(100%-18px),transparent)]">
        {chips ?? <h1 className="truncate px-4 text-[17px] font-semibold text-white">{title}</h1>}
      </div>
      {/* Pinned: the chips scroll under nothing, these never move. */}
      <div data-phone-chat-tools className="flex shrink-0 items-center gap-0.5 pl-1 pr-2">
        {menu}
        <button type="button" data-phone-chat-tool="new" onClick={onNewChat} aria-label={newChatLabel} className={TOOL}>
          <Plus />
        </button>
        <button type="button" data-phone-chat-tool="search" onClick={() => setSearchOpen(true)} aria-label={searchLabel} className={TOOL}>
          <Search />
        </button>
      </div>
    </div>
  );
}
