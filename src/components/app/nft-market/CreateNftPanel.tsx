import { useContext, useEffect, useRef, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, ImagePlus, Loader2, Plus } from 'lucide-react';
import Check from '@/components/ui/cut-icons/check';
import { AuthContext } from '@/contexts/AuthContext';
import { KitButton, PageEmpty } from '@/components/app/page-kit/PageKit';
import { NftArt, NftCard } from '@/components/app/nft-market/NftCard';
import type { NftSheetTarget } from '@/components/app/nft-market/NftSheet';
import { MINT_LATER_CHAINS, describeCost } from '@/components/app/mint/MintChainSheet';
import { useMintExistingPost } from '@/hooks/use-mint-existing-post';
import { getMintFee, type MintFeeQuoteResponse } from '@/lib/api/dehub';
import { mintPost } from '@/lib/api/dehub/content';
import { fetchCreations, MAX_ROYALTY_TOTAL_BPS, type Creation } from '@/lib/api/dehub/collect';
import { isSmartWalletSession } from '@/lib/connection-source';
import { getDefaultChainId } from '@/lib/chains/default-chain';
import { formatCount } from '@/lib/format-count';
import { CHAIN_LABEL, MARKET_CHAINS } from '@/lib/market/market';
import { cn } from '@/lib/utils';

const MAX_ART_BYTES = 42 * 1024 * 1024;
const MAX_SUPPLY = 1_000_000_000;
const COPY_CHOICES = [1, 10, 100, 1000];
const EARN_CHOICES = [0, 250, 500, 1000];
const CHAIN_DOT: Record<number, string> = { 56: '#F0B90B', 8453: '#0052FF', 1: '#8A92B2', 4663: '#CCFF00' };
const CHAINS = MINT_LATER_CHAINS.filter((c) => (MARKET_CHAINS as readonly number[]).includes(c.id as number));
const pctLabel = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

/** A Create-tab NFT not yet on-chain: made again from its saved upload. */
interface Pending {
  tokenId: number;
  chainId: number;
  name: string;
  image: string | null;
}

interface Props {
  /** Open a minted NFT in the market sheet (auction, owner extras, list for sale). */
  onOpen: (target: NftSheetTarget) => void;
  /** Override for the state gallery. */
  preview?: { creations: Creation[]; making?: boolean; art?: string; quotes?: Record<number, MintFeeQuoteResponse> };
}

/**
 * The NFT market's own Create tab. It opens on your NFTs as market tiles with
 * "New NFT" first; that opens one screen where the art is shown as the tile
 * buyers will see, and copies, resale earnings and the chain sit under it with
 * one button to mint. What is made here is an NFT, not a post: it never shows
 * in feeds.
 *
 * Under the hood it is published off-chain (nftOnly) and then minted with the
 * creator's copies and royalties, so a mint that fails is finished later from
 * its tile without uploading again.
 */
