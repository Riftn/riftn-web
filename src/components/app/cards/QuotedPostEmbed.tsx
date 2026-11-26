import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Quoted Post Embed Component
 * ============================
 * Twitter/X-style embedded quoted post preview.
 * Shows inside a bordered card with author info, content preview, and optional media thumbnail.
 */

import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { revokeQuote } from '@/lib/api/dehub';
import { usePoll } from '@/hooks/use-polls';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { useShortsEnabled } from '@/contexts/ShortsEnabledContext';
import { openBrainrotFeed } from '@/lib/brainrot-feed';
import { quotedPostShort } from '@/lib/quoted-post-short';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle, Ticket, BarChart2 } from "lucide-react";
import Images from "@/components/ui/cut-icons/images";
import Lock from "@/components/ui/cut-icons/privacy";

import Play from "@/components/ui/cut-icons/play";

import { getMediaUrl } from '@/lib/api/dehub/core';
import { DEHUB_CDN_BASE } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath, buildFeedImageUrls, buildImageUrl, cdnImage, cdnImageSource, cdnImageSrcSet } from '@/lib/media-url';
import { hintedImageRatio } from '@/lib/image-size-hints';
import { isHoldGated, isSubscriberGated } from '@/lib/content-gate';
import { isTokenUnlocked } from '@/lib/unlocked-tokens-store';
import { BadgedName } from '@/components/app/BadgedName';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import type { DeHubNFT } from '@/lib/api/dehub/types';

import { formatCount } from '@/lib/format-count';
import { warmPostData } from '@/lib/post-warm';
/**
 * What a post's media looks like in an embed: which kind it is, the one
 * thumbnail to show, and whether it has to stay behind a gate. Shared with the
 * profile replies thread, which shows the post a comment sits under.
 */
export function resolveQuotedPostMedia(post: DeHubNFT) {
  // Converter imports use feed-video, and some older posts only carry a video
  // URL. Treat them like the feed does so a shared import has a playable card.
  // The API sends feed-video/feed-audio even though the shared NFT type still
  // lists only the original post types.
  const postType = post.postType as string;
  const isAudio = postType === 'audio' || postType === 'feed-audio';
  const hasVideo = !isAudio && (
    postType === 'video' ||
    postType === 'feed-video' ||
    post.media_type === 'video' ||
    !!post.videoUrl
  );

  // For images: resolve feed-image URLs properly via buildFeedImageUrls
  const resolvedImageUrls = buildFeedImageUrls(post.imageUrls, undefined, (post as { imageSizes?: unknown }).imageSizes);
  const firstImageUrl = (post.articleImageUrl ? buildFeedImageUrls([post.articleImageUrl])?.[0] : undefined) || resolvedImageUrls?.[0] || (post.imageUrl ? buildImageUrl(post.tokenId, post.imageUrl) : undefined);
  const hasImage = !hasVideo && (post.postType === 'image' || !!firstImageUrl);
  const thumbnailUrl = hasVideo
    ? (getMediaUrl(post.thumbnail_url) || buildImageUrl(post.tokenId, post.imageUrl))
    : firstImageUrl;
  // A live's cover is read from images/{tokenId} above. A live set up without
  // one has only the stream's own frame (live/thumbnails/…), so that is the
  // fallback when the cover does not load.
  const isLive = postType === 'live';
  const streamFrame = isLive ? (post.stream as { thumbnail?: string } | undefined)?.thumbnail : undefined;
  const fallbackUrl = streamFrame ? (streamFrame.startsWith('http') ? streamFrame : `${DEHUB_CDN_BASE}${streamFrame.replace(/^\/+/, '')}`) : undefined;

  // Gated content must stay gated in embeds (quotes, DM shares) — otherwise a
  // locked PPV post shared into a DM leaks its media as a free preview. Same
  // bypass rules as the feed cards: owners and unlockers see it clear.
  const isPPV = !!(post.is_ppv || post.streamInfo?.isPayPerView);
  const isHoldLocked = isHoldGated(
    post.is_locked || post.streamInfo?.isLockContent,
    post.locked_price ?? post.streamInfo?.lockContentAmount,
  );
  const canBypassGating = !!(post.isOwner || post.isUnlocked) || isTokenUnlocked(String(post.tokenId));
  // A subscriber-gated post must stay gated in an embed too, or quoting one
  // is a way to republish it in the clear.
  const isSubGated = isSubscriberGated(
    (post as any).plansDetails,
    canBypassGating,
  );
  const gated = ((isPPV || isHoldLocked) && !canBypassGating) || isSubGated;

  return { hasVideo, hasImage, thumbnailUrl, fallbackUrl, isLive, imageCount: resolvedImageUrls?.length ?? 0, gated, isPPV };
}

