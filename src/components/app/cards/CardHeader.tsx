import { reportPostEvent } from '@/lib/api/dehub/post-stats';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import { LiveRipple } from '@/components/app/LiveRipple';
import { MomentFace } from '@/components/app/stories/MomentFace';
/**
 * Card Header Component
 * =====================
 * Universal header for all feed card types.
 * Displays avatar with gradient ring, username, verified badge, and content type label.
 * The avatar, name and @handle open the creator's profile; the blank
 * space beside them opens the post with the rest of the card.
 * Badge is fetched on-chain via useBadgeBalance hook.
 */

import { useState } from 'react';
import { AtSign, CheckCircle, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAgentAvatarFallback } from '@/constants/agent-avatars.constants';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import { seedProfileCache } from '@/lib/profile-cache-seed';
import { ProfileHoverCard } from '@/components/app/ProfileHoverCard';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

import type { ContentType } from '@/types/feed.types';
import { preloadRoute } from '@/lib/route-preload';
import type { BadgeLock } from '@/lib/staking-badges';
import type { PostVisibility } from '@/lib/api/dehub/types';
import { useCoAuthors } from '@/lib/co-author-store';
import { CoAuthorAvatarBadge, CoAuthorNames } from './CoAuthorByline';
import { profilePath } from '@/lib/profile-path';

interface CardHeaderProps {
  /** Display name or username */
  username: string;
  /** @handle for the user (optional, shown greyed next to username) */
  handle?: string;
  /** Seed for generating avatar image or actual avatar URL */
  avatarSeed: string;
  /** Whether user is verified */
  verified?: boolean;
  /** Type of content for badge display */
  contentType: ContentType;
  /** An opened post uses its avatar as a profile control. */
  postPage?: boolean;
  /** Whether this is a live stream (shows pulsing indicator) */
  isLive?: boolean;
  /** Creator's user ID for navigation */
  creatorId?: string;
  /** Creator's username for URL-based navigation */
  creatorUsername?: string;
  /** Timestamp to show next to username (e.g., "2h") */
  timestamp?: string;
  /** Who may see the post; a followers-only or direct one is marked beside the time. */
  visibility?: PostVisibility;
  /** View count to show next to timestamp. Already includes signed-out viewers. */
  viewCount?: string | number;
  /** Post token id. */
  tokenId?: string | number;
  /** Badge balance from API data (avoids edge function call) */
  badgeBalance?: number;
  /**
   * Username or wallet to resolve the badge from, for surfaces whose payload
   * carries no balance (governance proposals, feature requests).
   */
  badgeLookupId?: string | null;
  /**
   * The holder's grandfathered tier, when the payload carries one. A provided
   * `badgeBalance` skips the account lookup, so without this the badge falls
   * back to the live ladder for that balance.
   */
  badgeLock?: BadgeLock | null;
  /** Extra classes on the outer row, for lists that reuse the feed's identity line. */
  className?: string;
}

/**
 * Badge configuration for each content type
 */
const CONTENT_BADGES: Record<ContentType, { label: string; className: string }> = {
  post: { get label() { return _translateCopy("copy.a5554622c655", { defaultValue: "Post" }); }, className: 'bg-zinc-500/20 text-zinc-400' },
  video: { get label() { return _translateCopy("copy.d534be829e32", { defaultValue: "Video" }); }, className: 'bg-zinc-500/20 text-zinc-300' },
  image: { get label() { return _translateCopy("copy.1aa4cb0bcca7", { defaultValue: "Image" }); }, className: 'bg-purple-500/20 text-purple-400' },
  live: { get label() { return _translateCopy("copy.35e0d0360a0a", { defaultValue: "LIVE" }); }, className: 'bg-red-500 text-white' },
  short: { get label() { return _translateCopy("copy.f5d61ead3eef", { defaultValue: "Short" }); }, className: 'bg-pink-500/20 text-pink-400' },
};

