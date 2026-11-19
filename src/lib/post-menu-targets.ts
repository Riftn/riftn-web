/**
 * The right-click menu's view of each feed shape (lib/post-menu), for
 * surfaces that draw a post as a tile rather than a card.
 */
import type { ImagePost, ShortVideo, TextPost, VideoItem } from '@/types/feed.types';
import type { PostMenuTarget } from './post-menu';

const signedSlug = (p: { status?: string; newPostId?: number }) => (p.status === 'signed' ? p.newPostId ?? null : null);

export function textPostMenuTarget(post: TextPost): PostMenuTarget {
  return {
    id: post.id,
    newPostId: signedSlug(post),
    articleSlug: post.articleSlug,
    authorId: post.author?.id,
    authorName: post.author?.name,
    authorHandle: post.author?.handle,
    text: post.content,
    title: post.rawName ?? post.title ?? post.content,
    isOwn: !!post.isOwner,
    visibility: post.visibility,
    quotePolicy: post.quotePolicy,
    myReaction: post.myReaction,
    isReposted: post.isReposted,
    noTip: !!post.author?.paymentsDisabled,
  };
}

export function imagePostMenuTarget(post: ImagePost): PostMenuTarget {
  return {
    id: post.id,
    newPostId: signedSlug(post),
    articleSlug: post.articleSlug,
    authorId: post.creatorId,
    authorName: post.username,
    authorHandle: post.creatorUsername,
    text: [post.title, post.description || post.caption].filter(Boolean).join('\n\n'),
    title: post.title ?? post.caption,
    isOwn: !!post.isOwner,
    visibility: post.visibility,
    quotePolicy: post.quotePolicy,
    myReaction: post.myReaction,
    isReposted: post.isReposted,
    noTip: !!post.creatorPaymentsDisabled,
  };
}

export function videoMenuTarget(video: VideoItem): PostMenuTarget {
  return {
    id: video.id,
    newPostId: signedSlug(video),
    articleSlug: video.articleSlug,
    authorId: video.creatorId,
    authorName: video.channel,
    authorHandle: video.creatorUsername,
    text: [video.title, video.description].filter(Boolean).join('\n\n'),
    title: video.title ?? video.description,
    isOwn: !!video.isOwner,
    visibility: video.visibility,
    quotePolicy: video.quotePolicy,
    myReaction: video.myReaction,
    isReposted: video.isReposted,
    noTip: !!video.creatorPaymentsDisabled,
  };
}

export function shortMenuTarget(short: ShortVideo): PostMenuTarget {
  const s = short as ShortVideo & { isOwner?: boolean; isReposted?: boolean; visibility?: PostMenuTarget['visibility']; quotePolicy?: PostMenuTarget['quotePolicy']; creatorPaymentsDisabled?: boolean };
  return {
    id: short.id,
    articleSlug: short.articleSlug,
    authorId: short.creatorId,
    authorName: short.username,
    authorHandle: short.creatorUsername,
    text: [short.title, short.description].filter(Boolean).join('\n\n'),
    title: short.title ?? short.description,
    isOwn: !!s.isOwner,
    visibility: s.visibility,
    quotePolicy: s.quotePolicy,
    myReaction: short.myReaction,
    isReposted: s.isReposted,
    noTip: !!s.creatorPaymentsDisabled,
  };
}
