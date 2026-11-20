/**
 * Quick account switcher in the phone menu header.
 * ===============================================
 * A small pill beside your name: the faces of the other accounts saved on this
 * browser, your own last, and a chevron. Tapping it lists every saved account
 * so you can jump between them without leaving the menu.
 *
 * Lazily imported by AppSidebar on purpose: @/lib/profiles reaches the wallet
 * vault, and AppSidebar is in the eager graph. A static import would drag the
 * wallet stack into the entry bundle and fail scripts/check-entry-bundle.mjs.
 */
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import Check from '@/components/ui/cut-icons/check';
import Plus from '@/components/ui/cut-icons/add';
import SwitchAccounts from '@/components/ui/cut-icons/switch-accounts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AuthContext } from '@/contexts/AuthContext';
import { buildAvatarUrl, deviceWidth } from '@/lib/media-url';
import {
  listProfiles,
  currentProfileId,
  canAddProfile,
  PROFILES_CHANGED_EVENT,
  type StoredProfile,
} from '@/lib/profiles';

/** Faces shown in the pill besides your own. */
const MAX_OTHERS = 2;

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function label(profile: StoredProfile): string {
  return profile.name || profile.username || shortAddress(profile.address);
}

function Face({ address, path, name, className }: { address?: string | null; path?: string | null; name: string; className: string }) {
  return (
    <Avatar className={className}>
      {address && path && <AvatarImage src={buildAvatarUrl(address, path, deviceWidth(28))} alt="" className="object-cover" />}
      <AvatarFallback className="bg-zinc-700 text-white text-[10px] font-medium">
        {name.charAt(0).toUpperCase() || 'U'}
      </AvatarFallback>
    </Avatar>
  );
}

export function MenuAccountSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  // Read softly so the state gallery (no AuthProvider) can draw it too.
  const auth = useContext(AuthContext);
  const user = auth?.user;
  const [profiles, setProfiles] = useState<StoredProfile[]>(() => listProfiles());
  const [activeId, setActiveId] = useState<string | null>(() => currentProfileId());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => {
      setProfiles(listProfiles());
      setActiveId(currentProfileId());
    };
    window.addEventListener(PROFILES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PROFILES_CHANGED_EVENT, sync);
  }, []);

  const others = profiles.filter((p) => p.id !== activeId);
  const me = profiles.find((p) => p.id === activeId);
  const myName = (me && label(me)) || user?.displayName || user?.username || '';

  const handleSwitch = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      setOpen(false);
      onNavigate?.();
      // Resolves only when no stored session could be restored (the sign-in
      // sheet opened instead); a successful switch reloads mid-await.
      await auth?.switchToProfile(id);
    } finally {
      setBusy(false);
    }
  };

  const addProfile = () => {
    setOpen(false);
    onNavigate?.();
    auth?.openLoginModal({ intent: 'add-profile' });
  };

  const rows = me ? [me, ...others] : others;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('sidebar.switchAccount', 'Switch account')}
          data-menu-chip
          data-menu-account-switcher
          className="flex h-9 flex-shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] pl-1.5 pr-2 text-zinc-300"
        >
          {others.length === 0 ? (
            <SwitchAccounts className="mx-0.5 h-[18px] w-[18px] text-zinc-200" />
          ) : (
            <span className="flex items-center">
              {[...others.slice(0, MAX_OTHERS)].map((p, i) => (
                <Face
                  key={p.id}
                  address={p.address}
                  path={p.avatarPath}
                  name={label(p)}
                  className={`h-[22px] w-[22px] rounded-full ring-[1.5px] ring-black/40 ${i > 0 ? '-ml-[7px]' : ''}`}
                />
              ))}
              <Face
                address={user?.address ?? me?.address}
                path={user?.avatarImageUrl ?? me?.avatarPath}
                name={myName}
                className="-ml-[7px] h-[22px] w-[22px] rounded-full ring-[1.5px] ring-black/40"
              />
            </span>
          )}
          <ChevronDown className={`h-[15px] w-[15px] text-zinc-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-glass-menu
        data-menu-account-list
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(288px,calc(100vw-32px))] rounded-2xl p-1.5"
      >
        <p className="px-2.5 pb-1 pt-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
          {t('sidebar.switchAccount', 'Switch account')}
        </p>
        {rows.map((profile) => {
          const isActive = profile.id === activeId;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => { if (!isActive) void handleSwitch(profile.id); }}
              disabled={busy}
              aria-current={isActive ? 'true' : undefined}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              <Face address={profile.address} path={profile.avatarPath} name={label(profile)} className="h-8 w-8 flex-shrink-0 rounded-full" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-white">{label(profile)}</span>
                <span className="block truncate text-[12px] text-zinc-500">
                  {profile.username ? `@${profile.username}` : shortAddress(profile.address)}
                  {!profile.session && !isActive ? ` · ${t('settings.profileSignedOut', 'sign in to switch')}` : ''}
                </span>
              </span>
              {isActive && <Check className="h-4 w-4 flex-shrink-0 text-white" />}
            </button>
          );
        })}
        {canAddProfile(profiles) && (
          <button
            type="button"
            onClick={addProfile}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-white/25">
              <Plus className="h-3.5 w-3.5" />
            </span>
            <span className="truncate">{t('settings.addProfile', 'Add profile')}</span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
