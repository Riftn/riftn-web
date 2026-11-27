/**
 * The post a post link asked for while the app was still loading.
 *
 * index.html starts `GET /api/nft_info/<id>` during head parse on any post
 * address, so by the time the page code has arrived the answer usually has
 * too. The page takes it once, through `takePrefetchedPost`; anything that
 * does not line up (another post, another sign-in state, older than 20 s, a
 * failed request) falls through to the normal request.
 */
import type { DeHubNFT } from '@/lib/api/dehub';
import { getAuthToken } from '@/lib/api/dehub/core';
import { noteImageSizes } from '@/lib/image-size-hints';
import { noteCoAuthors } from '@/lib/co-author-store';

interface PostPrefetch {
  id: string;
  at: number;
  signedIn: boolean;
  p: Promise<unknown>;
}

const MAX_AGE_MS = 20_000;
/** A request still out after this long is given up on: the page asks again with its own timeout and relay fallback. */
const WAIT_MS = 6_000;

export async function takePrefetchedPost(tokenId: string): Promise<DeHubNFT | null> {
  const w = window as Window & { __postPrefetch?: PostPrefetch };
  const pre = w.__postPrefetch;
  if (!pre || pre.id !== tokenId) return null;
  w.__postPrefetch = undefined;
  if (Date.now() - pre.at > MAX_AGE_MS) return null;
  // Signed in or out since the request went: its viewer fields are wrong.
  if (pre.signedIn !== !!getAuthToken()) return null;
  const waitLeft = Math.max(0, WAIT_MS - (Date.now() - pre.at));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const data = await Promise.race([
    pre.p.catch(() => null),
    new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), waitLeft); }),
  ]);
  clearTimeout(timer);
  if (!data || typeof data !== 'object') return null;
  noteImageSizes(data);
  noteCoAuthors(data);
  const nft = ('result' in (data as object) ? (data as { result: unknown }).result : data) as DeHubNFT | null;
  return nft && typeof nft === 'object' && (nft as DeHubNFT).tokenId != null ? nft : null;
}
