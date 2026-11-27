/**
 * Trending videos this week, by reactions or by what they earned
 * ===============================================================
 * Three words under the title: Reactions (most viewed and liked this week),
 * PPV (what PPV unlocks paid) and Tips (what was tipped). Each shows the
 * week's top 10 videos. On PPV and Tips every card carries one small line with
 * the amount, which is money and so stays exact, and on PPV how many unlocked
 * it, which is a counter and so reads short. A week where nothing earned yet
 * says so in a line rather than leaving a gap.
 *
 * Phones get it as a clean-list section, desktop as a bento. Twin of the app's
 * TrendingEarned on Explore.
 *
 * @module components/app/explore/TrendingEarned
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AppState } from '@/components/app/AppState';
import { ExploreListSection } from '@/components/app/explore/ExploreListSection';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { DhbAmount } from '@/components/app/DhbAmount';
import { mapToVideoItem, useUnifiedFeed, type UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { cn } from '@/lib/utils';

export type TrendSort = 'reactions' | 'ppv' | 'tips';

const TREND_SORTS: TrendSort[] = ['reactions', 'ppv', 'tips'];

/** Top of the week per tab. */
const TRENDING_SIZE = 10;

const LABEL_KEY: Record<TrendSort, string> = {
  reactions: 'explorePage.trendReactions',
  ppv: 'explorePage.trendPpv',
  tips: 'explorePage.trendTips',
};

/** Money: the exact amount, never shortened. */
function formatEarned(amount: number, locale?: string): string {
  return amount.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/** What a video earned under a tab, or null on Reactions or for a row with nothing earned. */
function earnedFor(item: UnifiedFeedItem, sort: TrendSort): { amount: number; unlocks: number; currency: string } | null {
  if (sort === 'reactions') return null;
  const amount = Number(sort === 'tips' ? item.totalTips : item.ppvEarnings) || 0;
  if (amount <= 0) return null;
  return {
    amount,
    unlocks: Number(item.ppvBuyerCount) || 0,
    currency: sort === 'ppv' ? item.streamInfo?.payPerViewTokenSymbol || 'DHB' : 'DHB',
  };
}

function SortWords({ value, onChange }: { value: TrendSort; onChange: (sort: TrendSort) => void }) {
  const { t } = useTranslation();
  return (
    <div
      data-trending-sort
      role="tablist"
      aria-label={t('explorePage.trendSortLabel')}
      className="mb-2 flex gap-5 border-b border-zinc-800/60"
    >
      {TREND_SORTS.map((sort) => {
        const active = sort === value;
        return (
          <button
            key={sort}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active || undefined}
            onClick={() => onChange(sort)}
            className={cn(
              'relative shrink-0 whitespace-nowrap pb-2 pt-1 text-[14px] transition-colors',
              active ? 'font-semibold text-white' : 'font-medium text-zinc-500 [@media(hover:hover)]:hover:text-zinc-300',
            )}
          >
            {t(LABEL_KEY[sort])}
            {active && (
              <motion.span
                layoutId="trending-sort-underline"
                className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-white"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function EarnedLine({ item, sort, rank }: { item: UnifiedFeedItem; sort: TrendSort; rank: number }) {
  const { t, i18n } = useTranslation();
  const earned = earnedFor(item, sort);
  if (!earned) return null;
  return (
    <p data-trending-earned className="mb-1.5 flex items-center gap-1.5 px-1 text-[12.5px] text-zinc-400">
      <span className="font-semibold tabular-nums text-zinc-500">#{rank}</span>
      <DhbAmount
        amount={<span className="font-semibold tabular-nums text-white">{formatEarned(earned.amount, i18n.language)}</span>}
        currency={earned.currency}
        iconClassName="h-3.5 w-3.5"
        className="text-white"
      />
      <span className="truncate">
        {sort === 'tips' ? t('explorePage.earnedTipped') : `· ${t('explorePage.earnedUnlocks', { count: earned.unlocks })}`}
      </span>
    </p>
  );
}

export function TrendingEarned({ phone }: { phone: boolean }) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<TrendSort>('reactions');
  const feed = useUnifiedFeed({
    limit: TRENDING_SIZE,
    postType: 'video',
    sortBy: 'views',
    sortOrder: 'desc',
    range: 'week',
    status: 'all',
    earned: sort === 'reactions' ? undefined : sort,
  });
  // The hook keeps the previous tab's list while the next one loads; never
  // show one tab's videos under another tab's name.
  const loading = feed.isLoading || feed.isPlaceholderData;
  const rows = useMemo(
    () => (loading ? [] : (feed.data?.pages[0]?.items ?? []).slice(0, TRENDING_SIZE)),
    [loading, feed.data],
  );

  const empty = sort === 'tips'
    ? t('explorePage.noEarnedTips')
    : sort === 'ppv'
      ? t('explorePage.noEarnedPpv')
      : t('explorePage.noTrendingWeek');

  const body = (
    <>
      <SortWords value={sort} onChange={setSort} />
      {loading ? (
        <div className="space-y-3 py-2" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="aspect-video w-full animate-pulse rounded-2xl bg-zinc-800/60" />)}
        </div>
      ) : feed.isError && rows.length === 0 ? (
        <AppState
          kind="error"
          size="compact"
          title={t('common.failedToLoad')}
          primaryAction={{ label: t('common.retry'), onClick: () => void feed.refetch() }}
        />
      ) : rows.length === 0 ? (
        <p data-trending-empty className="px-1 py-4 text-sm text-zinc-400">{empty}</p>
      ) : (
        <div className="space-y-4 pt-1">
          {rows.map((item, index) => (
            <div key={String(item.tokenId)}>
              <EarnedLine item={item} sort={sort} rank={index + 1} />
              <VideoCard video={mapToVideoItem(item, index)} />
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (phone) {
    return (
      <ExploreListSection icon="videos" title={t('explorePage.trendingWeekTitle')} data-explore-trending-videos className="border-t border-zinc-800/60">
        {body}
      </ExploreListSection>
    );
  }
  return (
    <div data-page-bento data-explore-trending-videos className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
        <ThemedIcon icon="videos" className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9" />
        {t('explorePage.trendingWeekTitle')}
      </h2>
      {body}
    </div>
  );
}

export default TrendingEarned;
