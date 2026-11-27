/**
 * A post's data, asked for the moment someone taps to open it.
 *
 * The post page and the post info page only start their `nft_info` request
 * once their first render has committed. On the post page that render takes
 * most of a second on a mid-range laptop, so the request used to leave ~1 s
 * after the tap. Starting it on the tap runs the two side by side, and the
 * page joins the request already in flight.
 *
 * Each warmed request is taken once, and only while young, so a later
 * refetch (after a like, an edit, a mint) always goes to the network.
 */
import type { DeHubNFT } from '@/lib/api/dehub';
import { getNFTInfo } from '@/lib/api/dehub';
import { getAuthToken } from '@/lib/api/dehub/core';

const TTL_MS = 8_000;
const LIMIT = 20;

interface Warm {
  at: number;
  signedIn: boolean;
  p: Promise<DeHubNFT>;
}

const warm = new Map<string, Warm>();

/** Start fetching post `id` now, unless a young request for it is already out. */
export function warmPostData(id: string | number | undefined | null): void {
  if (id == null) return;
  const key = String(id);
  // Only token ids: slugs and stream ids take other routes.
  if (!/^\d+$/.test(key)) return;
  const signedIn = !!getAuthToken();
  const hit = warm.get(key);
  if (hit && hit.signedIn === signedIn && Date.now() - hit.at < TTL_MS) return;
  const p = getNFTInfo(key);
  // Nobody may ever take it; a failure here must not surface as unhandled.
  p.catch(() => {});
  warm.delete(key);
  warm.set(key, { at: Date.now(), signedIn, p });
  while (warm.size > LIMIT) warm.delete(warm.keys().next().value!);
}

/**
 * The warmed answer for `id`, or null when there is none (or it is too old,
 * was made under another sign-in state, or failed). Callers fall back to
 * their own request on null, so a head start can never make things worse.
 */
export async function takeWarmPostData(id: string): Promise<DeHubNFT | null> {
  const hit = warm.get(id);
  if (!hit) return null;
  warm.delete(id);
  if (Date.now() - hit.at >= TTL_MS) return null;
  if (hit.signedIn !== !!getAuthToken()) return null;
  const data = await hit.p.catch(() => null);
  return data && typeof data === 'object' && data.tokenId != null ? data : null;
}

/** Read post `id`, joining a request a tap already started. */
export async function loadPostData(id: string): Promise<DeHubNFT> {
  return (await takeWarmPostData(id)) ?? getNFTInfo(id);
}

/** Test seam. */
export function __resetPostWarm(): void {
  warm.clear();
}
