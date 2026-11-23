import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Event Gate Payment Hook
 * =======================
 * Handles paying the gate fee for gated events.
 * Sends DHB to the event creator via StreamController.sendTip(),
 * then records the payment in event_gate_payments.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { isUserRejection } from '@/lib/wallet-errors';
import { getWalletAddress, switchChain } from '@/lib/contracts/aa-utils';
import { toastTxError } from '@/lib/tx-error-toast';
import { sendTip } from '@/lib/contracts/stream-controller';
import { useAuth } from '@/contexts/AuthContext';
import { BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';

/** Check if user already paid the gate fee */
export function useHasPaidGate(eventId: string | undefined) {
  const { walletAddress } = useAuth();

  return useQuery({
    queryKey: ['event-gate-paid', eventId, walletAddress],
    enabled: !!eventId && !!walletAddress,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_gate_payments' as any)
        .select('id')
        .not('verified_at', 'is', null)
        .eq('event_id', eventId!)
        .eq('payer_wallet_address', walletAddress!.toLowerCase())
        .limit(1);
      if (error) throw error;
      return (data as any[])?.length > 0;
    },
  });
}

interface UseEventGatePaymentOptions {
  eventId: string;
  creatorAddress: string;
  amount: number;
  onSuccess?: () => void;
}

export function useEventGatePayment({
  eventId,
  creatorAddress,
  amount,
  onSuccess,
}: UseEventGatePaymentOptions) {
  const { t: _copy } = _useCopy();
  const [isPaying, setIsPaying] = useState(false);
  const { walletAddress, openLoginModal } = useAuth();
  const queryClient = useQueryClient();
  const chainId = BASE_CHAIN_ID;
  const inFlight = useRef(false);

  const pay = useCallback(async () => {
    if (!walletAddress) {
      openLoginModal?.();
      return;
    }

    if (walletAddress.toLowerCase() === creatorAddress.toLowerCase()) {
      // Creator doesn't need to pay their own gate
      toast.info(_copy("copy.66e4dac72b40", { defaultValue: "You're the event creator — no fee needed!" }));
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;
    setIsPaying(true);
    const key = `event-gate:${chainId}:${eventId}:${walletAddress.toLowerCase()}`;
    const claim = crypto.randomUUID();
    async function request(action: string, txHash?: string, claimId: string = claim) {
      const { data, error } = await withWalletHeader(supabase.rpc('event_gate_checkout' as any, {
        p_action: action, p_event: eventId, p_claim: claimId, p_hash: txHash ?? null,
      } as any), walletAddress!);
      if (error) throw new Error(error.message);
      const result = data as { paid?: boolean; pending?: boolean; canSubmit?: boolean; reference?: string;
        staleClaim?: string; mismatch?: boolean; amount?: number; recipient?: string; reverted?: boolean; error?: string; hash?: string } | null;
      if (result?.error) throw new Error(result.error);
      if (!result) throw new Error('Missing event payment response');
      return result;
    }
    try {
      let pending: { hash: string; claim: string } | null = JSON.parse(localStorage.getItem(key) || 'null');
      const quote = await request('prepare');
      if (!pending && quote.hash) pending = { hash: quote.hash, claim };
      if (!quote.paid && !pending && quote.canSubmit) {
        let submitting = false;
        try {
          if (!quote.reference || Number(quote.amount) !== amount || quote.recipient !== creatorAddress.toLowerCase()) {
            throw new Error('The entry fee changed. Reopen the event before paying.');
          }
          await switchChain(chainId);
          const signerAddress = await getWalletAddress();
          if (signerAddress.toLowerCase() !== walletAddress.toLowerCase()) throw new Error('Select your signed-in wallet.');
          toast.loading(_copy("copy.c03dae247d6d", { defaultValue: "Processing payment..." }), { id: 'gate-payment' });
          const sent = await sendTip({
            tokenId: quote.reference, amount, to: quote.recipient, chainId, signerAddress,
            beforeSubmit: async () => {
              if (!(await request('check_claim')).canSubmit) throw new Error('This payment is already being handled.');
              submitting = true;
            },
          });
          pending = { hash: sent.hash, claim };
          const confirmed = sent.confirmed.catch(() => null);
          localStorage.setItem(key, JSON.stringify(pending));
          await request('record', sent.hash);
          const finalHash = await confirmed;
          if (finalHash) {
            pending.hash = finalHash;
            localStorage.setItem(key, JSON.stringify(pending));
          }
        } catch (error) {
          if (!submitting || isUserRejection(error)) await request('release');
          throw error;
        }
      }
      if (!quote.paid) {
        if (!pending) {
          const hash = window.prompt(_copy('events.recoverPayment', {
            defaultValue: 'A payment has already been started. Enter its Base transaction hash to check the receipt.',
          }))?.trim();
          if (!hash) {
            if (quote.staleClaim && window.confirm(_copy('events.clearUnusedPayment', {
              defaultValue: 'Only clear this attempt if you closed the original wallet request and your wallet shows no pending or completed entry payment. Clear the unused attempt?',
            }))) {
              await request('release', undefined, quote.staleClaim);
              toast.info(_copy('events.paymentCleared', { defaultValue: 'Unused attempt cleared. You can now start a payment.' }));
            }
            return;
          }
          pending = { hash, claim };
        }
        let result = await request('confirm', pending.hash);
        for (let poll = 0; result.pending && poll < 15; poll++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          result = await request('confirm', pending.hash);
        }
        if (result.mismatch) {
          const corrected = window.prompt(_copy('events.correctReceipt', {
            defaultValue: 'This receipt does not match the entry fee. Enter the Base transaction hash from your wallet.',
          }))?.trim();
          if (corrected && /^0x[0-9a-f]{64}$/i.test(corrected)) {
            localStorage.setItem(key, JSON.stringify({ hash: corrected, claim }));
            throw new Error('Receipt saved. Select the entry button to verify it.');
          }
          throw new Error('The receipt does not match this event payment.');
        }
        if (result.reverted) {
          localStorage.removeItem(key);
          throw new Error('The payment reverted on Base. No entry fee was transferred.');
        }
        if (!result.paid) throw new Error('Your receipt is awaiting verification.');
      }
      localStorage.removeItem(key);

      toast.success(dhbText(_copy("copy.e08897abcc4f", { defaultValue: "Paid {{value1}} DHB entry fee!", value1: amount })), { id: 'gate-payment' });

      queryClient.invalidateQueries({ queryKey: ['event-gate-paid', eventId] });
      onSuccess?.();
    } catch (error: unknown) {
      console.error('[GatePayment] Failed:', error);
      toastTxError(error, _copy("copy.17aadc092fe6", { defaultValue: "Payment failed" }), { id: 'gate-payment' });
    } finally {
      inFlight.current = false;
      setIsPaying(false);
    }
  }, [walletAddress, creatorAddress, amount, eventId, chainId, openLoginModal, onSuccess, queryClient, _copy]);

  return { pay, isPaying };
}
