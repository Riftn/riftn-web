/**
 * Co-authors on a post's header: the second face tucked on the creator's
 * avatar, and "& name" beside the creator's name. Reads the shared store the
 * API fills (lib/co-author-store), so any card with a tokenId gets it.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl } from '@/lib/media-url';
import { coAuthorName, type CoAuthorUser } from '@/lib/co-author-store';
import { cn } from '@/lib/utils';
import { profilePath } from '@/lib/profile-path';

export function coAuthorAvatarUrl(user: CoAuthorUser): string | undefined {
  if (!user.avatarImageUrl) return undefined;
  return user.avatarImageUrl.startsWith('http') ? user.avatarImageUrl : buildAvatarUrl(user.address, user.avatarImageUrl);
}

export function CoAuthorFace({ user, className }: { user: CoAuthorUser; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : coAuthorAvatarUrl(user);
  const name = coAuthorName(user);
  return (
    <Avatar className={cn('rounded-[5px]', className)}>
      {src && <AvatarImage src={src} onError={() => setFailed(true)} className="rounded-[5px] object-cover" />}
      <AvatarFallback className="bg-zinc-700 text-white text-[9px] font-semibold rounded-[5px]">{name[0]?.toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

/** The first co-author's face on the corner of the creator's 36px avatar. */
export function CoAuthorAvatarBadge({ users }: { users: CoAuthorUser[] }) {
  if (!users.length) return null;
  return (
    <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-[6px] ring-2 ring-background" aria-hidden>
      <CoAuthorFace user={users[0]} className="w-[18px] h-[18px]" />
    </span>
  );
}

/** "& Bob" (and "+1" for a third or fourth person) after the creator's name. */
export function CoAuthorNames({ users, nameClassName }: { users: CoAuthorUser[]; nameClassName?: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  if (!users.length) return null;
  const [first, ...rest] = users;
  const open = (event: React.MouseEvent, user: CoAuthorUser) => {
    event.stopPropagation();
    event.preventDefault();
    navigate(profilePath(user.username || user.address));
  };
  return (
    <span className="inline-flex items-baseline gap-1 min-w-0 shrink" data-co-authors>
      <span className="text-zinc-500 text-sm leading-5 shrink-0">&amp;</span>
      {/* A link-role span, not a button: the phone post page draws this
          inside the creator row's own button. */}
      <span
        role="link"
        tabIndex={0}
        data-opens-page
        onMouseDown={e => e.preventDefault()}
        onClick={e => open(e, first)}
        onKeyDown={e => { if (e.key === 'Enter') open(e as unknown as React.MouseEvent, first); }}
        aria-label={t('feed.viewProfile', { name: coAuthorName(first) })}
        className={cn('font-semibold text-white truncate min-w-0 cursor-pointer', nameClassName ?? 'text-base leading-5')}
      >
        {coAuthorName(first)}
      </span>
      {rest.length > 0 && (
        <span
          className="text-zinc-500 text-sm leading-5 shrink-0"
          title={rest.map(coAuthorName).join(', ')}
        >
          {t('coAuthors.andMore', { count: rest.length, defaultValue: '+{{count}}' })}
        </span>
      )}
    </span>
  );
}
