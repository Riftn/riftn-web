/**
 * "Share to Moment": turn one of your own posts into what the moment editor
 * starts from. Photos come in as a picture (so text and stickers can be drawn
 * on it); videos stay on the CDN and the server cuts the moment from the post.
 */
import { getNFTInfo } from '@/lib/api/dehub/feed';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { buildFeedImageUrls, buildImageUrl, cdnImageSource } from '@/lib/media-url';

export interface PostMomentMedia {
  kind: 'photo' | 'video';
  url: string;
  blob?: Blob;
  duration?: number;
  postTokenId: number;
}

export class PostMomentError extends Error {
  constructor(public reason: 'gated' | 'kind' | 'load') {
    super(reason);
  }
}

const PHOTO_TYPES = new Set(['feed-images', 'image']);
const VIDEO_TYPES = new Set(['video', 'short']);

/** Paid, held, subscriber-only and followers-only posts can't go on a public moment. */
export function isGatedPost(post: { streamInfo?: Record<string, unknown> | null; plans?: unknown; visibility?: string | null }): boolean {
  const info = (post.streamInfo || {}) as Record<string, unknown>;
  const amount = Number(info.lockAmount ?? info.lockContentAmount);
  return !!info.isPayPerView
    || (!!info.isLockContent && Number.isFinite(amount) && amount > 0)
    || (Array.isArray(post.plans) && post.plans.length > 0)
    || (!!post.visibility && post.visibility !== 'public');
}

export async function loadPostMoment(tokenId: number): Promise<PostMomentMedia> {
  const post = await getNFTInfo(String(tokenId)).catch(() => null) as (Record<string, any> | null);
  if (!post) throw new PostMomentError('load');
  if (isGatedPost(post)) throw new PostMomentError('gated');
  const type = String(post.postType || '');
  if (VIDEO_TYPES.has(type) && post.videoUrl) {
    const url = getMediaUrl(post.videoUrl);
    if (!url) throw new PostMomentError('load');
    const duration = Number(post.videoDuration);
    return { kind: 'video', url, duration: Number.isFinite(duration) && duration > 0 ? duration : undefined, postTokenId: tokenId };
  }
  // Photo posts' files live under feed-images/{filename}; the API's nfts/images/... path 403s.
  const listed = Array.isArray(post.imageUrls) && post.imageUrls[0] ? buildFeedImageUrls([post.imageUrls[0]])?.[0] : undefined;
  const image = listed || (PHOTO_TYPES.has(type) && post.imageUrl ? buildImageUrl(tokenId, post.imageUrl) : undefined);
  if (PHOTO_TYPES.has(type) && image) {
    const src = cdnImageSource(image);
    if (!src) throw new PostMomentError('load');
    // no-store: a copy cached by a plain <img> carries no CORS header and would fail here.
    const res = await fetch(src, { mode: 'cors', cache: 'no-store' }).catch(() => null);
    if (!res?.ok) throw new PostMomentError('load');
    const blob = await res.blob();
    return { kind: 'photo', url: URL.createObjectURL(blob), blob, postTokenId: tokenId };
  }
  throw new PostMomentError('kind');
}
