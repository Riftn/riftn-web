import { useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { AuthContext } from '@/contexts/AuthContext';
import { KitButton, PageEmpty, PageSection } from '@/components/app/page-kit/PageKit';
import { NftArt } from '@/components/app/nft-market/NftCard';
import type { NftSheetTarget } from '@/components/app/nft-market/NftSheet';
import { MintChainSheet } from '@/components/app/mint/MintChainSheet';
import { useMintExistingPost } from '@/hooks/use-mint-existing-post';
import { mintPost, type EditionChoice } from '@/lib/api/dehub/content';
import { fetchCreations, type Creation } from '@/lib/api/dehub/collect';
import { formatCount } from '@/lib/format-count';
import { CHAIN_LABEL, MARKET_CHAINS } from '@/lib/market/market';

const MAX_ART_BYTES = 42 * 1024 * 1024;
const bpsLabel = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

interface Props {
  /** Open a minted NFT in the market sheet (auction, owner extras, list for sale). */
  onOpen: (target: NftSheetTarget) => void;
  /** Override for the state gallery. */
  preview?: { creations: Creation[] };
}

/**
 * The NFT market's own Create tab. What is made here is an NFT, not a post:
 * art, a title, how many copies and who earns on resales. It never shows in
 * feeds; it trades here. Owner-only extras and auctions live on its sheet.
 *
 * Under the hood it is published off-chain (nftOnly) and then minted with the
 * creator's copies and royalties, so a mint that fails can be finished later
 * from "Your NFTs" without uploading again.
 */
export function CreateNftPanel({ onOpen, preview }: Props) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const me = String(auth?.walletAddress ?? '').toLowerCase();
  const queryClient = useQueryClient();
  const { mint, isMinting } = useMintExistingPost();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sheet, setSheet] = useState<{ tokenId: number | null; chainId?: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!file) { setArt(null); return; }
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

  const ready = !!file && name.trim().length > 0;
  const busy = uploading || isMinting;

  const confirm = async (chainId: number, edition: EditionChoice) => {
    if (!sheet || busy) return;
    let tokenId = sheet.tokenId;
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
        // From here the upload is safe: a failed mint is finished from "Your NFTs".
        setFile(null);
        setName('');
        setDescription('');
        setSheet({ tokenId, chainId });
        void queryClient.invalidateQueries({ queryKey: ['nft-creations', me] });
      }
      const ok = await mint(tokenId, chainId, chainId, edition);
      if (ok) {
        setSheet(null);
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

  return (
    <div className="flex flex-col gap-3" data-nft-create>
      <PageSection
        eyebrow={t('nftCreate.eyebrow', { defaultValue: 'Create' })}
        title={t('nftCreate.title', { defaultValue: 'Make an NFT' })}
      >
        <p className="mb-3 text-[13px] leading-relaxed text-zinc-400">
          {t('nftCreate.intro', { defaultValue: 'An NFT is not a post. It lives here on the market: choose how many copies, who earns on resales, and extras only owners can open.' })}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            data-nft-create-art
            className="relative flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-black/30 sm:w-56"
            aria-label={t('nftCreate.pickArt', { defaultValue: 'Pick the art' })}
          >
            {art ? (
              <>
                <img src={art} alt="" className="h-full w-full object-contain" />
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setFile(null); } }}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label={t('nftCreate.removeArt', { defaultValue: 'Remove' })}
                >
                  <X className="h-4 w-4" />
                </span>
              </>
            ) : (
              <span className="flex flex-col items-center gap-2 px-4 text-center text-[13px] text-zinc-400">
                <ImagePlus className="h-7 w-7 text-zinc-300" />
                {t('nftCreate.pickArtHint', { defaultValue: 'Picture or GIF, 42 MB max' })}
              </span>
            )}
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <label className="block">
              <span className="mb-1.5 block text-xs text-white/70">{t('nftCreate.name', { defaultValue: 'Title' })}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 120))}
                disabled={busy}
                placeholder={t('nftCreate.namePlaceholder', { defaultValue: 'Name your NFT' })}
                className="w-full box-border rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-white/70">{t('nftCreate.description', { defaultValue: 'Description (optional)' })}</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                disabled={busy}
                rows={3}
                className="w-full box-border resize-none rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
              />
            </label>
            <KitButton disabled={!ready || busy} onClick={() => setSheet({ tokenId: null })} className="self-start">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('nftCreate.next', { defaultValue: 'Choose copies and mint' })}
            </KitButton>
          </div>
        </div>
      </PageSection>

      <PageSection title={t('nftCreate.yours', { defaultValue: 'Your NFTs' })}>
        {creations.isLoading && !preview ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
        ) : items.length ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4" data-nft-creations>
            {items.map((c) => (
              <div key={c.tokenId} className="flex min-w-0 flex-col gap-1.5" data-nft-creation={c.minted ? 'minted' : c.minting ? 'minting' : 'pending'}>
                <button
                  type="button"
                  disabled={!c.minted || !c.contract}
                  onClick={() => c.contract && onOpen({ chainId: c.chainId, contract: c.contract, tokenId: String(c.tokenId), standard: 'erc1155', name: c.name, image: c.image })}
                  className="block overflow-hidden rounded-xl"
                >
                  <NftArt src={c.image} alt={c.name} className="aspect-square w-full" />
                </button>
                <p className="truncate text-[13px] font-semibold text-white">{c.name}</p>
                <p className="truncate text-[12px] text-zinc-500">
                  {c.supply === 1 ? t('collect.oneOfOne', { defaultValue: '1 of 1' }) : t('collect.copiesPill', { copies: formatCount(c.supply), defaultValue: '{{copies}} copies' })}
                  {c.royaltyBps > 0 ? ` · ${bpsLabel(c.royaltyBps)}` : ''}
                  {` · ${CHAIN_LABEL[c.chainId] ?? ''}`}
                </p>
                {c.minted ? null : c.minting ? (
                  <span className="text-[12px] text-zinc-400">{t('nftCreate.minting', { defaultValue: 'Minting…' })}</span>
                ) : (
                  <button
                    type="button"
                    data-kit-chip
                    data-size="sm"
                    disabled={busy}
                    onClick={() => setSheet({ tokenId: c.tokenId, chainId: c.chainId })}
                    className="self-start"
                  >
                    <span>{t('nftCreate.finish', { defaultValue: 'Finish minting' })}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-[13px] text-zinc-500">{t('nftCreate.none', { defaultValue: 'Nothing yet. Your NFTs show up here.' })}</p>
        )}
      </PageSection>

      <MintChainSheet
        open={!!sheet}
        onOpenChange={(o) => { if (!o && !busy) setSheet(null); }}
        defaultChainId={sheet?.chainId}
        onlyChains={MARKET_CHAINS as readonly number[]}
        isMinting={busy}
        onConfirm={(chainId, edition) => void confirm(chainId as number, edition)}
        editionOpen
        hideAllowance
        title={t('nftCreate.sheetTitle', { defaultValue: 'Mint NFT' })}
      />
    </div>
  );
}
