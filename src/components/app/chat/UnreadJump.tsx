import { useRef } from 'react';
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
 * Floating jump control. A frosted capsule: how many lines sit below you on
 * the left, a round arrow on the right. The arrow turns to point at where a
 * tap goes — up to the unread marker while you haven't reached it, down to the
 * newest line after. With nothing below it shrinks to the circle.
 *
 * It stays mounted and glides in and out (fade, lift, slight blur) instead of
 * popping, and the number changes in place without re-animating, so scrolling
 * and tapping it feel smooth. Pass `show={false}` to hide it.
 */
export function UnreadJumpButton({
  count,
  up,
  onClick,
  show = true,
  className = '',
}: {
  count: number;
  up: boolean;
  onClick: () => void;
  show?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  // Keep the last figure while fading out so the capsule doesn't snap shut mid-fade.
  const lastCount = useRef(count);
  if (show) lastCount.current = count;
  const shown = show ? count : lastCount.current;
  const label = up
    ? t('messages.jumpToUnread', { defaultValue: 'Jump to first unread message' })
    : t('messages.jumpToLatest', { defaultValue: 'Jump to latest message' });
  return (
    <div
      data-chat-jump-wrap
      aria-hidden={!show}
      className={`chat-jump-glide ${show ? 'is-shown' : 'pointer-events-none'} ${className}`}
    >
      <button
        type="button"
        data-chat-jump
        onClick={onClick}
        tabIndex={show ? 0 : -1}
        aria-label={shown > 0 ? `${label} (${formatUnreadCount(shown)})` : label}
        className="chat-jump-press flex h-11 items-center rounded-full bg-zinc-900/70 text-white shadow-lg shadow-black/30 ring-1 ring-white/10 backdrop-blur-md backdrop-saturate-150"
      >
        <span
          data-jump-count
          className={`chat-jump-count overflow-hidden whitespace-nowrap text-sm font-semibold tabular-nums ${shown > 0 ? 'is-on' : ''}`}
        >
          <span className="inline-block pl-3.5 pr-1">{shown > 0 ? formatUnreadCount(shown) : ''}</span>
        </span>
        <span data-jump-orb className="m-1 grid h-9 w-9 place-items-center rounded-full bg-white/15">
          <ArrowDown
            aria-hidden
            className={`h-4 w-4 transition-transform duration-300 ease-out ${up ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
    </div>
  );
}
