/**
 * Who co-authored which post, as the API reported it (`coAuthorUsers`).
 *
 * Every response passes through here (see `apiCall`), the same way picture
 * shapes do, so a card header can show the names without every feed mapper
 * having to carry another prop. A post's own page also brings the viewer's
 * side of it: an invite waiting for them, or, for the creator, who has not
 * answered yet.
 */
import { useSyncExternalStore } from 'react';

export interface CoAuthorUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export interface CoAuthorState {
  users: CoAuthorUser[];
  /** Only known after the post page (or an answer) loaded it. */
  invited?: boolean;
  /** The creator's view of invites nobody has answered yet. */
  pending?: CoAuthorUser[];
}

const MAX_POSTS = 3000;
const EMPTY: CoAuthorState = { users: [] };
const posts = new Map<string, CoAuthorState>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function cleanUsers(value: unknown): CoAuthorUser[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((u): u is CoAuthorUser => !!u && typeof u === 'object' && typeof (u as CoAuthorUser).address === 'string')
    .map(u => ({ address: u.address.toLowerCase(), username: u.username, displayName: u.displayName, avatarImageUrl: u.avatarImageUrl }));
}

function same(a: CoAuthorState | undefined, b: CoAuthorState): boolean {
  return JSON.stringify(a ?? EMPTY) === JSON.stringify(b);
}

/** Replace what is known about one post. */
export function setCoAuthors(tokenId: string | number, next: CoAuthorState): void {
  const key = String(tokenId);
  const prev = posts.get(key);
  // A feed row says nothing about invites; keep what the post page told us.
  const merged: CoAuthorState = {
    users: next.users,
    invited: next.invited ?? prev?.invited,
    pending: next.pending ?? prev?.pending,
  };
  if (same(prev, merged)) return;
  if (!merged.users.length && !merged.invited && !merged.pending?.length) {
    if (!prev) return;
    posts.delete(key);
  } else {
    if (posts.size >= MAX_POSTS && !posts.has(key)) posts.delete(posts.keys().next().value!);
    posts.set(key, merged);
  }
  emit();
}

function notePost(post: Record<string, unknown>): void {
  const tokenId = post.tokenId;
  if (typeof tokenId !== 'number' && typeof tokenId !== 'string') return;
  // Only a post row (it names its creator) speaks for the post's co-authors;
  // a notification or comment carrying a tokenId does not.
  if (typeof post.minter !== 'string') return;
  const hasPostSide = 'coAuthorInvited' in post || 'pendingCoAuthorUsers' in post;
  setCoAuthors(tokenId, {
    users: cleanUsers(post.coAuthorUsers),
    ...(hasPostSide ? { invited: post.coAuthorInvited === true, pending: cleanUsers(post.pendingCoAuthorUsers) } : {}),
  });
}

function noteEach(value: unknown, depth: number): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) noteEach(entry, depth);
    return;
  }
  notePost(value as Record<string, unknown>);
  if (depth <= 0) return;
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (child && typeof child === 'object') noteEach(child, depth - 1);
  }
}

/** Remember every post's co-authors found in an API response. */
export function noteCoAuthors(response: unknown): void {
  // The feed's change probe sends trimmed rows that leave the names out.
  if ((response as { signal?: unknown } | null)?.signal === true) return;
  try { noteEach(response, 3); } catch { /* Names are optional. */ }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCoAuthors(tokenId?: string | number | null): CoAuthorState {
  if (tokenId === undefined || tokenId === null || tokenId === '') return EMPTY;
  return posts.get(String(tokenId)) ?? EMPTY;
}

export function useCoAuthors(tokenId?: string | number | null): CoAuthorState {
  return useSyncExternalStore(subscribe, () => getCoAuthors(tokenId), () => EMPTY);
}

/** The name a byline shows for one person. */
export function coAuthorName(user: CoAuthorUser): string {
  return user.displayName || user.username || `${user.address.slice(0, 6)}…${user.address.slice(-4)}`;
}

/** Ask for the co-author sheet of a post; the host mounted once in App opens it. */
let sheetTokenId: string | null = null;
const sheetListeners = new Set<() => void>();
export function openCoAuthorSheet(tokenId: string | number): void {
  sheetTokenId = String(tokenId);
  for (const l of sheetListeners) l();
}
export function closeCoAuthorSheet(): void {
  sheetTokenId = null;
  for (const l of sheetListeners) l();
}
export function useCoAuthorSheetRequest(): string | null {
  return useSyncExternalStore(
    l => { sheetListeners.add(l); return () => { sheetListeners.delete(l); }; },
    () => sheetTokenId,
    () => null,
  );
}
