import { isHoldGated } from '@/lib/content-gate';
import type { LiveStream } from '@/types/feed.types';
import type { DeHubNFT } from '@/lib/api/dehub/types';

export function publicChatShareTokenId(stream: LiveStream): string | undefined {
  const tokenId = stream.tokenId ?? stream.id;
  if (!/^[1-9]\d*$/.test(tokenId)) return;
  if (!stream.isLive && !stream.replayUrl) return;
  if (stream.visibility && stream.visibility !== 'public') return;
  if (stream.isPPV || isHoldGated(stream.isLocked, stream.lockedPrice) || stream.subscriberPlans?.length) return;
  return tokenId;
}

export function canDraftPublicLivePost(post: DeHubNFT & { plans?: unknown[]; plansDetails?: unknown[] }, tokenId: string): boolean {
  return String(post?.tokenId) === tokenId
    && !post.isDeleted && !post.isHidden
    && (!post.visibility || post.visibility === 'public')
    && !post.streamInfo?.isPayPerView
    && !isHoldGated(post.streamInfo?.isLockContent, post.streamInfo?.lockContentAmount)
    && !post.plans?.length && !post.plansDetails?.length;
}
