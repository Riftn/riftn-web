import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Tip Payment Hook
 * ================
 * Handles tipping creators via StreamController.sendTip().
 * Uses contract so backend can detect tips via SendFunds event (not direct ERC20 transfer).
 *
 * IMPORTANT: Success toast is only shown AFTER on-chain confirmation AND database persistence.
 * This ensures users never see "Tip sent!" when the record wasn't saved.
 */

import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import { supabase } from '@/integrations/supabase/client';
// NOTE: aa-utils / stream-controller / read-tip-transaction reach wagmi +
// web3auth. This hook is used by eager feed cards (TipModal), so those
// modules are dynamically imported inside tip() to keep the wallet stack out
// of the entry bundle (scripts/check-entry-bundle.mjs fails the build
// otherwise).
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { useAuth } from '@/contexts/AuthContext';
import type { ChainId } from '@/components/app/ChainSelector';
import i18n from 'i18next';
import type { DirectTipToken } from '@/lib/direct-tip-tokens';
import { getRemixLink, splitRemixTip, type RemixLink } from '@/lib/remix-links';

export const MIN_TIP_DHB = 1;
export const MAX_TIP_DHB = Infinity;
export const MIN_DIRECT_TIP = 0.1;
export const DIRECT_QUICK_AMOUNTS = [1, 5, 10, 25, 50, 100];

const MAX_DB_RETRIES = 3;

/**
 * The original creator's cut when the tipped post is a duet, stitch or
 * reaction of their video. Never blocks a tip: no answer in time means no split.
 */
async function remixShareFor(tokenId: string | undefined, creatorAddress: string, tipper: string): Promise<RemixLink | null> {
  if (!tokenId || !/^[1-9]\d*$/.test(tokenId)) return null;
  const link = await Promise.race([
    getRemixLink(tokenId).catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 2500)),
  ]);
  if (!link || link.splitBps <= 0 || link.remixerAddress !== creatorAddress.toLowerCase()) return null;
  // Tipping your own video's remix just sends the whole tip to the remixer.
  return link.sourceAddress === tipper.toLowerCase() ? null : link;
}

interface UseTipPaymentOptions {
  creatorAddress?: string;
  chainId?: ChainId;
  tokenId?: string;
  /** Set when tipping a comment's author rather than the post's creator.
   *  Recorded on the tip row so the comment can show its own tip total;
   *  rows with a comment_id are excluded from the post's tip count. */
  commentId?: string;
  onSuccess?: () => void;
  /** Called the moment the tx is submitted, with its hash — before
   *  confirmation. Live gifting uses this to record the tip on the stream's
   *  activity feed without waiting out a confirmation the viewer won't. */
  onSubmitted?: (txHash: string, amount: number) => void;
  /** Called after on-chain confirmation + DB save succeeds (background), with the transaction hash. */
  onConfirmed?: (txHash?: string) => void;
}

/**
 * Ask for an on-chain tip's record to be written, so the post's and comments'
 * tip figures include it.
 *
 * The browser no longer writes the row itself: it names the payment, and the
 * `tip-record` function writes what the API has on file for it. `commentId`
 * tells it which comment an on-chain tip was for (the chain only carries the
 * post). The API also writes the row on its own once it has indexed the
 * payment, so "not on file yet" is not a failure.
 */
export async function persistTipRecord(
  params: {
    walletAddress: string;
    creatorAddress: string;
    amount: number;
    chainId: ChainId;
    txHash: string;
    tokenId: string | null;
    commentId: string | null;
  },
): Promise<boolean> {
  // A comment tip needs this call to land after the payment is indexed, so it
  // keeps asking a little longer than a post tip does.
  const attempts = params.commentId ? 6 : MAX_DB_RETRIES;
  let failed = false;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { data, error } = await supabase.functions.invoke('tip-record', {
      body: { txHash: params.txHash, ...(params.commentId ? { commentId: params.commentId } : {}) },
    });
    if (!error && (data as { recorded?: boolean } | null)?.recorded) return true;
    failed = !!error;
    if (error) console.error(`[Tip] record attempt ${attempt}/${attempts} failed:`, error);
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  // Not on file yet is fine for a post tip: the API writes that row by itself.
  return !failed && !params.commentId;
}

