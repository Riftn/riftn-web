import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { useIsOnline } from '@/lib/online-presence';
import { getShowLastSeen, lastSeenWhen, useLastSeen } from '@/lib/last-seen';

/**
 * "Last seen 5 min ago" under a name in a one-to-one chat. Renders nothing
 * unless that person turned on "Show when I was last seen" (lib/last-seen),
 * and nothing while the green online dot is already showing.
 */
export function LastSeenLine({ address, customs, className = 'truncate text-xs text-zinc-400' }: {
  address?: string | null;
  customs?: Record<string, unknown> | null;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const active = useContext(CachedPageActiveContext);
  const optedIn = getShowLastSeen(customs);
  const isOnline = useIsOnline(address, active);
  const seenAt = useLastSeen(address, optedIn && active !== false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!seenAt) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [seenAt]);
  if (!optedIn || !seenAt || isOnline) return null;
  const when = lastSeenWhen(seenAt, i18n.language, now);
  const text = when
    ? t('profile.lastSeen', { defaultValue: 'Last seen {{when}}', when })
    : t('profile.lastSeenJustNow', { defaultValue: 'Last seen just now' });
  return <p data-last-seen className={className} title={new Date(seenAt).toLocaleString()}>{text}</p>;
}
