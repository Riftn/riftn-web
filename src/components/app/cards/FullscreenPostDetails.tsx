/**
 * Who posted the photo and what they wrote, over the bottom of the fullscreen
 * viewer on phones and tablets (Requests babaeb88): avatar, name, @handle and
 * Follow, then the caption. The action bar sits under it. Desktop keeps its
 * own layout, so this is hidden from `lg` up.
 *
 * Follow state is the creator's profile plus the shared optimistic override,
 * the same pair StageCreatorRow uses, so every Follow button agrees.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { toggleFollowFor, useFollowOverrides } from '@/hooks/use-follow';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';

export interface FullscreenPostAuthor {
  name: string;
  avatar?: string;
  handle?: string;
  creatorId?: string;
  verified?: boolean;
  caption?: string;
}

export function FullscreenPostDetails({ author, onLeave }: { author: FullscreenPostAuthor; onLeave: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();
  const [avatarError, setAvatarError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { name, avatar, creatorId, verified } = author;
  const handle = author.handle?.replace('@', '');
  const caption = author.caption?.trim();

  const { data: profile, isLoading: profileLoading } = useDeHubProfile({
    userId: creatorId || undefined,
    address: walletAddress || undefined,
    enabled: !!creatorId,
  });
  const overrides = useFollowOverrides();
  const isFollowing = creatorId
    ? (overrides.get(creatorId.toLowerCase()) ?? profile?.isFollowing === true)
    : false;
  // Only a Follow button: accounts you already follow get none. Once Follow is
  // tapped here it stays as "Following" so a mis-tap can be undone.
  const tappedFollow = useRef(false);
  const followKnown = !!creatorId && (overrides.has(creatorId.toLowerCase()) || !profileLoading);
  const showFollow = followKnown && (!isFollowing || tappedFollow.current);
  const isSelf = !!(walletAddress && creatorId && walletAddress.toLowerCase() === creatorId.toLowerCase());

  const openProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!handle && !creatorId) return;
    onLeave();
    if (handle) navigate(`/${handle}`);
    else navigate(`/app/profile?id=${creatorId}`);
  };

  const onFollow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!creatorId) return;
    if (!walletAddress) {
      openLoginModal();
      return;
    }
    tappedFollow.current = true;
    void toggleFollowFor(queryClient, creatorId, isFollowing, { name });
  };

  return (
    <div data-fullscreen-post-details className="px-3 pb-1 lg:hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={openProfile}
          className="flex min-w-0 shrink items-center gap-2.5 text-left"
        >
          {avatar && avatar.startsWith('http') && !avatarError ? (
            <img
              src={avatar}
              alt={name}
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white">
              {(name || '?').charAt(0).toUpperCase()}
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[15px] font-bold leading-tight text-white">{name}</span>
              {verified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0 self-center" />}
            </span>
            {handle ? <span className="truncate text-[13px] leading-tight text-white/65">@{handle}</span> : null}
          </span>
        </button>
        {!isSelf && creatorId && showFollow && (
          <button
            type="button"
            onClick={onFollow}
            data-fullscreen-follow={isFollowing ? 'following' : 'follow'}
            className={
              isFollowing
                ? 'h-[30px] shrink-0 rounded-full border border-white/30 bg-white/10 px-3.5 text-sm font-semibold text-white'
                : 'h-[30px] shrink-0 rounded-full bg-white px-3.5 text-sm font-semibold text-black'
            }
          >
            {isFollowing ? t('follow.following') : t('follow.follow')}
          </button>
        )}
      </div>
      {caption ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-3 block w-full text-left"
        >
          <span
            className={`whitespace-pre-line break-words text-[15px] leading-[21px] text-white ${expanded ? 'line-clamp-[12]' : 'line-clamp-2'}`}
          >
            {caption}
          </span>
        </button>
      ) : null}
      <div className="mt-3 h-px bg-white/15" />
    </div>
  );
}
