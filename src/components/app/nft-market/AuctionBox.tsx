/**
 * Auctions inside the NFT sheet. A bid is an ordinary DHB offer that meets the
 * auction's minimum, so the money never leaves the bidder's wallet until the
 * seller accepts the winner, and an outbid bid simply expires.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { parseUnits } from 'ethers';
import { toast } from 'sonner';
import { Gavel, Loader2 } from 'lucide-react';
import { KitButton } from '@/components/app/page-kit/PageKit';
import {
  ensureNftApproval,
  ensureTokenAllowance,
  fetchTerms,
  fillOrder,
  postOrder,
  walletAddress,
  type MarketCurrency,
  type MarketOrder,
} from '@/lib/market/market';
import { buildOffer } from '@/lib/market/seaport';
import { cancelAuction, fetchAuctionForNft, settleAuction, startAuction, tellBidPosted, type Auction } from '@/lib/api/dehub/collect';
import { formatCount } from '@/lib/format-count';
import { formatPrice } from './NftCard';
import { errorText, type NftSheetTarget } from './NftSheet';

const DURATIONS = [24, 72, 168];

/** "2d 4h", "3h 12m", "4m 09s": time left, shortest that still moves. */
export function timeLeft(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

interface AuctionBoxProps {
  target: NftSheetTarget;
  me: string;
  isAuthenticated: boolean;
  held: bigint;
  standard: 'erc721' | 'erc1155';
  dhb: MarketCurrency | undefined;
  /** Live offers on this NFT; the winning bid is one of them. */
  offers: MarketOrder[];
  /** Name and art to show on the auction card. */
  name: string;
  image: string | null;
  /** State gallery: show this auction instead of asking the server. */
  preview?: Auction | null;
}

export function AuctionBox({ target, me, isAuthenticated, held, standard, dhb, offers, name, image, preview }: AuctionBoxProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['nft-market', 'auction', target.chainId, target.contract.toLowerCase(), target.tokenId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchAuctionForNft(target.chainId, target.contract, target.tokenId),
    enabled: preview === undefined,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const auction = preview !== undefined ? preview : query.data?.auction ?? null;
  const bids = query.data?.bids ?? [];
  const now = useNow(!!auction && auction.status === 'live');
  const [form, setForm] = useState<'none' | 'start' | 'bid'>('none');
  const [priceText, setPriceText] = useState('');
  const [hours, setHours] = useState(72);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setForm('none');
    setPriceText('');
  }, [target.chainId, target.contract, target.tokenId]);

  const decimals = auction?.currencyDecimals ?? dhb?.decimals ?? 18;
  const symbol = auction?.currencySymbol ?? dhb?.symbol ?? 'DHB';
  const fmt = (wei: string | null | undefined) => (wei ? `${formatPrice(wei, decimals)} ${symbol}` : '-');
  let priceWei = 0n;
  try {
    priceWei = priceText.trim() ? parseUnits(priceText.trim(), decimals) : 0n;
  } catch {
    priceWei = 0n;
  }

  const run = async (name: string, fn: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(name);
    try {
      await fn();
      toast.success(done);
      setForm('none');
      setPriceText('');
      qc.invalidateQueries({ queryKey: ['nft-market'] });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const start = () =>
    run(
      'start',
      async () => {
        if (!dhb || priceWei <= 0n) return;
        const seller = await walletAddress();
        // Approving now means accepting the winner later is a single step.
        await ensureNftApproval(target.contract, seller, target.chainId);
        await startAuction({
          chainId: target.chainId,
          contract: target.contract,
          tokenId: target.tokenId,
          amount: '1',
          currency: dhb.address,
          startPrice: priceWei.toString(),
          durationHours: hours,
          nftName: name,
          nftImage: image,
        });
      },
      t('collect.auctionStarted', { defaultValue: 'Auction started. We will tell you about every bid.' }),
    );

  const minimum = auction?.minimumBid ? BigInt(auction.minimumBid) : auction ? BigInt(auction.startPrice) : 0n;

  const bid = () =>
    run(
      'bid',
      async () => {
        if (!auction || priceWei < minimum) return;
        const terms = await fetchTerms({ chainId: auction.chainId, contract: auction.contract, tokenId: auction.tokenId, price: priceWei.toString(), currency: auction.currency });
        if (!terms.feeRecipient) throw new Error(t('collect.marketOff', { defaultValue: 'The market is not open on this chain yet.' }));
        const buyer = await walletAddress();
        await ensureTokenAllowance(auction.currency, buyer, priceWei, auction.chainId);
        // A bid stays valid a few days past the end, so the seller has time to accept it.
        const days = Math.max(1, Math.ceil((Date.parse(auction.endsAt) - Date.now()) / 86_400_000) + 3);
        const order = await postOrder('offer', auction.chainId, buyer, (counter) =>
          buildOffer({
            buyer,
            nft: { contract: auction.contract, tokenId: auction.tokenId, standard, amount: auction.amount || '1' },
            currency: auction.currency,
            price: priceWei,
            terms: { feeRecipient: terms.feeRecipient, feeBps: terms.feeBps, royalty: terms.royalty },
            days,
            counter,
            holder: auction.seller,
          }),
        );
        await tellBidPosted(auction.id, order.orderHash).catch(() => undefined);
      },
      t('collect.bidPlaced', { defaultValue: 'Bid placed. Your DHB stays in your wallet until the seller accepts.' }),
    );

  const acceptTop = () =>
    run(
      'accept',
      async () => {
        if (!auction?.topBid) return;
        const top = bids[0];
        const order = offers.find((o) => o.orderHash === top?.orderHash);
        if (!order) throw new Error(t('collect.bidGone', { defaultValue: 'That bid is no longer valid. Close this and open it again.' }));
        const seller = await walletAddress();
        await fillOrder(order, seller, auction.tokenId);
        await settleAuction(auction.id, order.orderHash).catch(() => undefined);
      },
      t('collect.auctionSold', { defaultValue: 'Sold to the top bidder. The DHB is in your wallet.' }),
    );

  const cancel = () =>
    run('cancel', async () => auction && cancelAuction(auction.id), t('collect.auctionCancelled', { defaultValue: 'Auction ended without a sale' }));

  if (!auction) {
    if (!isAuthenticated || held === 0n || !dhb) return null;
    if (form !== 'start') {
      return (
        <KitButton variant="quiet" onClick={() => setForm('start')}>
          <Gavel className="h-4 w-4" />
          {t('collect.startAuction', { defaultValue: 'Start an auction' })}
        </KitButton>
      );
    }
    return (
      <div data-page-bento className="flex flex-col gap-3 rounded-xl bg-zinc-900 p-3" data-auction-form>
        <p className="text-[15px] font-semibold text-white">{t('collect.startAuction', { defaultValue: 'Start an auction' })}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-zinc-500">{t('collect.startPrice', { defaultValue: 'Lowest bid you accept (DHB)' })}</span>
          <input
            inputMode="decimal"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="100"
            className="w-full box-border rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white tabular-nums focus:outline-none focus:border-white/40"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-zinc-500">{t('collect.runsFor', { defaultValue: 'Runs for' })}</span>
          <div className="flex gap-2">
            {DURATIONS.map((h) => (
              <button
                key={h}
                type="button"
                data-kit-chip
                data-size="sm"
                data-active={hours === h ? 'true' : undefined}
                onClick={() => setHours(h)}
              >
                <span>{t('collect.nDays', { defaultValue: '{{n}} days', n: h / 24 })}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-zinc-500">
          {t('collect.auctionHow', { defaultValue: 'Each new bid must beat the last by 5%. When time is up you pick the winner and the NFT and DHB swap in one step.' })}
        </p>
        <div className="flex gap-2">
          <KitButton variant="quiet" disabled={!!busy} onClick={() => setForm('none')}>{t('nftMarket.back', { defaultValue: 'Back' })}</KitButton>
          <KitButton disabled={!!busy || priceWei <= 0n} onClick={start}>
            {busy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('collect.start', { defaultValue: 'Start' })}
          </KitButton>
        </div>
      </div>
    );
  }

  const left = Date.parse(auction.endsAt) - now;
  const isSeller = auction.seller === me;
  const ended = auction.status !== 'live' || left <= 0;

  return (
    <div data-page-bento className="flex flex-col gap-3 rounded-xl bg-zinc-900 p-3" data-auction-box>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[12px] text-zinc-500">
            <Gavel className="h-3.5 w-3.5" />
            {auction.topBid ? t('collect.topBid', { defaultValue: 'Top bid' }) : t('collect.startsAt', { defaultValue: 'Bids start at' })}
          </p>
          <p className="text-[18px] font-bold tabular-nums text-white">{fmt(auction.topBid ?? auction.startPrice)}</p>
          <p className="text-[12px] text-zinc-500">
            {t('collect.bidCount', { defaultValue: '{{n}} bids', n: formatCount(auction.bidCount ?? bids.length) })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-zinc-500">{ended ? t('collect.auctionEnded', { defaultValue: 'Ended' }) : t('collect.endsIn', { defaultValue: 'Ends in' })}</p>
          {!ended ? <p className="text-[18px] font-bold tabular-nums text-white" data-countdown>{timeLeft(left)}</p> : null}
        </div>
      </div>

      {form === 'bid' ? (
        <div className="flex flex-col gap-2">
          <input
            inputMode="decimal"
            autoFocus
            value={priceText}
            onChange={(e) => setPriceText(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder={formatPrice(minimum.toString(), decimals)}
            className="w-full box-border rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white tabular-nums focus:outline-none focus:border-white/40"
          />
          <p className="text-[12px] text-zinc-500">{t('collect.minBid', { defaultValue: 'At least {{price}}', price: fmt(minimum.toString()) })}</p>
          <div className="flex gap-2">
            <KitButton variant="quiet" disabled={!!busy} onClick={() => setForm('none')}>{t('nftMarket.back', { defaultValue: 'Back' })}</KitButton>
            <KitButton disabled={!!busy || priceWei < minimum || priceWei <= 0n} onClick={bid}>
              {busy === 'bid' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('collect.placeBid', { defaultValue: 'Place bid' })}
            </KitButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {!isSeller && !ended && isAuthenticated ? (
            <KitButton onClick={() => { setPriceText(formatPrice(minimum.toString(), decimals).replace(/,/g, '')); setForm('bid'); }}>
              {t('collect.bid', { defaultValue: 'Bid' })}
            </KitButton>
          ) : null}
          {isSeller && auction.topBid ? (
            <KitButton disabled={!!busy} onClick={acceptTop}>
              {busy === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('collect.acceptTop', { defaultValue: 'Sell to top bid' })}
            </KitButton>
          ) : null}
          {isSeller && auction.status === 'live' ? (
            <KitButton variant="quiet" disabled={!!busy} onClick={cancel}>
              {busy === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('collect.endAuction', { defaultValue: 'End without selling' })}
            </KitButton>
          ) : null}
        </div>
      )}

      {bids.length ? (
        <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
          {bids.slice(0, 5).map((b, i) => (
            <div key={b.orderHash} className="flex items-center justify-between gap-3 text-[13px]">
              <span className={i === 0 ? 'font-semibold text-white' : 'text-zinc-400'}>
                {b.makerProfile?.username ? `@${b.makerProfile.username}` : `${b.maker.slice(0, 6)}…${b.maker.slice(-4)}`}
              </span>
              <span className="tabular-nums text-zinc-300">{fmt(b.price)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
