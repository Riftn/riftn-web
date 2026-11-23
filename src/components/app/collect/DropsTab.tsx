/**
 * The weekly drop: a handful of minted posts picked each Monday, the market's
 * numbers for the week, live auctions, and a way for creators to put their own
 * posts forward for the next drop.
 */
import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Gavel, Loader2, Sparkles } from 'lucide-react';
import { AuthContext } from '@/contexts/AuthContext';
import { KitButton, PageEmpty, PageSection } from '@/components/app/page-kit/PageKit';
import { formatPrice } from '@/components/app/nft-market/NftCard';
import { timeLeft } from '@/components/app/nft-market/AuctionBox';
import {
  applyToDrop,
  fetchAuctions,
  fetchCurrentDrop,
  fetchMarketStats,
  fetchMyDropApplications,
  type Auction,
  type Drop,
  type DropItem,
  type MarketStats,
} from '@/lib/api/dehub/collect';
import { getMyPosts } from '@/lib/api/dehub/feed';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';

const money = (amount: number) => amount.toLocaleString(undefined, { maximumFractionDigits: amount >= 100 ? 0 : 2 });

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/5 px-3 py-2.5">
      <p className="truncate text-[11.5px] text-zinc-500">{label}</p>
      <p className="whitespace-pre-line text-[17px] font-bold leading-snug tabular-nums text-white break-words">{value}</p>
    </div>
  );
}

export function StatsStrip({ stats }: { stats: MarketStats }) {
  const { t } = useTranslation();
  const volume = stats.volume.length
    ? stats.volume.slice(0, 2).map((v) => `${money(v.amount)} ${v.symbol}`).join('\n')
    : '0';
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-market-stats>
      <Stat label={t('collect.statSales', { defaultValue: 'Sales this week' })} value={formatCount(stats.sales)} />
      <Stat label={t('collect.statVolume', { defaultValue: 'Volume' })} value={volume} />
      <Stat label={t('collect.statAuctions', { defaultValue: 'Live auctions' })} value={formatCount(stats.liveAuctions)} />
      <Stat label={t('collect.statCollectors', { defaultValue: 'Collectors' })} value={formatCount(stats.collectors)} />
    </div>
  );
}

