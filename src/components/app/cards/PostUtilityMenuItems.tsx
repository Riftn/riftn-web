/**
 * Post Utility Menu Items
 * =======================
 * AI overview, bookmark, pin (own posts), refresh link preview (posts with an
 * outside link card) and post info as three-dot-menu rows.
 * AI overview has no action-bar twin: the menu is its only home.
 *
 * The same three actions render as icon buttons in the card's action bar via
 * `PostUtilityButtons`. That cluster is desktop-only, and these rows used to be
 * `lg:hidden` in every card's options drawer, so each action existed at exactly
 * one breakpoint and neither surface was ever the reliable place to look for
 * it. Both are shown at every breakpoint now, and this component is what stops
 * the six copies of the drawer rows drifting apart.
 *
 * State comes from the shared hooks (`useBookmarkPost`, `usePinnedPostIds`),
 * so a row and the icon button for the same post always agree.
 */

import { Pin } from "lucide-react";
import Info from "@/components/ui/cut-icons/information";
import AssistantNavIcon from "@/components/ui/AssistantNavIcon";

import Bookmark from "@/components/ui/cut-icons/save";
import Refresh from "@/components/ui/cut-icons/refresh";
import AddAccount from "@/components/ui/cut-icons/add-account";

import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openPostInfo } from '@/lib/preload-post-page';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { useTogglePin, useIsPostPinned } from '@/hooks/use-pins';
import { previewedLinkUrl, refreshLinkPreview } from '@/lib/api/link-preview';
import { AuthContext } from '@/contexts/AuthContext';
import { openCoAuthorSheet, useCoAuthors } from '@/lib/co-author-store';
import { useStoriesStore } from '@/store/storiesStore';
import { MomentAdd } from '@/components/app/stories/moment-icons';

interface PostUtilityMenuItemsProps {
  postId?: string;
  tokenId?: number;
  /** Show the pin row (own posts only). */
  isOwnPost?: boolean;
  /**
   * Fired before navigating away to the post info page. Hosts that sit in
   * their own layer — the shorts viewer, the feed's post overlay — use it to
   * close themselves so the info page is not left underneath one.
   */
  onBeforeNavigate?: () => void;
  /** Opens the post's AI chat. The host closes its menu and gates sign-in. */
  onAskAI?: () => void;
  /**
   * The post's text. When it carries an outside link card, a row re-crawls the
   * link so a site's new share image, title and description show up.
   */
  linkText?: string | null;
  /** Closes the host's menu, so the refreshed card is visible underneath. */
  onClose?: () => void;
  /** The host card shows the post's action bar (bookmark, info) under the post. */
  onActionBar?: boolean;
  /**
   * Your own public photo or video post: a "Share to Moment" row opens the
   * Moment editor with it. Leave out for paid, held or followers-only posts.
   */
  canShareToMoment?: boolean;
}

const ROW =
  'flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors text-left';

export function PostUtilityMenuItems({
  postId,
  tokenId,
  isOwnPost = false,
  onBeforeNavigate,
  onAskAI,
  linkText,
  onClose,
  onActionBar = false,
  canShareToMoment = false,
}: PostUtilityMenuItemsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  // On a phone the card's action bar already carries Bookmark and Post info
  // right under the post, so the menu leaves them out (Requests 7399dd7d).
  const skipBarItems = useIsMobile() && onActionBar;
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(postId || '');
  const togglePinMutation = useTogglePin();
  const isPinned = useIsPostPinned(tokenId);
  const linkUrl = previewedLinkUrl(linkText);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const walletAddress = useContext(AuthContext)?.walletAddress;
  const coAuthors = useCoAuthors(tokenId);
  const me = walletAddress?.toLowerCase();
  const isCoAuthor = !!me && coAuthors.users.some(u => u.address === me);
  // The creator invites and manages; a co-author or an invited person answers
  // or steps off. Everyone else has nothing to do here.
  const showCoAuthors = !!tokenId && (isOwnPost || isCoAuthor || !!coAuthors.invited);

  const refreshLink = async () => {
    if (!linkUrl || isRefreshing) return;
    setIsRefreshing(true);
    onClose?.();
    const ok = await refreshLinkPreview(linkUrl);
    setIsRefreshing(false);
    if (ok) toast.success(t('postOptions.linkPreviewRefreshed', 'Link preview refreshed'));
    else toast.error(t('postOptions.linkPreviewRefreshFailed', "Couldn't reach that site. Try again later."));
  };

  return (
    <>
      {onAskAI && (
        <button onClick={onAskAI} className={cn(ROW, 'text-white')}>
          <AssistantNavIcon className="w-5 h-5" /> {t('postOptions.aiOverview', 'AI overview')}
        </button>
      )}

      {!skipBarItems && <button
        onClick={() => toggleBookmark()}
        disabled={isBookmarkLoading}
        className={cn(ROW, 'disabled:opacity-50', isBookmarked ? 'text-yellow-500' : 'text-white')}
      >
        <Bookmark className={cn('w-5 h-5', isBookmarked && 'fill-current')} />
        {isBookmarked
          ? t('postOptions.removeBookmark', 'Remove bookmark')
          : t('postOptions.bookmark', 'Bookmark')}
      </button>}

      {isOwnPost && (
        <button
          onClick={() => {
            if (!tokenId || togglePinMutation.isPending) return;
            togglePinMutation.mutate(tokenId);
          }}
          disabled={!tokenId || togglePinMutation.isPending}
          className={cn(ROW, 'disabled:opacity-40', isPinned ? 'text-blue-400' : 'text-white')}
        >
          <Pin className={cn('w-5 h-5', isPinned && 'fill-current')} />
          {isPinned ? t('postOptions.unpinPost', 'Unpin from your profile') : t('postOptions.pinPost', 'Pin to your profile')}
        </button>
      )}

      {/* Any public post can go on a Moment; the server refuses private accounts' posts. */}
      {canShareToMoment && !!tokenId && (
        <button
          onClick={() => {
            onClose?.();
            onBeforeNavigate?.();
            useStoriesStore.getState().openPostMoment(tokenId);
          }}
          className={cn(ROW, 'text-white')}
          data-share-to-moment
        >
          <MomentAdd className="w-5 h-5" />
          {t('stories.shareToMoment', 'Share to Moment')}
        </button>
      )}

      {showCoAuthors && (
        <button
          onClick={() => { onClose?.(); openCoAuthorSheet(tokenId!); }}
          className={cn(ROW, 'text-white')}
          data-co-author-row
        >
          <AddAccount className="w-5 h-5" />
          {isOwnPost
            ? (coAuthors.users.length ? t('coAuthors.manage', 'Co-authors') : t('coAuthors.invite', 'Invite a co-author'))
            : coAuthors.invited
              ? t('coAuthors.answerInvite', 'Co-author invite')
              : t('coAuthors.manage', 'Co-authors')}
        </button>
      )}

      {linkUrl && (
        <button onClick={refreshLink} disabled={isRefreshing} className={cn(ROW, 'text-white disabled:opacity-50')}>
          <Refresh className={cn('w-5 h-5', isRefreshing && 'animate-spin')} />
          {t('postOptions.refreshLinkPreview', 'Refresh link preview')}
        </button>
      )}

      {!skipBarItems && <button
        onClick={() => {
          onBeforeNavigate?.();
          if (postId) openPostInfo(navigate, postId);
        }}
        className={cn(ROW, 'text-white')}
      >
        <Info className="w-5 h-5" /> {t('postInfo.title', 'Post info')}
      </button>}
    </>
  );
}
