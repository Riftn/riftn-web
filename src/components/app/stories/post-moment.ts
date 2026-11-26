/**
 * Prepare a linked post for the Moment editor. Photos and stream covers can
 * be edited as pictures. Video Moments are cut from the original by the server.
 */
import { getNFTInfo } from '@/lib/api/dehub/feed';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { buildFeedImageUrls, buildImageUrl, cdnImageSource } from '@/lib/media-url';
import { hasStreamEnded, isStreamLive } from '@/lib/live-status';

export interface PostMomentMedia {
  kind: 'photo' | 'video';
  url: string;
  blob?: Blob;
  duration?: number;
  caption?: string;
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
  if (type === 'live') {
    const stream = post.stream;
    if (post.isHidden || post.justMe || post.mediaPrivate || (stream && isGatedPost(stream))) throw new PostMomentError('gated');
    if (!isStreamLive(stream) && !hasStreamEnded(stream)) throw new PostMomentError('load');
    // A broadcast can start before its first cover is ready, and live covers
    // can be replaced between fetching the post and downloading its image.
    const cover = getMediaUrl(stream?.thumbnail || post.imageUrl);
    const title = [stream?.title, post.title, post.name].find(value => typeof value === 'string' && value.trim());
    for (const source of [cover, '/og/live-studio.jpg']) {
      if (!source) continue;
      const res = await fetch(cdnImageSource(source), { mode: 'cors', cache: 'no-store' }).catch(() => null);
      if (!res?.ok) continue;
      const blob = await res.blob();
      if (blob.size && blob.type.startsWith('image/')) {
        return { kind: 'photo', url: URL.createObjectURL(blob), blob, postTokenId: tokenId, caption: title?.trim().slice(0, 300) };
      }
    }
    throw new PostMomentError('load');
  }
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