/** Send the original creator's share of a remix tip, once the main tip is confirmed. */
async function sendRemixShare(params: {
  remix: RemixLink; amount: number; chainId: ChainId; tipChainId: ChainId; walletAddress: string; token?: DirectTipToken | null;
  warn: () => void;
}) {
  const [{ sendTip }, { readConfirmedTipDetails }] = await Promise.all([
    import('@/lib/contracts/stream-controller'),
    import('@/lib/contracts/read-tip-transaction'),
  ]);
  const { remix, token } = params;
  try {
    const shareResult = await sendTip({
      tokenId: remix.sourceTokenId,
      amount: params.amount,
      to: remix.sourceAddress,
      chainId: params.tipChainId,
      signerAddress: params.walletAddress,
      ...(token ? { tokenAddress: token.address, decimals: token.decimals } : {}),
    });
    const hash = await shareResult.confirmed;
    if (token) return;
    const confirmed = await readConfirmedTipDetails(hash, params.tipChainId);
    await persistTipRecord({ walletAddress: params.walletAddress, creatorAddress: confirmed.receiverAddress, amount: confirmed.amount,
      chainId: params.chainId, txHash: hash, tokenId: String(remix.sourceTokenId), commentId: null });
  } catch (error) {
    console.error('[Tip] Remix share failed:', error);
    params.warn();
  }
}