export function CreateNftPanel({ onOpen, preview }: Props) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const me = String(auth?.walletAddress ?? '').toLowerCase();
  const queryClient = useQueryClient();
  const { mint, isMinting } = useMintExistingPost();
  const fileInput = useRef<HTMLInputElement>(null);

  const [making, setMaking] = useState(!!preview?.making);
  const [pending, setPending] = useState<Pending | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [art, setArt] = useState<string | null>(preview?.art ?? null);
  const [name, setName] = useState(preview?.making ? 'Neon harbour' : '');
  const [description, setDescription] = useState('');
  const [supply, setSupply] = useState(1);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [earnBps, setEarnBps] = useState(500);
  const defaultChain = CHAINS.some((c) => c.id === getDefaultChainId()) ? (getDefaultChainId() as number) : (CHAINS[0]?.id as number);
  const [chainId, setChainId] = useState<number>(defaultChain);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setArt(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const creations = useQuery({
    queryKey: ['nft-creations', me],
    queryFn: fetchCreations,
    enabled: !preview && !!me,
    staleTime: 15_000,
    // A mint that was just sent lands within a minute; keep the list honest.
    refetchInterval: (q) => ((q.state.data as { items: Creation[] } | undefined)?.items.some((c) => c.minting) ? 10_000 : false),
  });
  const items = preview?.creations ?? creations.data?.items ?? [];

  const quotes = useQueries({
    queries: CHAINS.map((c) => ({
      queryKey: ['mint-fee', c.id],
      queryFn: () => getMintFee(c.id as number),
      enabled: making && !preview,
      staleTime: 55_000,
      refetchInterval: making && !preview ? 60_000 : (false as const),
    })),
  });
  const sponsored = isSmartWalletSession();
  const costOf = (id: number) => {
    const i = CHAINS.findIndex((c) => c.id === id);
    const q = preview?.quotes?.[id] ?? quotes[i]?.data;
    return q ? describeCost(q, preview ? true : sponsored, t) : null;
  };

  const busy = uploading || isMinting;
  const typedOther = Number(otherText.replace(/[^\d]/g, ''));
  const copies = otherOpen ? (Number.isInteger(typedOther) && typedOther >= 1 && typedOther <= MAX_SUPPLY ? typedOther : null) : supply;
  const ready = !!copies && earnBps <= MAX_ROYALTY_TOTAL_BPS && (pending ? true : (!!file || !!preview) && name.trim().length > 0);
  const chainName = CHAINS.find((c) => c.id === chainId)?.name ?? CHAIN_LABEL[chainId] ?? '';
  const cost = costOf(chainId);
  const copiesText = copies === 1
    ? t('collect.oneOfOne', { defaultValue: '1 of 1' })
    : t('collect.copiesPill', { copies: formatCount(copies ?? 0), defaultValue: '{{copies}} copies' });

  const reset = () => {
    setFile(null);
    setArt(null);
    setName('');
    setDescription('');
    setSupply(1);
    setOtherOpen(false);
    setOtherText('');
    setEarnBps(500);
    setPending(null);
  };

  const startNew = () => {
    if (!me && !preview) { auth?.openLoginModal?.(); return; }
    reset();
    setChainId(defaultChain);
    setMaking(true);
  };

  const finish = (c: Creation) => {
    reset();
    setPending({ tokenId: c.tokenId, chainId: c.chainId, name: c.name, image: c.image });
    setName(c.name);
    setArt(c.image);
    setChainId(CHAINS.some((x) => x.id === c.chainId) ? c.chainId : defaultChain);
    setMaking(true);
  };

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      toast.error(t('nftCreate.imageOnly', { defaultValue: 'Pick a picture or GIF. Add video, music or files as owner extras after minting.' }));
      return;
    }
    if (f.size > MAX_ART_BYTES) {
      toast.error(t('nftCreate.tooBig', { defaultValue: 'That file is over 42 MB' }));
      return;
    }
    setFile(f);
  };

  const confirm = async () => {
    if (!ready || busy || !copies || preview) return;
    const edition = { supply: copies, royalties: me && earnBps > 0 ? [{ address: me, bps: earnBps }] : [] };
    let tokenId = pending?.tokenId ?? null;
    try {
      if (tokenId == null) {
        if (!file || !me) return;
        setUploading(true);
        const res = await mintPost({
          name: name.trim(),
          description: description.trim(),
          postType: 'feed-images',
          chainId,
          category: [],
          minterAddress: me,
          mintOptOut: true,
          nftOnly: true,
          files: [file],
          idempotencyKey: crypto.randomUUID(),
        } as Parameters<typeof mintPost>[0]);
        tokenId = Number(res.createdTokenId);
        setUploading(false);
        // From here the upload is safe: a failed mint is finished from its tile.
        setPending({ tokenId, chainId, name: name.trim(), image: art });
        void queryClient.invalidateQueries({ queryKey: ['nft-creations', me] });
      }
      const ok = await mint(tokenId, chainId, chainId, edition);
      if (ok) {
        reset();
        setMaking(false);
        toast.success(t('nftCreate.minted', { defaultValue: 'NFT minted. It shows on the market in a minute.' }));
      }
    } catch (e) {
      setUploading(false);
      toast.error((e as Error)?.message || t('nftCreate.failed', { defaultValue: 'Could not create the NFT' }));
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['nft-creations', me] });
      void queryClient.invalidateQueries({ queryKey: ['nft-market'] });
    }
  };

  if (!me && !preview) {
    return (
      <PageEmpty
        icon="nfts"
        title={t('nftCreate.signIn', { defaultValue: 'Sign in to create an NFT' })}
        action={<KitButton onClick={() => auth?.openLoginModal?.()}>{t('nftMarket.signInToTradeCta', { defaultValue: 'Sign in to trade' })}</KitButton>}
      />
    );
  }

  if (!making) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5" data-nft-create data-nft-creations>
        <button
          type="button"
          data-page-bento
          data-nft-create-new
          onClick={startNew}
          className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl bg-zinc-900 text-white transition-transform active:scale-[0.98]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><Plus className="h-5 w-5" /></span>
          <span className="text-[12px] font-semibold">{t('nftCreate.newNft', { defaultValue: 'New NFT' })}</span>
        </button>
        {creations.isLoading && !preview
          ? Array.from({ length: 5 }, (_, i) => <span key={i} data-page-bento className="aspect-square animate-pulse rounded-xl bg-zinc-900" />)
          : items.map((c, i) => (
            <div key={c.tokenId} data-nft-creation={c.minted ? 'minted' : c.minting ? 'minting' : 'pending'} className="min-w-0">
              <NftCard
                compact
                index={i}
                name={c.name}
                image={c.image}
                chainId={c.chainId}
                priceLabel={
                  c.minted
                    ? (c.supply === 1 ? t('collect.oneOfOne', { defaultValue: '1 of 1' }) : t('collect.copiesPill', { copies: formatCount(c.supply), defaultValue: '{{copies}} copies' }))
                    : c.minting ? t('nftCreate.minting', { defaultValue: 'Minting…' }) : t('nftCreate.finish', { defaultValue: 'Finish minting' })
                }
                dimmed={c.minting}
                onClick={() => {
                  if (c.minted && c.contract) onOpen({ chainId: c.chainId, contract: c.contract, tokenId: String(c.tokenId), standard: 'erc1155', name: c.name, image: c.image });
                  else if (!c.minting && !busy) finish(c);
                }}
              />
            </div>
          ))}
      </div>
    );
  }

  const tileName = name.trim() || t('nftCreate.untitled', { defaultValue: 'Untitled' });
  return (
    <div data-page-bento data-nft-create data-nft-create-making className="mx-auto w-full max-w-[560px] rounded-xl bg-zinc-900 p-3 sm:p-4">
      <div className="mb-4">
        <button
          type="button"
          onClick={() => { if (!busy) { reset(); setMaking(false); } }}
          className="mb-2 flex items-center gap-1 text-[13px] font-medium text-white/70"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('nftCreate.yours', { defaultValue: 'Your NFTs' })}
        </button>
        <button
          type="button"
          data-nft-create-art
          disabled={busy || !!pending}
          onClick={() => fileInput.current?.click()}
          className="relative block aspect-square w-full overflow-hidden rounded-xl bg-white/5 text-left"
          aria-label={t('nftCreate.pickArt', { defaultValue: 'Pick the art' })}
        >
          {art ? <NftArt src={art} alt="" className="h-full w-full" /> : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/60">
              <ImagePlus className="h-7 w-7" />
              <span className="text-[13px]">{t('nftCreate.addArt', { defaultValue: 'Add a picture or GIF' })}</span>
              <span className="text-[11px] text-white/40">{t('nftCreate.pickArtHint', { defaultValue: 'Picture or GIF, 42 MB max' })}</span>
            </span>
          )}
          {/* Inline colours: these sit on the art, like the market tiles. */}
          <span className="absolute left-2 top-2 h-2 w-2 rounded-full ring-2 ring-black/40" style={{ background: CHAIN_DOT[chainId] ?? '#fff' }} />
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 px-3 pb-2.5 pt-10"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))', color: '#fff' }}
          >
            <span className="truncate text-[15px] font-semibold">{tileName}</span>
            <span className="truncate text-[12px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {copies ? copiesText : '-'}
              {earnBps > 0 ? ` · ${t('nftCreate.tileEarn', { pct: pctLabel(earnBps), defaultValue: '{{pct}} to you on resales' })}` : ''}
            </span>
          </span>
        </button>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {pending ? null : (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-white/60">{t('nftCreate.name', { defaultValue: 'Title' })}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 120))}
                disabled={busy}
                placeholder={t('nftCreate.namePlaceholder', { defaultValue: 'Name your NFT' })}
                className="w-full box-border rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-[16px] text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none lg:text-[15px]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-white/60">{t('nftCreate.description', { defaultValue: 'Description (optional)' })}</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                disabled={busy}
                rows={2}
                className="w-full box-border resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-[16px] text-white focus:border-white/40 focus:outline-none lg:text-[15px]"
              />
            </label>
          </>
        )}

        <div>
          <span className="mb-1.5 block text-xs font-medium text-white/60">{t('collect.copiesLabel', { defaultValue: 'How many copies' })}</span>
          <div className="flex flex-wrap gap-2">
            {COPY_CHOICES.map((n) => {
              const on = !otherOpen && supply === n;
              return (
                <button key={n} type="button" data-kit-chip data-size="sm" data-active={on ? 'true' : undefined} aria-pressed={on} disabled={busy} onClick={() => { setOtherOpen(false); setSupply(n); }}>
                  <span>{n === 1 ? t('collect.oneOfOne', { defaultValue: '1 of 1' }) : formatCount(n)}</span>
                </button>
              );
            })}
            <button type="button" data-kit-chip data-size="sm" data-active={otherOpen ? 'true' : undefined} aria-pressed={otherOpen} disabled={busy} onClick={() => setOtherOpen(true)}>
              <span>{t('nftCreate.otherCopies', { defaultValue: 'Other' })}</span>
            </button>
          </div>
          {otherOpen ? (
            <input
              autoFocus
              inputMode="numeric"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
              disabled={busy}
              placeholder={t('nftCreate.otherPlaceholder', { defaultValue: 'Any number, like 250 or 50000' })}
              className="mt-2 w-full box-border rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-[16px] tabular-nums text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none lg:text-[15px]"
              aria-invalid={!copies}
            />
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-white/60">{t('collect.yourRoyalty', { defaultValue: 'You earn on every resale' })}</span>
          <div className="flex flex-wrap gap-2">
            {EARN_CHOICES.map((bps) => (
              <button key={bps} type="button" data-kit-chip data-size="sm" data-active={earnBps === bps ? 'true' : undefined} aria-pressed={earnBps === bps} disabled={busy} onClick={() => setEarnBps(bps)}>
                <span>{bps === 0 ? t('collect.noRoyalty', { defaultValue: 'Nothing' }) : pctLabel(bps)}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-white/60">{t('nftCreate.chain', { defaultValue: 'Chain' })}</span>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('nftCreate.chain', { defaultValue: 'Chain' })}>
            {CHAINS.map((c, i) => {
              const on = c.id === chainId;
              const q = quotes[i];
              const rowCost = costOf(c.id as number);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy}
                  onClick={() => setChainId(c.id as number)}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-60', on ? 'border border-white/25 bg-white/10' : 'border border-white/10 bg-white/5')}
                >
                  <img src={c.icon} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{c.name}</span>
                  <span className="flex shrink-0 flex-col items-end text-right">
                    {q?.isLoading && !preview ? (
                      <span className="h-4 w-16 animate-pulse rounded bg-white/10" />
                    ) : rowCost ? (
                      <>
                        <span className="text-sm font-semibold tabular-nums text-white">{rowCost.primary}</span>
                        <span className="text-xs tabular-nums text-white/50">{rowCost.secondary}</span>
                      </>
                    ) : (
                      <span className="text-xs text-white/40">{t('mintChain.priceUnavailable', { defaultValue: 'Price unavailable' })}</span>
                    )}
                  </span>
                  <span className="flex w-5 shrink-0 justify-center">{on ? <Check className="h-5 w-5 text-white" /> : null}</span>
                </button>
              );
            })}
          </div>
        </div>

        <KitButton disabled={!ready || busy} onClick={() => void confirm()} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : cost
            ? t('mintChain.confirmWithCost', { defaultValue: 'Mint on {{chain}} · {{cost}}', chain: chainName, cost: cost.primary })
            : t('mintChain.confirm', { defaultValue: 'Mint on {{chain}}', chain: chainName })}
        </KitButton>
      </div>
    </div>
  );
}
