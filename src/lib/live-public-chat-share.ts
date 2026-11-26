import { isHoldGated } from '@/lib/content-gate';
import type { LiveStream } from '@/types/feed.types';

export function publicChatShareTokenId(stream: LiveStream): string | undefined {
  const tokenId = stream.tokenId ?? stream.id;
  if (!/^[1-9]\d*$/.test(tokenId)) return;
  if (!stream.isLive && !stream.replayUrl) return;
  if (stream.visibility && stream.visibility !== 'public') return;
  if (stream.isPPV || isHoldGated(stream.isLocked, stream.lockedPrice) || stream.subscriberPlans?.length) return;
  return tokenId;
}
