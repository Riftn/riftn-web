import { useTranslation } from 'react-i18next';
import { useBadgeVisual } from '@/hooks/use-badge-balance';
import type { StoredProfile } from '@/lib/profiles';

export function SavedProfileName({ profile, className }: { profile: StoredProfile; className?: string }) {
  const { t } = useTranslation();
  const { url, name } = useBadgeVisual({
    badgeBalance: profile.badgeBalance,
    badgeLock: profile.badgeLock,
    username: profile.username,
  });
  return (
    <span className={`flex min-w-0 items-center gap-1 ${className ?? ''}`}>
      <span className="truncate">{profile.name || profile.username || t('nav.profile')}</span>
      {profile.hideBadgeAndBalance === false && url && (
        <img src={url} alt={name ?? ''} className="size-[1em] shrink-0 object-contain" />
      )}
    </span>
  );
}