export function CardHeader({ 
  username, 
  handle,
  avatarSeed, 
  verified = false, 
  contentType,
  postPage = false,
  isLive = false,
  creatorId,
  creatorUsername,
  timestamp,
  visibility,
  viewCount,
  tokenId,
  badgeBalance,
  badgeLookupId,
  badgeLock,
  className,
}: CardHeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { walletAddress: viewerAddress } = useAuth();
  const [imageError, setImageError] = useState(false);
  const { users: coAuthors } = useCoAuthors(tokenId);
  const badge = CONTENT_BADGES[contentType];
  const visibilityLabel =
    visibility === 'followers' ? t('postVisibility.followers') : visibility === 'direct' ? t('postVisibility.direct') : null;

  // Use feed-provided avatar directly — no extra API call needed
  const agentFallback = getAgentAvatarFallback(creatorId);
  
  
  // Only use avatarSeed as image source if it's a real URL and hasn't errored
  const hasRealAvatar = avatarSeed && avatarSeed.startsWith('http') && !imageError;
  const avatarSrc = hasRealAvatar ? avatarSeed : agentFallback;

  const handleProfileClick = (e?: { currentTarget: Element }) => {
    // A tap through to the creator from one of their posts counts in that post's stats.
    reportPostEvent(e?.currentTarget?.closest?.('[data-stats-token]')?.getAttribute('data-stats-token'), 'profile');
    // Seed profile cache with data we already have from the feed card
    const cleanUsername = creatorUsername?.replace('@', '');
    if (cleanUsername || creatorId) {
      seedProfileCache(queryClient, {
        address: creatorId,
        username: cleanUsername,
        displayName: username,
        avatarUrl: hasRealAvatar ? avatarSeed : undefined,
        badgeBalance,
      }, viewerAddress || undefined);
    }

    // Prefer username-based navigation, fallback to ID
    if (creatorUsername) {
      navigate(profilePath(cleanUsername));
    } else if (creatorId) {
      navigate(`/app/profile?id=${creatorId}`);
    }
  };

  const isClickable = !!(creatorId || creatorUsername);
  
  // Format handle to ensure it starts with @
  const formattedHandle = handle ? (handle.startsWith('@') ? handle : `@${handle}`) : null;

  // Prevent focus scroll-into-view on click (which causes the feed to jump to top)
  const handleProfileMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };
  // Profile page code starts loading as the pointer arrives or the finger
  // lands, so the click shows the page instead of waiting on a download.
  const warmProfilePage = () => preloadRoute('/app/profile');
  const face = (
    <span className="relative flex">
      <Avatar className="w-9 h-9 rounded-md">
        {avatarSrc && <AvatarImage src={avatarSrc} onError={() => setImageError(true)} className="rounded-md" />}
        <AvatarFallback className="bg-zinc-700 text-white font-medium rounded-md">{username[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <CoAuthorAvatarBadge users={coAuthors} />
    </span>
  );

  return (
    // One gap under the name row for every post type, so photos, videos,
    // lives and text all start their media at the same height.
    <div className={cn('flex items-center gap-3 pr-3 flex-1 min-w-0 pb-3', className)}>
      <ProfileHoverCard
        creatorId={creatorId}
        creatorUsername={creatorUsername}
        displayName={username}
        avatarUrl={hasRealAvatar ? avatarSeed : undefined}
        verified={verified}
        badgeBalance={badgeBalance}
      >
        <button
          type="button"
          onClick={handleProfileClick}
          onMouseDown={handleProfileMouseDown}
          onPointerEnter={warmProfilePage}
          onPointerDown={warmProfilePage}
          data-opens-page
          disabled={!isClickable}
          /* The avatar inside has no alt (it is decorative beside the name),
             so the button needs a name of its own — one per card on the feed,
             and all of them were nameless on the 2026-09-02 Lighthouse run. */
          aria-label={t('feed.viewProfile', { name: username })}
          className={`flex shrink-0 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {postPage ? face : (
            <LiveRipple ids={[creatorId, creatorUsername, handle]} orbit className="rounded-md">
              {/* The avatar ring opens Moments; co-authored posts keep their corner badge. */}
              <MomentFace address={coAuthors.length ? null : creatorId} name={username} className="rounded-md">
                {face}
              </MomentFace>
            </LiveRipple>
          )}
        </button>
      </ProfileHoverCard>
      {/* Only the name and the @handle open the profile. The blank space
          around them is not a button, so a tap there falls through to the
          card and opens the post like the rest of it. */}
      {/* Lifted so the name's top meets the avatar's top and the @handle's
          bottom meets the avatar's bottom (measured: the text ink sat ~4px
          low against the 36px avatar). */}
      <div className="flex flex-1 flex-col items-start min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 max-w-full -translate-y-1">
          <button
            type="button"
            onClick={handleProfileClick}
            onMouseDown={handleProfileMouseDown}
          onPointerEnter={warmProfilePage}
          onPointerDown={warmProfilePage}
          data-opens-page
            disabled={!isClickable}
            className={`inline-flex items-baseline gap-1 shrink min-w-0 max-w-full text-base leading-5 text-left ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span className="font-semibold text-white truncate min-w-0 leading-5">{username}</span>
            <BadgeIcon badgeBalance={badgeBalance} lookupId={badgeLookupId} username={handle || username} badgeLock={badgeLock} className="w-[1em] h-[1em]" />
            <NewMemberChip address={creatorId} className="shrink-0 ml-0.5" />
          </button>
          {verified && <CheckCircle className="w-3.5 h-3.5 text-white shrink-0 self-end" />}
          <CoAuthorNames users={coAuthors} />
        </div>
        {(formattedHandle || timestamp || visibilityLabel) && (
          <div className="flex items-center gap-1 min-w-0 max-w-full -translate-y-px">
            {formattedHandle && (
              <button
                type="button"
                onClick={handleProfileClick}
                onMouseDown={handleProfileMouseDown}
          onPointerEnter={warmProfilePage}
          onPointerDown={warmProfilePage}
          data-opens-page
                disabled={!isClickable}
                tabIndex={-1}
                className={`text-zinc-500 text-sm truncate min-w-0 leading-4 text-left ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {formattedHandle}
              </button>
            )}
            {timestamp && (
              <>
                <span className="text-zinc-600 text-[13px] leading-4">·</span>
                <span className="text-zinc-500 text-[13px] leading-4 shrink-0">{timestamp}</span>
              </>
            )}
            {visibilityLabel && (
              <>
                <span className="text-zinc-600 text-[13px] leading-4">·</span>
                <span className="flex items-center gap-0.5 text-zinc-500 text-[13px] leading-4 shrink-0" title={visibilityLabel}>
                  {visibility === 'direct' ? <AtSign className="w-3 h-3" aria-hidden /> : <Lock className="w-3 h-3" aria-hidden />}
                  {visibilityLabel}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
