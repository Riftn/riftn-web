import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/contexts/AuthContext';
import { BadgedName } from '@/components/app/BadgedName';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buildAvatarUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import Search from '@/components/ui/cut-icons/search';
import ExitFullscreen from '@/components/ui/cut-icons/exit-fullscreen';
import Close from '@/components/ui/cut-icons/close';
import HomeIcon from '@/components/ui/cut-icons/home';
import ProfileIcon from '@/components/ui/cut-icons/profile';
import SettingsIcon from '@/components/ui/cut-icons/settings-cog';

/*
 * The top of the chat list on riftn.com/chat on computers. Phones keep the
 * page pill.
 *
 * One glass pill: home, search, refresh, new chat, text size and who is
 * signed in (their menu has Profile, Settings and Leave full screen). Nothing
 * floats over the list. Pressing search turns the whole pill into the search
 * field; Escape or the cross puts the buttons back.
 */

/** A quiet round icon button for the chat pill. */
export function ChatIconButton({ label, onClick, children, className, ...rest }: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <button
      type="button"
      data-fsc-icon-button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white [&>svg]:h-[17px] [&>svg]:w-[17px]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ChatListTop({
  title,
  search,
  searchLabel,
  searchValue,
  onClearSearch,
  searchActions,
  actions,
  onOpenSettings,
}: {
  title: string;
  /** The search <input>. Only mounted while searching. */
  search: ReactNode;
  searchLabel: string;
  searchValue: string;
  onClearSearch: () => void;
  /** Refresh and new chat. */
  searchActions: ReactNode;
  /** Text size, after a divider. */
  actions: ReactNode;
  /** Shows settings inside the chat page instead of leaving it. */
  onOpenSettings?: () => void;
}) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  // A query that is already there (a restored draft) keeps the field showing.
  const searching = searchOpen || searchValue.trim().length > 0;
  const homeLabel = _copy('fullscreenChat.home', { defaultValue: 'Riftn home' });
  const closeLabel = _copy('fullscreenChat.closeSearch', { defaultValue: 'Close search' });

  useEffect(() => {
    if (searchOpen) fieldRef.current?.querySelector('input')?.focus();
  }, [searchOpen]);

  const closeSearch = () => {
    onClearSearch();
    setSearchOpen(false);
  };

  return (
    <div data-fsc-top className="shrink-0 px-3 pb-2 pt-3">
      <h1 className="sr-only">{title}</h1>
      <div
        data-page-bento
        data-fsc-search-pill
        data-fsc-searching={searching ? '' : undefined}
        className="relative flex h-12 items-center gap-1 rounded-2xl bg-zinc-900 px-1.5"
      >
        <span data-nav-glass-backdrop aria-hidden="true" />
        {searching ? (
          <>
            <Search className="relative z-10 ml-2.5 h-[17px] w-[17px] shrink-0 text-zinc-400" />
            <div
              ref={fieldRef}
              className="relative z-10 min-w-0 flex-1"
              onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => { if (!searchValue.trim()) setSearchOpen(false); }}
            >
              {search}
            </div>
            {/* onMouseDown keeps the field from blurring (and unmounting this
                button) before the click lands. */}
            <ChatIconButton
              label={closeLabel}
              onClick={closeSearch}
              className="relative z-10"
              data-fsc-search-close=""
            >
              <span onMouseDown={(e) => e.preventDefault()} className="flex h-full w-full items-center justify-center">
                <Close className="h-[15px] w-[15px]" />
              </span>
            </ChatIconButton>
          </>
        ) : (
          <>
            <ChatIconButton label={homeLabel} onClick={() => navigate('/app')} className="relative z-10 text-zinc-200" data-fsc-home="">
              <HomeIcon />
            </ChatIconButton>
            <button
              type="button"
              data-fsc-search-open
              onClick={() => setSearchOpen(true)}
              aria-label={searchLabel}
              className="relative z-10 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full px-2 text-left text-zinc-400 transition-colors hover:text-white"
            >
              <Search className="h-[17px] w-[17px] shrink-0" />
              <span className="min-w-0 truncate text-[15px] text-zinc-500">{_copy('fullscreenChat.searchShort', { defaultValue: 'Search' })}</span>
            </button>
            <div className="relative z-10 flex shrink-0 items-center">
              {searchActions}
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/10" />
              {actions}
              <ChatMeMenu onOpenSettings={onOpenSettings} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Your picture at the end of the pill: opens Profile, Settings and Leave full screen. */
function ChatMeMenu({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  // useContext, not useAuth: the state gallery renders this without a provider.
  const user = useContext(AuthContext)?.user;
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return null;
  const name = user.displayName || user.username || '';
  const avatarSrc = user.address && user.avatarImageUrl ? buildAvatarUrl(user.address, user.avatarImageUrl) : undefined;
  const profileLabel = _copy('fullscreenChat.profile', { defaultValue: 'Your profile' });
  const settingsLabel = _copy('fullscreenChat.settings', { defaultValue: 'Settings' });
  const exitLabel = _copy('fullscreenChat.exit', { defaultValue: 'Leave full screen' });
  const menu = [
    { key: 'profile', label: profileLabel, icon: <ProfileIcon className="h-[18px] w-[18px] text-zinc-300" />, onSelect: () => navigate('/app/profile') },
    { key: 'settings', label: settingsLabel, icon: <SettingsIcon className="h-[18px] w-[18px] text-zinc-300" />, onSelect: () => (onOpenSettings ? onOpenSettings() : navigate('/app/settings?tab=messages')) },
    { key: 'exit', label: exitLabel, icon: <ExitFullscreen className="h-[18px] w-[18px] text-zinc-300" />, onSelect: () => navigate('/app/messages') },
  ];

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-fsc-me
          aria-label={profileLabel}
          title={profileLabel}
          className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
        >
          <Avatar className="h-8 w-8 rounded-full">
            {avatarSrc && <AvatarImage src={avatarSrc} alt="" className="rounded-full object-cover" />}
            <AvatarFallback className="rounded-full bg-zinc-700 text-sm font-medium text-white">
              {name.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>
      <PopoverContent data-fsc-me-menu side="bottom" align="end" sideOffset={10} className="w-60 rounded-2xl border-zinc-700 bg-zinc-900 p-1.5">
        <div className="flex min-w-0 flex-col px-2.5 pb-2 pt-1.5">
          <span className="flex min-w-0 text-[14px] font-semibold leading-tight text-white">
            <BadgedName badgeBalance={user.badgeBalance} username={user.username} lookupId={user.username || user.address}>
              {name}
            </BadgedName>
          </span>
          {user.username && <span className="truncate text-[12px] leading-tight text-zinc-400">@{user.username}</span>}
        </div>
        <div aria-hidden="true" className="mx-1 mb-1 h-px bg-white/10" />
        {menu.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => { setMenuOpen(false); row.onSelect(); }}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] text-white transition-colors hover:bg-white/10"
          >
            <span className="flex h-5 w-5 items-center justify-center">{row.icon}</span>
            {row.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
