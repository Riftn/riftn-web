import { useTranslation } from 'react-i18next';
import { ArrowDown } from 'lucide-react';
import { formatUnreadCount } from '@/lib/unread-count';

/**
 * The line a chat opens on when you missed messages: a hairline that brightens
 * toward the middle, with a frosted tag saying how many came in. Same frost as
 * the day pill so it sits in every theme without its own palette.
 */
export function UnreadMarker({ count }: { count: number }) {
  const { t } = useTranslation();
  const label = count === 1
    ? t('messages.unreadMarkerOne', { defaultValue: '1 unread message' })
    : t('messages.unreadMarkerMany', { defaultValue: '{{value}} unread messages', value: formatUnreadCount(count) });
  return (
    <div
      data-chat-unread-marker
      role="separator"
      aria-label={label}
      className="flex items-center gap-3 py-3 select-none pointer-events-none"
    >
      <span aria-hidden data-unread-hairline className="h-px flex-1 bg-gradient-to-r from-transparent to-white/30" />
      <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur-md">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
        {label}
      </span>
      <span aria-hidden data-unread-hairline className="h-px flex-1 bg-gradient-to-l from-transparent to-white/30" />
    </div>
  );
}

/**
 * Floating jump control. A frosted capsule: the count of unread lines still
 * below you on the left, a round arrow on the right. The arrow turns to point
 * at where a tap goes — up to the unread marker while you haven't reached it,
 * down to the newest line after. With nothing unread it shrinks to the circle.
 */
export function UnreadJumpButton({
  count,
  up,
  onClick,
  className = '',
}: {
  count: number;
  up: boolean;
  onClick: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = up
    ? t('messages.jumpToUnread', { defaultValue: 'Jump to first unread message' })
    : t('messages.jumpToLatest', { defaultValue: 'Jump to latest message' });
  return (
    <button
      type="button"
      data-chat-jump
      onClick={onClick}
      aria-label={count > 0 ? `${label} (${formatUnreadCount(count)})` : label}
      className={`flex h-11 items-center rounded-full bg-zinc-900/70 text-white shadow-lg shadow-black/30 ring-1 ring-white/10 backdrop-blur-md transition-transform duration-150 hover:scale-[1.04] active:scale-95 animate-in fade-in zoom-in-90 ${className}`}
    >
      {count > 0 && (
        <span key={count} className="pl-3.5 pr-1 text-sm font-semibold tabular-nums animate-in fade-in slide-in-from-bottom-1 duration-200">
          {formatUnreadCount(count)}
        </span>
      )}
      <span data-jump-orb className="m-1 grid h-9 w-9 place-items-center rounded-full bg-white/15">
        <ArrowDown
          aria-hidden
          className={`h-4 w-4 transition-transform duration-300 ease-out ${up ? 'rotate-180' : ''}`}
        />
      </span>
    </button>
  );
}
