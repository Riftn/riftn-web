import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { NAMED_FEEDS, type HomePostTypeValue, type NamedFeedValue } from '@/lib/feed-utils';

/**
 * Pulse · Read & discuss, Motion · Watch, Echo · Listen: the named Home
 * filters, three chips on top of the filter panel (phone and desktop alike).
 * Tap one to show only its post types; tap it again to go back to everything.
 *
 * Chips carry data-filter-chip / data-active like the presets row, so every
 * theme paints them the same way.
 */
export function NamedFeedsRow({
  value,
  onSelect,
  className,
}: {
  value: HomePostTypeValue;
  onSelect: (next: NamedFeedValue | 'all') => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div data-named-feeds className={cn('flex flex-col gap-2', className)}>
      <span className="text-xs uppercase tracking-wider text-zinc-500">{t('filters.namedFeeds', 'Feeds')}</span>
      <div className="grid grid-cols-3 gap-1.5">
        {NAMED_FEEDS.map((feed) => {
          const active = feed.value === value;
          const purpose = t(feed.purposeKey, feed.purpose);
          return (
            <button
              key={feed.value}
              type="button"
              data-filter-chip
              data-named-feed={feed.value}
              data-active={active ? 'true' : undefined}
              aria-pressed={active}
              aria-label={active ? t('filters.namedClear', { name: feed.name, defaultValue: 'Clear {{name}}' }) : `${feed.name} · ${purpose}`}
              onClick={() => onSelect(active ? 'all' : feed.value)}
              className={cn(
                'flex min-w-0 flex-col items-start rounded-xl px-3 py-1.5 text-left transition-colors',
                active
                  ? 'border border-white/30 bg-gradient-to-br from-white/20 via-white/10 to-white/5 text-white'
                  : 'border border-white/10 text-zinc-400 [@media(hover:hover)]:hover:text-white',
              )}
            >
              <span className="w-full truncate text-sm font-semibold">{feed.name}</span>
              <span className={cn('w-full truncate text-[11px] leading-4', active ? 'text-zinc-400' : 'text-zinc-500')}>{purpose}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default NamedFeedsRow;
