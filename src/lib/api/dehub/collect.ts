/**
 * Collector features on minted posts: editions, owner-only extras, auctions,
 * the weekly drop and market stats. Backend: riftn-backend src/collect.
 */
import { apiCall, authedUpload, getAuthToken } from './core';

export interface RoyaltySplit {
  address: string;
  /** Basis points: 100 = 1%. */
  bps: number;
}

export interface EditionInfo {
  supply: number;
  royalties: RoyaltySplit[];
  royaltyBps: number;
  hasUnlockable: boolean;
  minted: boolean;
  creator: string | null;
  chainId: number | null;
}

/** Copies a post mints when the creator does not choose. */
export const DEFAULT_EDITION_SUPPLY = 1000;
/** All royalty shares together, in basis points: 10%. */
export const MAX_ROYALTY_TOTAL_BPS = 1000;

export const fetchEditions = (tokenIds: (string | number)[]) =>
  apiCall<{ items: Record<string, EditionInfo> }>('/api/collect/editions', {
    params: { tokenIds: [...new Set(tokenIds.map(String))].slice(0, 100).join(',') },
  });

export interface UnlockableFile {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  size: number;
  mimeType: string;
  /** Signed for an hour; null unless you can open it. */
  url: string | null;
}

export interface Unlockable {
  has: boolean;
  isCreator: boolean;
  canOpen: boolean;
  summary: { files: number; kinds: string[]; hasText: boolean };
  text: string | null;
  files: UnlockableFile[];
}

export const fetchUnlockable = (tokenId: string | number) =>
  // Signed in, the server knows whether you are the creator or an owner.
  apiCall<Unlockable>(`/api/collect/unlockable/${tokenId}`, { requiresAuth: !!getAuthToken() });

export const saveUnlockableText = (tokenId: string | number, text: string) =>
  apiCall<Unlockable>(`/api/collect/unlockable/${tokenId}`, { method: 'PUT', body: { text }, requiresAuth: true });

export function uploadUnlockableFile(tokenId: string | number, file: File, onProgress?: (percent: number) => void) {
  const form = new FormData();
  form.append('file', file, file.name);
  return authedUpload<Unlockable>(`/api/collect/unlockable/${tokenId}/files`, form, { onProgress });
}

export const removeUnlockableFile = (tokenId: string | number, fileId: string) =>
  apiCall<Unlockable>(`/api/collect/unlockable/${tokenId}/files/${fileId}`, { method: 'DELETE', requiresAuth: true });

export interface ProfileLite {
  username: string | null;
  displayName: string | null;
  avatarImageUrl: string | null;
}

export interface Auction {
  id: string;
  chainId: number;
  contract: string;
  tokenId: string;
  amount: string;
  seller: string;
  currency: string;
  currencySymbol: string;
  currencyDecimals: number;
  startPrice: string;
  startsAt: string;
  endsAt: string;
  status: 'live' | 'ended' | 'sold' | 'cancelled';
  buyNowOrderHash: string | null;
  winner: string | null;
  soldPrice: string | null;
  nftName: string | null;
  nftImage: string | null;
  sellerProfile?: ProfileLite | null;
  bidCount?: number;
  topBid?: string | null;
  topBidder?: string | null;
  minimumBid?: string;
  buyNow?: { orderHash: string; price: string } | null;
}

export interface AuctionBid {
  orderHash: string;
  maker: string;
  price: string;
  createdAt: string;
  endTime: string;
  makerProfile: ProfileLite | null;
}

export const fetchAuctions = (params: Record<string, string | number | undefined> = {}) =>
  apiCall<{ items: Auction[] }>('/api/market/auctions', { params: params as Record<string, string> });

export const fetchAuction = (id: string) => apiCall<{ auction: Auction; bids: AuctionBid[] }>(`/api/market/auctions/${id}`);

export const fetchAuctionForNft = (chainId: number, contract: string, tokenId: string) =>
  apiCall<{ auction: Auction | null; bids: AuctionBid[] }>(`/api/market/auctions/nft/${chainId}/${contract.toLowerCase()}/${tokenId}`);

export const startAuction = (body: {
  chainId: number;
  contract: string;
  tokenId: string;
  amount?: string;
  currency: string;
  startPrice: string;
  durationHours: number;
  buyNowOrderHash?: string | null;
  nftName?: string | null;
  nftImage?: string | null;
}) => apiCall<{ auction: Auction }>('/api/market/auctions', { method: 'POST', body: body as unknown as Record<string, unknown>, requiresAuth: true });

export const cancelAuction = (id: string) =>
  apiCall<{ auction: Auction }>(`/api/market/auctions/${id}/cancel`, { method: 'POST', requiresAuth: true });

export const tellBidPosted = (id: string, orderHash: string) =>
  apiCall<{ ok: boolean; top?: boolean }>(`/api/market/auctions/${id}/bid`, { method: 'POST', body: { orderHash }, requiresAuth: true });

export const settleAuction = (id: string, orderHash: string) =>
  apiCall<{ auction: Auction }>(`/api/market/auctions/${id}/settle`, { method: 'POST', body: { orderHash }, requiresAuth: true });

export interface DropItem {
  tokenId: number;
  chainId: number;
  contract: string | null;
  name: string;
  image: string | null;
  creator: string | null;
  creatorProfile: ProfileLite | null;
  supply: number;
  minted: boolean;
  note: string | null;
  floor: { price: string; currencySymbol: string; currencyDecimals: number; orderHash: string } | null;
  auctionId: string | null;
}

export interface Drop {
  number: number;
  title: string;
  startsAt: string;
  endsAt: string;
  curated?: boolean;
  nextDropAt?: string;
  items: DropItem[];
}

export const fetchCurrentDrop = () => apiCall<Drop>('/api/market/drops/current');
export const fetchPastDrops = (limit = 6) => apiCall<{ items: Drop[] }>('/api/market/drops', { params: { limit: String(limit) } });

export const applyToDrop = (tokenId: number, note?: string) =>
  apiCall<{ application: { tokenId: number; status: string } }>('/api/market/drops/apply', {
    method: 'POST',
    body: { tokenId, note: note ?? '' },
    requiresAuth: true,
  });

export const fetchMyDropApplications = () =>
  apiCall<{ items: { tokenId: number; status: 'pending' | 'accepted' | 'declined'; dropNumber: number | null }[] }>(
    '/api/market/drops/applications/mine',
    { requiresAuth: true },
  );

export interface MarketStats {
  sales: number;
  volume: { symbol: string; amount: number }[];
  activeListings: number;
  liveAuctions: number;
  minted: number;
  collectors: number;
  topSellers: { address: string; profile: ProfileLite | null; sales: number; volume: { symbol: string; amount: number }[] }[];
}

export const fetchMarketStats = () => apiCall<MarketStats>('/api/market/stats');

/** "5%" or "2.5%" from basis points. */
export function bpsLabel(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(pct * 10 % 1 === 0 ? 1 : 2)}%`;
}