/** The media block of an embedded post — thumbnail, play glyph, image count, gate. */
export function QuotedPostMedia({ post, className, prominent = false }: { post: DeHubNFT; className?: string; prominent?: boolean }) {
  const { t: _copy } = _useCopy();
  const { hasVideo, hasImage, thumbnailUrl: firstUrl, fallbackUrl, isLive, imageCount, gated, isPPV } = resolveQuotedPostMedia(post);
  const [failed, setFailed] = useState<string[]>([]);
  const [loadedPhoto, setLoadedPhoto] = useState<{ url: string; ratio: number }>();
  const showPhoto = prominent && hasImage && !hasVideo && !isLive && !gated;
  const preferredUrl = showPhoto ? cdnImage(firstUrl, { width: 1080, quality: 88 }) : firstUrl;
  const thumbnailUrl = [preferredUrl, showPhoto ? cdnImageSource(firstUrl) : undefined, fallbackUrl]
    .find((url): url is string => !!url && !failed.includes(url));
  // Only draw the media box when there is something to put in it. Text and
  // poll posts can still come back typed as "image" with no image URL, which
  // used to leave an empty grey block above the quoted text. A live whose
  // pictures all failed is dropped the same way.
  if (!thumbnailUrl && !hasVideo) return null;
  const showPlay = hasVideo || isLive;
  const photoRatio = showPhoto && thumbnailUrl
    ? hintedImageRatio(thumbnailUrl) ?? (loadedPhoto?.url === thumbnailUrl ? loadedPhoto.ratio : 1)
    : undefined;
  const srcSet = showPhoto && thumbnailUrl === preferredUrl ? cdnImageSrcSet(thumbnailUrl, [640, 1080, 1440]) : undefined;
  return (
    <div
      className={`relative w-full overflow-hidden ${showPhoto ? 'max-h-[420px] bg-black/5 dark:bg-white/5' : 'aspect-video max-h-[200px] bg-zinc-900 sm:max-h-[240px]'} ${className || ''}`}
      style={{ aspectRatio: photoRatio }}
    >
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          srcSet={srcSet}
          sizes={srcSet ? 'auto, (max-width: 640px) 100vw, 600px' : undefined}
          alt=""
          className={`w-full h-full ${showPhoto ? 'absolute inset-0 object-contain' : 'object-cover rounded-lg'} ${gated ? 'blur-2xl scale-110 select-none pointer-events-none' : ''}`}
          loading="lazy"
          onLoad={showPhoto && !hintedImageRatio(thumbnailUrl) ? (event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) setLoadedPhoto({ url: thumbnailUrl, ratio: naturalWidth / naturalHeight });
          } : undefined}
          onError={() => setFailed((list) => (list.includes(thumbnailUrl) ? list : [...list, thumbnailUrl]))}
        />
      )}
      {gated && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
          <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-[24px] backdrop-saturate-[180%] flex items-center justify-center border border-white/10 mb-1.5">
            {isPPV ? <Ticket className="w-5 h-5 text-white" /> : <Lock className="w-5 h-5 text-white" />}
          </div>
          <p className="text-white font-semibold text-xs">
            {isPPV ? _copy("copy.48e072480fc5", { defaultValue: "Pay-Per-View Content" }) : _copy("copy.e8315b2fde86", { defaultValue: "Locked Content" })}
          </p>
        </div>
      )}
      {!gated && showPlay && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
      {!gated && hasImage && imageCount > 1 && (
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1">
          <Images className="w-3.5 h-3.5 text-white" />
          <span className="text-xs text-white font-medium">{formatCount(imageCount)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Read-only poll preview for a quoted post. Tapping the embed opens the post,
 * where the full poll can be voted on.
 */
function QuotedPollPreview({ tokenId }: { tokenId: number }) {
  const { t: _copy } = _useCopy();
  const { data: poll } = usePoll(tokenId, !!tokenId);
  if (!poll || !poll.options?.length) return null;

  const isEnded = !poll.isActive || !!poll.isExpired
    || (!!poll.expiresAt && new Date(poll.expiresAt).getTime() <= Date.now());
  const showResults = isEnded || !!poll.userVote;
  const total = poll.totalVotes || 0;

  return (
    <div className="mt-2 space-y-1.5">
      {poll.question && poll.question.trim() !== '' && (
        <p className="text-[14px] leading-5 font-medium text-white">{poll.question}</p>
      )}
      {poll.options.map((opt) => {
        const pct = total > 0 ? Math.round((opt.voteCount / total) * 100) : 0;
        return (
          <div key={opt.index} className="relative overflow-hidden rounded-lg border border-white/10 px-3 py-1.5">
            {showResults && (
              <div className="absolute inset-y-0 left-0 bg-white/10" style={{ width: `${pct}%` }} />
            )}
            <div className="relative flex items-center justify-between gap-2 text-[13px] text-zinc-200">
              <span className="truncate">{opt.text}</span>
              {showResults && <span className="shrink-0 text-zinc-400">{pct}%</span>}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-1 text-[12px] text-zinc-500">
        <BarChart2 className="w-3.5 h-3.5" />
        <span>{_copy("copy.8ce57030b104", { defaultValue: "{{count}} votes", count: total })}{isEnded ? _copy("copy.c7383371a694", { defaultValue: " · Final results" }) : ''}</span>
      </div>
    </div>
  );
}

interface QuotedPostEmbedProps {
  quotedPost: DeHubNFT;
  className?: string;
  /**
   * The quote this embed sits in. Given, the quoted post's author sees a
   * Remove action that takes their post back out of the quote.
   */
  quoteTokenId?: string | number;
}

/** What a quote shows once the quoted author has taken their post back out of it. */
export function RemovedQuoteNotice({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div data-glass-embed className={`rounded-2xl border border-zinc-700/60 px-3 py-3 text-sm text-zinc-400 ${className || ''}`}>
      {t('quotePolicy.removed')}
    </div>
  );
}

export const QuotedPostEmbed = memo(function QuotedPostEmbed({ quotedPost, className, quoteTokenId }: QuotedPostEmbedProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { shortsEnabled } = useShortsEnabled();
  const { walletAddress } = useAuth();
  const [removed, setRemoved] = useState(false);
  const [removing, setRemoving] = useState(false);
  const isQuotedAuthor =
    !!walletAddress && !!quoteTokenId &&
    (quotedPost.minter || quotedPost.minterUser?.address || '').toLowerCase() === walletAddress.toLowerCase();

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!quoteTokenId || removing) return;
    setRemoving(true);
    try {
      await revokeQuote(quoteTokenId);
      setRemoved(true);
      toast.success(t('quotePolicy.removedToast'));
    } catch {
      toast.error(t('quotePolicy.removeFailed'));
    } finally {
      setRemoving(false);
    }
  };

  if (removed) return <RemovedQuoteNotice className={className} />;

  // Avatars must go through buildAvatarUrl, not getMediaUrl. getMediaUrl just
  // prefixes the CDN base, which is wrong for the older upload format: the API
  // still returns paths like "statics/avatars/0x….octet-stream", and
  // CDN_BASE + "statics/avatars/…" 403s — the statics/ segment has to be
  // stripped. Radix then fails to load the image and renders AvatarFallback, so
  // the quoted author silently showed as a grey initial. buildAvatarUrl also
  // adds the per-address cache-bust, so an avatar change shows up here too.
  const avatarPath =
    extractAvatarPath(quotedPost) ||
    extractAvatarPath(quotedPost.minterUser) ||
    extractAvatarPath(quotedPost.creator);
  const avatarAddress = quotedPost.minter || quotedPost.minterUser?.address || '';
  const resolvedAvatar = buildAvatarUrl(avatarAddress, avatarPath);

  // The API's inline `quotedPost` object only carries `minterUser {…}` — the
  // flat `minter*` fields it has on top-level feed posts are absent here, so
  // reading only those (as this used to) rendered "Unknown" / a raw address
  // for every quote, same class of bug the avatar fix above already covers.
  const displayName =
    quotedPost.minterUser?.displayName ||
    quotedPost.minterUser?.username ||
    quotedPost.minterDisplayName ||
    quotedPost.minterUsername ||
    quotedPost.mintername ||
    _copy("copy.b764cdc0eab7", { defaultValue: "Unknown" });
  const handle =
    quotedPost.minterUser?.username ||
    quotedPost.minterUsername ||
    quotedPost.mintername ||
    quotedPost.minter?.slice(0, 8);
  const content = quotedPost.description || quotedPost.name || '';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const short = isMobile && shortsEnabled ? quotedPostShort(quotedPost) : null;
    if (short) {
      openBrainrotFeed(String(quotedPost.tokenId), short);
      return;
    }
    warmPostData(quotedPost.tokenId);
    navigate(`/app/post/${quotedPost.tokenId}`, { state: { fromFeed: true } });
  };

  return (
    <div
      onClick={handleClick}
      data-glass-embed
      className={`border border-foreground/20 rounded-2xl overflow-hidden cursor-pointer bg-foreground/[0.04] hover:bg-foreground/[0.07] transition-colors ${className || ''}`}
    >
      {/* Content area */}
      <div className="p-3 sm:p-4">
        {/* Author row */}
        <div className="flex items-center gap-2 mb-2 min-w-0">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarImage src={resolvedAvatar || undefined} />
            <AvatarFallback className="text-xs bg-zinc-700 text-zinc-300">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <BadgedName
            badgeBalance={quotedPost.minterUser?.hideBadgeAndBalance ? 0 : quotedPost.minterUser?.badgeBalance}
            username={handle}
            className="text-[15px] leading-5 font-semibold text-white"
          >
            {displayName}
          </BadgedName>
          <NewMemberChip address={avatarAddress || undefined} />
          <CheckCircle className="w-3.5 h-3.5 text-white shrink-0 hidden" />
          {handle && <span className="text-[13px] leading-5 text-muted-foreground truncate">@{handle}</span>}
          {isQuotedAuthor && (
            <button
              type="button"
              data-no-navigate
              onClick={handleRemove}
              disabled={removing}
              className="ml-auto shrink-0 rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-zinc-300 hover:bg-white/10 disabled:opacity-50"
            >
              {t('quotePolicy.remove')}
            </button>
          )}
        </div>

        {/* Text content */}
        {quotedPost.articleBody && <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/60">{_copy("copy.29d94922512b", { defaultValue: "Article" })}</span>}
        {quotedPost.articleBody && quotedPost.name?.trim() && <h3 className="text-lg font-semibold text-white">{quotedPost.name}</h3>}
        {content && (
          <p className="text-base leading-6 text-foreground whitespace-pre-wrap break-words">{content}</p>
        )}

        {/* Poll attached to the quoted post */}
        <QuotedPollPreview tokenId={Number(quotedPost.tokenId) || 0} />
      </div>
      <QuotedPostMedia post={quotedPost} prominent />
    </div>
  );
});
