import { hasStreamEnded, isStreamLive } from '@/lib/live-status';

/**
 * Whether a post can be shared to a Moment from its menu: public, free to see.
 * The server makes the final call; this only hides the row where it would fail.
 */
export function canShareToMoment(post: {
  isPPV?: boolean | null;
  isLocked?: boolean | null;
  isW2E?: boolean | null;
  subscriberPlans?: unknown[] | null;
  visibility?: string | null;
}): boolean {
  return !post.isPPV && !post.isLocked && !post.isW2E
    && !(Array.isArray(post.subscriberPlans) && post.subscriberPlans.length > 0)
    && (!post.visibility || post.visibility === 'public');
}

export function getStreamMomentTokenId(stream: Parameters<typeof canShareToMoment>[0] & {
  id: string;
  tokenId?: string;
  isLive: boolean;
  liveStatus?: string;
}): number | undefined {
  const tokenId = stream.tokenId ?? stream.id;
  if (!/^\d+$/.test(tokenId) || !Number.isSafeInteger(Number(tokenId)) || !canShareToMoment(stream)) return;
  const state = { status: stream.liveStatus };
  if (isStreamLive(state, stream.isLive) || hasStreamEnded(state)) return Number(tokenId);
}