function DropCard({ item }: { item: DropItem }) {
  const { t } = useTranslation();
  const creator = item.creatorProfile?.username ? `@${item.creatorProfile.username}` : item.creatorProfile?.displayName ?? null;
  return (
    <Link to={`/app/post/${item.tokenId}`} className="group flex min-w-0 flex-col overflow-hidden rounded-xl bg-white/5" data-drop-item>
      <div className="relative aspect-square w-full overflow-hidden bg-black/40">
        {item.image ? <img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" /> : null}
        {item.auctionId ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
            <Gavel className="h-3 w-3" />
            {t('collect.auctionChip', { defaultValue: 'Auction' })}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 p-2">
        <p className="truncate text-[13px] font-semibold text-white">{item.name}</p>
        {creator ? <p className="truncate text-[12px] text-zinc-500">{creator}</p> : null}
        <p className="truncate text-[12px] text-zinc-400">
          {item.floor
            ? t('collect.floor', { defaultValue: 'From {{price}}', price: `${formatPrice(item.floor.price, item.floor.currencyDecimals)} ${item.floor.currencySymbol}` })
            : item.supply === 1
              ? t('collect.oneOfOne', { defaultValue: '1 of 1' })
              : t('collect.copiesPill', { defaultValue: '{{copies}} copies', copies: formatCount(item.supply) })}
        </p>
      </div>
    </Link>
  );
}

function AuctionCard({ auction, now }: { auction: Auction; now: number }) {
  const { t } = useTranslation();
  const left = Date.parse(auction.endsAt) - now;
  return (
    <Link
      to={`/fractions?tab=nfts&chain=${auction.chainId}&contract=${auction.contract}&token=${auction.tokenId}`}
      className="flex w-40 shrink-0 flex-col overflow-hidden rounded-xl bg-white/5"
      data-auction-card
    >
      <div className="aspect-square w-full overflow-hidden bg-black/40">
        {auction.nftImage ? <img src={auction.nftImage} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <p className="truncate text-[13px] font-semibold text-white">{auction.nftName || `#${auction.tokenId}`}</p>
        <p className="truncate text-[12px] tabular-nums text-zinc-300">
          {formatPrice(auction.topBid ?? auction.startPrice, auction.currencyDecimals)} {auction.currencySymbol}
        </p>
        <p className="text-[11.5px] tabular-nums text-zinc-500">
          {left > 0 ? t('collect.endsInShort', { defaultValue: '{{time}} left', time: timeLeft(left) }) : t('collect.auctionEnded', { defaultValue: 'Ended' })}
        </p>
      </div>
    </Link>
  );
}

function PutForward() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const mine = useQuery({
    queryKey: ['drop-applications', 'mine'],
    queryFn: fetchMyDropApplications,
    staleTime: 60_000,
  });
  const posts = useQuery({
    queryKey: ['drop-applications', 'posts'],
    queryFn: () => getMyPosts(1, 30),
    enabled: open,
    staleTime: 60_000,
  });
  const status = new Map((mine.data?.items ?? []).map((a) => [a.tokenId, a.status]));
  const minted = (posts.data?.result ?? []).filter((p) => p.status === 'minted');

  const apply = async (tokenId: number) => {
    setSending(tokenId);
    try {
      await applyToDrop(tokenId);
      toast.success(t('collect.applied', { defaultValue: 'Put forward. We will tell you if it is picked.' }));
      qc.invalidateQueries({ queryKey: ['drop-applications'] });
    } catch (e) {
      toast.error((e as Error)?.message || t('collect.saveFailed', { defaultValue: 'Could not save' }));
    } finally {
      setSending(null);
    }
  };

  const statusLabel = (s: string) =>
    s === 'accepted'
      ? t('collect.statusPicked', { defaultValue: 'Picked' })
      : s === 'declined'
        ? t('collect.statusNotPicked', { defaultValue: 'Not this time' })
        : t('collect.statusWaiting', { defaultValue: 'Waiting' });

  return (
    <PageSection
      title={t('collect.putForwardTitle', { defaultValue: 'Get your post in the next drop' })}
      action={!open ? <KitButton variant="quiet" onClick={() => setOpen(true)}>{t('collect.putForward', { defaultValue: 'Put a post forward' })}</KitButton> : null}
    >
      <p className="text-[13px] text-zinc-500">
        {t('collect.putForwardBody', { defaultValue: 'Pick one of your minted posts. Each Monday we choose what goes in the drop.' })}
      </p>
      {open ? (
        posts.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
        ) : minted.length ? (
          <div className="mt-3 flex flex-col gap-2">
            {minted.slice(0, 12).map((p) => {
              const id = Number(p.tokenId);
              const s = status.get(id);
              return (
                <div key={id} className="flex items-center gap-3 border-t border-white/10 pt-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-white">{p.name || p.title || `#${id}`}</span>
                  {s ? (
                    <span className={cn('text-[12px]', s === 'accepted' ? 'text-emerald-300' : 'text-zinc-500')}>{statusLabel(s)}</span>
                  ) : (
                    <KitButton variant="quiet" disabled={sending != null} onClick={() => apply(id)}>
                      {sending === id ? <Loader2 className="h-4 w-4 animate-spin" /> : t('collect.apply', { defaultValue: 'Put forward' })}
                    </KitButton>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-zinc-400">{t('collect.noMinted', { defaultValue: 'Mint a post first, then you can put it forward.' })}</p>
        )
      ) : null}
    </PageSection>
  );
}

export function DropsTab({ preview }: { preview?: { drop: Drop; stats: MarketStats; auctions: Auction[] } } = {}) {
  const { t } = useTranslation();
  const signedIn = !!useContext(AuthContext)?.isAuthenticated;
  const now = useNow();
  const drop = useQuery({ queryKey: ['drops', 'current'], queryFn: fetchCurrentDrop, enabled: !preview, staleTime: 60_000 });
  const stats = useQuery({ queryKey: ['market-stats'], queryFn: fetchMarketStats, enabled: !preview, staleTime: 120_000 });
  const auctions = useQuery({ queryKey: ['nft-market', 'auctions', 'live'], queryFn: () => fetchAuctions({ limit: 20 }), enabled: !preview, staleTime: 30_000 });

  const d = preview?.drop ?? drop.data;
  const s = preview?.stats ?? stats.data;
  const live = preview?.auctions ?? auctions.data?.items ?? [];
  const next = d ? Date.parse(d.nextDropAt ?? d.endsAt) - now : 0;

  return (
    <div className="flex flex-col gap-3" data-drops-tab>
      {s ? <StatsStrip stats={s} /> : null}

      <PageSection
        eyebrow={d ? t('collect.dropNumber', { defaultValue: 'Drop {{n}}', n: d.number }) : undefined}
        title={d?.title || t('collect.thisWeek', { defaultValue: "This week's drop" })}
        action={d && next > 0 ? (
          <span className="text-[12px] tabular-nums text-zinc-400" data-countdown>
            {t('collect.nextDropIn', { defaultValue: 'Next drop in {{time}}', time: timeLeft(next) })}
          </span>
        ) : null}
      >
        {drop.isLoading && !preview ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
        ) : d?.items.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {d.items.map((item) => <DropCard key={item.tokenId} item={item} />)}
          </div>
        ) : (
          <PageEmpty
            icon={<Sparkles className="h-10 w-10 text-zinc-500" />}
            title={t('collect.emptyDrop', { defaultValue: 'Nothing in this drop yet' })}
            body={t('collect.emptyDropBody', { defaultValue: 'Minted posts with the most love this week land here.' })}
          />
        )}
      </PageSection>

      {live.length ? (
        <PageSection title={t('collect.statAuctions', { defaultValue: 'Live auctions' })}>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {live.map((a) => <AuctionCard key={a.id} auction={a} now={now} />)}
          </div>
        </PageSection>
      ) : null}

      {s?.topSellers.length ? (
        <PageSection title={t('collect.topSellers', { defaultValue: 'Top sellers this week' })}>
          <div className="flex flex-col gap-2">
            {s.topSellers.slice(0, 5).map((seller, i) => (
              <div key={seller.address} className="flex items-center gap-3 text-[13px]">
                <span className="w-4 text-zinc-500 tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-white">
                  {seller.profile?.username ? `@${seller.profile.username}` : `${seller.address.slice(0, 6)}…${seller.address.slice(-4)}`}
                </span>
                <span className="text-zinc-400">{t('collect.nSales', { defaultValue: '{{n}} sales', n: formatCount(seller.sales) })}</span>
              </div>
            ))}
          </div>
        </PageSection>
      ) : null}

      {signedIn && !preview ? <PutForward /> : null}
    </div>
  );
}