export function useTipPayment({
  creatorAddress,
  chainId = BASE_CHAIN_ID,
  tokenId,
  commentId,
  onSuccess,
  onSubmitted,
  onConfirmed,
}: UseTipPaymentOptions) {
  const { t: _copy } = _useCopy();
  const [isTipping, setIsTipping] = useState(false);
  // State alone does not stop a double tap: two taps in the same frame both
  // read isTipping=false before React re-renders the disabled button, and
  // each one submits its own user operation. The ref flips synchronously.
  const inFlight = useRef(false);
  const { walletAddress, openLoginModal } = useAuth();

  /** `amount` DHB, or with `token` USDC/USDT on its chain; those skip the DHB tip_records. */
  const tip = useCallback(
    async (amount: number, token?: DirectTipToken | null) => {
      if (inFlight.current) return;
      const tipChainId = (token?.chainId ?? chainId) as ChainId;
      const unit = token?.symbol ?? 'DHB';

      if (!walletAddress) {
        openLoginModal?.();
        return;
      }

      if (!creatorAddress) {
        toast.error(_copy("copy.401979c70f39", { defaultValue: "Creator address not available" }));
        return;
      }

      if (walletAddress.toLowerCase() === creatorAddress.toLowerCase()) {
        toast.error(_copy("copy.af1a11355de9", { defaultValue: "You can't tip yourself!" }));
        return;
      }

      if (token ? !(amount >= MIN_DIRECT_TIP) : amount < MIN_TIP_DHB || amount > MAX_TIP_DHB) {
        if (token) {
          toast.error(_copy("copy.ebb51e28caa3", { defaultValue: "Minimum tip is {{value1}} {{value2}}", value1: MIN_DIRECT_TIP, value2: unit }));
          return;
        }
        toast.error(dhbText(_copy("copy.0ea3027cdb14", { defaultValue: "Amount must be between {{value1}} and {{value2}} DHB", value1: MIN_TIP_DHB, value2: MAX_TIP_DHB })));
        return;
      }

      inFlight.current = true;
      setIsTipping(true);

      try {
        const [{ switchChain }, { sendTip }, { readConfirmedTipDetails }] = await Promise.all([
          import('@/lib/contracts/aa-utils'),
          import('@/lib/contracts/stream-controller'),
          import('@/lib/contracts/read-tip-transaction'),
        ]);

        await switchChain(tipChainId);

        toast.loading(_copy("copy.b278b8ea1c8c", { defaultValue: "Sending tip..." }), { id: 'tip-payment' });

        // A comment tip goes to the comment's author, never into a remix split.
        const remix = commentId ? null : await remixShareFor(tokenId, creatorAddress, walletAddress);
        const split = splitRemixTip(amount, remix);
        const sourceShare = remix && split.source >= 0.01 ? Math.round(split.source * 1e6) / 1e6 : 0;
        const creatorShare = sourceShare ? Math.round((amount - sourceShare) * 1e6) / 1e6 : amount;

        const tipResult = await sendTip({
          tokenId: tokenId || 0,
          amount: creatorShare,
          to: creatorAddress,
          chainId: tipChainId,
          signerAddress: walletAddress,
          ...(token ? { tokenAddress: token.address, decimals: token.decimals } : {}),
        });

        toast.loading(i18n.t('toasts.confirming_transaction'), { id: 'tip-payment' });
        onSubmitted?.(tipResult.hash, amount);
        onSuccess?.();

        // Background: confirm on-chain + persist decoded on-chain values to DB
        (async () => {
          try {
            const confirmedTxHash = await tipResult.confirmed;
            if (remix && sourceShare) {
              void sendRemixShare({ remix, amount: sourceShare, chainId, tipChainId, walletAddress, token,
                warn: () => toast.warning(_copy('remixLinks.shareFailed', { defaultValue: "Your tip was sent, but the original creator's share didn't go through." })) });
            }
            const confirmedTip = await readConfirmedTipDetails(confirmedTxHash, tipChainId, token ?? undefined);

            if (token) {
              toast.success(_copy("copy.a8537f3a1a4a", { defaultValue: "{{value1}} {{value2}} tip sent!", value1: confirmedTip.amount.toLocaleString(), value2: unit }), { id: 'tip-payment' });
              onConfirmed?.(confirmedTxHash);
              return;
            }

            const saved = await persistTipRecord({
              walletAddress,
              creatorAddress: confirmedTip.receiverAddress,
              amount: confirmedTip.amount,
              chainId,
              txHash: confirmedTxHash,
              // The chain wins; the post this modal was opened for fills a zero id in.
              tokenId: confirmedTip.tokenId ?? (/^[1-9]\d*$/.test(String(tokenId ?? '')) ? String(tokenId) : null),
              commentId: commentId ?? null,
            });

            if (!saved) {
              console.error('[Tip] All DB save retries failed for tx:', confirmedTxHash);
              toast.error(_copy("copy.6d8a60ec4ad9", { defaultValue: "Tip confirmed on-chain but failed to save. Contact support with tx: {{value1}}...", value1: confirmedTxHash.slice(0, 10) }), {
                duration: 10000,
              });
              return;
            }

            // DB saved — reconcile UI
            toast.success(dhbText(_copy("copy.76a7616a1518", { defaultValue: "DHB {{value1}} tip sent!", value1: amount.toLocaleString() })), { id: 'tip-payment' });
            onConfirmed?.(confirmedTxHash);
          } catch (err) {
            console.error('[Tip] Background confirmation failed:', err);
            if ((err as any)?.code === 'TRANSACTION_REVERTED') {
              toast.error(i18n.t('toasts.transaction_reverted'), { id: 'tip-payment' });
            } else {
              toast.warning(i18n.t('staking.pendingSubmitted', { amount: amount.toLocaleString() }), {
                id: 'tip-payment', description: tipResult.hash, duration: 10000,
              });
            }
          }
        })();
      } catch (error: unknown) {
        console.error('[Tip] Payment failed:', error);
        if ((error as any)?.code === 'WALLET_ACTION_CANCELLED') {
          toast.dismiss('tip-payment');
          return;
        }
        // Module is cached after the import above; the fallback only fires if
        // the chunk itself failed to load.
        const aa = await import('@/lib/contracts/aa-utils').catch(() => null);
        // A locked wallet is not a failed tip: signing stopped to ask for the
        // password and AuthProvider has already put the unlock sheet up with
        // its own toast. Saying "failed" on top of that is what made people
        // abandon a tip that was one tap from going through.
        if (!aa || !aa.isWalletLockedError(error)) {
          const message = aa ? aa.parseTxError(error as Error) : '';
          if ((error as any)?.code === 'TRANSACTION_CONFIRMATION_PENDING') {
            toast.warning(message, { id: 'tip-payment', duration: 10000 });
          } else toast.error(message || _copy("copy.07d3d96b534a", { defaultValue: "Tip failed" }), { id: 'tip-payment' });
        } else {
          // The wallet unlock flow owns the next toast. Remove this pending
          // state so its prompt never lands on top of a stale "Sending tip".
          toast.dismiss('tip-payment');
        }
      } finally {
        inFlight.current = false;
        setIsTipping(false);
      }
    },
    [walletAddress, creatorAddress, chainId, tokenId, commentId, openLoginModal, onSuccess, onSubmitted, onConfirmed, _copy]
  );

  return { tip, isTipping };
}
