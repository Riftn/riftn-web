import { apiCall } from './core';
import { setCoAuthors, type CoAuthorUser } from '@/lib/co-author-store';

export interface CoAuthorsPayload {
  tokenId: number;
  max: number;
  coAuthorUsers: CoAuthorUser[];
  pendingCoAuthorUsers?: CoAuthorUser[];
  coAuthorInvited: boolean;
  isCoAuthor: boolean;
}

function remember(data: CoAuthorsPayload): CoAuthorsPayload {
  setCoAuthors(data.tokenId, {
    users: data.coAuthorUsers || [],
    invited: !!data.coAuthorInvited,
    ...(data.pendingCoAuthorUsers ? { pending: data.pendingCoAuthorUsers } : {}),
  });
  return data;
}

const path = (tokenId: string | number) => `/api/nft/${encodeURIComponent(String(tokenId))}/co-authors`;

export async function getCoAuthors(tokenId: string | number): Promise<CoAuthorsPayload> {
  const res = await apiCall<{ data: CoAuthorsPayload }>(path(tokenId), { requiresAuth: true });
  return remember(res.data);
}

/** Invite by username (with or without @) or wallet address. */
export async function inviteCoAuthor(tokenId: string | number, user: string): Promise<CoAuthorsPayload> {
  const res = await apiCall<{ data: CoAuthorsPayload }>(path(tokenId), { method: 'POST', body: { user }, requiresAuth: true });
  return remember(res.data);
}

export async function answerCoAuthorInvite(tokenId: string | number, accept: boolean): Promise<CoAuthorsPayload> {
  const res = await apiCall<{ data: CoAuthorsPayload }>(`${path(tokenId)}/respond`, { method: 'POST', body: { accept }, requiresAuth: true });
  return remember(res.data);
}

/** The creator removes anyone (or cancels an invite); a co-author removes themselves. */
export async function removeCoAuthor(tokenId: string | number, address: string): Promise<CoAuthorsPayload> {
  const res = await apiCall<{ data: CoAuthorsPayload }>(`${path(tokenId)}/${encodeURIComponent(address)}`, { method: 'DELETE', requiresAuth: true });
  return remember(res.data);
}
