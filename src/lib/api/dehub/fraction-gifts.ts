import { apiCall } from './core';

export interface FractionGiftConfirm {
  success?: boolean;
  pending?: boolean;
  quantity?: number;
}

/**
 * Tell the server about fractions you just sent. It reads the transfer back
 * off-chain and notifies the receiver. `pending` means the transaction is not
 * readable yet, so ask again.
 */
export function confirmFractionGift(body: { chainId: number; txHash: string; to: string; tokenId: string | number }) {
  return apiCall<FractionGiftConfirm>('/api/fractions/gift', {
    method: 'POST',
    body: { ...body, tokenId: Number(body.tokenId) },
    requiresAuth: true,
  });
}
