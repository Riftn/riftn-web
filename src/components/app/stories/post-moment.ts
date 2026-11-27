/**
 * Prepare a linked post for the Moment editor. Photos and stream covers can
 * be edited as pictures. Video Moments are cut from the original by the server.
 */
import { getNFTInfo } from '@/lib/api/dehub/feed';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { buildAvatarCdnFallbackUrl, buildAvatarUrl, buildFeedImageUrls, buildImageUrl, cdnImageSource } from '@/lib/media-url';
import { hasStreamEnded, isStreamLive } from '@/lib/live-status';

export interface PostMomentMedia {
  kind: 'photo' | 'video';
  url: string;
  blob?: Blob;
  duration?: number;
  details: PostMomentDetails;
  postTokenId: number;
}

export interface PostMomentDetails {
  authorName?: string;
  avatarUrl?: string;
  title?: string;
  description?: string;
}

function firstText(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && !!value.trim())?.trim();
}

function postDetails(post: Record<string, any>): PostMomentDetails {
  const user = post.minterUser;
  const address = firstText(post.minter, user?.address);
  const avatar = firstText(user?.avatarImageUrl, post.minterAvatarUrl);
  const stream = post.postType === 'live' ? post.stream : undefined;
  const title = firstText(stream?.title, post.title, post.name);
  const description = firstText(stream?.description, post.description);
  return {
    authorName: firstText(user?.displayName, post.minterDisplayName, post.minterUsername, user?.username, post.mintername),
    avatarUrl: address ? buildAvatarUrl(address, avatar) ?? buildAvatarCdnFallbackUrl(address, avatar) : undefined,
    title,
    description: description === title ? undefined : description,
  };
}

export async function getPostMomentDetails(tokenId: number): Promise<PostMomentDetails | null> {
  const post: Record<string, any> = await getNFTInfo(String(tokenId));
  if (!post || isGatedPost(post) || post.isHidden || post.isDeleted || post.justMe || post.mediaPrivate
    || (post.postType === 'live' && post.stream && isGatedPost(post.stream))) return null;
  return postDetails(post);
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
  const details = postDetails(post);
  if (type === 'live') {
    const stream = post.stream;
    if (post.isHidden || post.justMe || post.mediaPrivate || (stream && isGatedPost(stream))) throw new PostMomentError('gated');
    if (!isStreamLive(stream) && !hasStreamEnded(stream)) throw new PostMomentError('load');
    // A broadcast can start before its first cover is ready, and live covers
    // can be replaced between fetching the post and downloading its image.
    const cover = getMediaUrl(stream?.thumbnail || post.imageUrl);
    for (const source of [cover, '/og/live-studio.jpg']) {
      if (!source) continue;
      const res = await fetch(cdnImageSource(source), { mode: 'cors', cache: 'no-store' }).catch(() => null);
      if (!res?.ok) continue;
      const blob = await res.blob();
      if (blob.size && blob.type.startsWith('image/')) {
        return { kind: 'photo', url: URL.createObjectURL(blob), blob, postTokenId: tokenId, details };
      }
    }
    throw new PostMomentError('load');
  }
  if (VIDEO_TYPES.has(type) && post.videoUrl) {
    const url = getMediaUrl(post.videoUrl);
    if (!url) throw new PostMomentError('load');
    const duration = Number(post.videoDuration);
    return { kind: 'video', url, duration: Number.isFinite(duration) && duration > 0 ? duration : undefined, postTokenId: tokenId, details };
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
    return { kind: 'photo', url: URL.createObjectURL(blob), blob, postTokenId: tokenId, details };
  }
  throw new PostMomentError('kind');
}
