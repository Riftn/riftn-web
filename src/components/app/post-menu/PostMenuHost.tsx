/**
 * PostMenuHost
 * ============
 * The one right-click menu for posts (see lib/post-menu). Mounted once, after
 * the first right-click, and kept: it also owns the sheets a grid tile has no
 * card to open (send in a message, quote, tip, report, SuperPowers).
 *
 * The menu is the chat MessageMenu: the same glass card at the pointer, the
 * same reactions capsule on top (all ten post reactions), arrow keys, Esc.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Palette, Pin, Share, Type, UserCheck } from 'lucide-react';
import { MessageMenu, type MessageMenuAction } from '@/components/app/chat/MessageMenu';
import Flag from '@/components/ui/cut-icons/report';
import Ban from '@/components/ui/cut-icons/blocked';
import VolumeX from '@/components/ui/cut-icons/mute';
import UserPlus from '@/components/ui/cut-icons/add-account';
import Link2 from '@/components/ui/cut-icons/link';
import MessageSquare from '@/components/ui/cut-icons/messages';
import Repeat2 from '@/components/ui/cut-icons/repost';
import Quote from '@/components/ui/cut-icons/quote';
import Send from '@/components/ui/cut-icons/send';
import Bookmark from '@/components/ui/cut-icons/save';
import Info from '@/components/ui/cut-icons/information';
import Gift from '@/components/ui/cut-icons/gifts';
import Diamond from '@/components/ui/cut-icons/diamond';
import Pencil from '@/components/ui/cut-icons/edit';
import Trash2 from '@/components/ui/cut-icons/delete';
import Stats from '@/components/ui/cut-icons/stats';
import Superpowers from '@/components/ui/cut-icons/superpowers';
import AssistantNavIcon from '@/components/ui/AssistantNavIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { useTogglePin, useIsPostPinned } from '@/hooks/use-pins';
import { useFollow } from '@/hooks/use-follow';
import { useMuteAuthor } from '@/hooks/use-mute-author';
import { useBlockAuthor } from '@/hooks/use-block-author';
import { useSuperpowers } from '@/hooks/use-superpowers';
import { usePostLinkCopyCount, useTrackPostLinkCopy } from '@/hooks/use-link-copy-count';
import { getNFTInfo, isFollowing as checkIsFollowing, reactToPost, repostPost, voteOnPost } from '@/lib/api/dehub';
import type { DeHubNFT } from '@/lib/api/dehub/types';
import { dehubLinkFor } from '@/lib/dehub-links';
import { viewerShareUrl } from '@/lib/share-url';
import { getVoteCache } from '@/lib/vote-cache';
import { isPostReposted, markReposted, unmarkReposted } from '@/lib/repost-cache';
import { REACTION_LIST, type PostReaction } from '@/lib/reactions';
import { askPostBar, closePostMenu, openPostLook, usePostMenuState, type PostMenuOpen, type PostMenuTarget } from '@/lib/post-menu';
import { QuotePostModalLazy } from '@/components/app/modals/QuotePostModalLazy';
import { ReportModal } from '@/components/app/modals/ReportModal';

const ShareToDmModal = lazy(() => import('@/components/app/modals/ShareToDmModal').then((m) => ({ default: m.ShareToDmModal })));
const TipModal = lazy(() => import('@/components/app/modals/TipModal').then((m) => ({ default: m.TipModal })));
const BoostModal = lazy(() => import('@/components/app/modals/BoostModal').then((m) => ({ default: m.BoostModal })));

const EMOJI_BY_REACTION = Object.fromEntries(REACTION_LIST.map((r) => [r.key, r.emoji])) as Record<PostReaction, string>;
const REACTION_BY_EMOJI = Object.fromEntries(REACTION_LIST.map((r) => [r.emoji, r.key])) as Record<string, PostReaction>;
const QUICK = REACTION_LIST.map((r) => r.emoji);
const MENU_WIDTH = 304;
/** Rows a phone leaves out because the post's action bar already has them. */
const ON_ACTION_BAR = new Set(['comment', 'repost', 'quote', 'tip', 'bookmark', 'info']);

type Sheet = null | 'dm' | 'quote' | 'tip' | 'report' | 'boost';

function postPath(target: PostMenuTarget) {
  if (target.articleSlug) return `/app/post/${target.articleSlug}`;
  return `/app/post/${target.id}`;
}

function shareLink(target: PostMenuTarget, tokenId: number) {
  if (target.articleSlug) return dehubLinkFor.article(target.articleSlug);
  if (target.newPostId != null && !(tokenId > 0)) return dehubLinkFor.newPost(target.newPostId);
  return dehubLinkFor.post(tokenId > 0 ? tokenId : target.id);
}

export default function PostMenuHost() {
  const open = usePostMenuState();
  // The last post the menu opened on: its sheets stay mounted for it after
  // the menu itself closes.
  const [last, setLast] = useState<PostMenuOpen | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  useEffect(() => {
    if (!open) return;
    setLast(open);
    setSheet(null);
  }, [open]);

  if (!last) return null;
  return <PostMenuBody key={last.target.id} open={open} target={last.target} sheet={sheet} setSheet={setSheet} />;
}

function PostMenuBody({ open, target, sheet, setSheet }: {
  open: PostMenuOpen | null;
  target: PostMenuTarget;
  sheet: Sheet;
  setSheet: (sheet: Sheet) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const signedIn = !!walletAddress && isAuthenticated;
  const showing = !!open && open.target.id === target.id;

  const tokenId = parseInt(target.id, 10) || 0;
  const isOwn = !!target.isOwn || !!(walletAddress && target.authorId && target.authorId.toLowerCase() === walletAddress.toLowerCase());
  const isPublic = !target.visibility || target.visibility === 'public';
  const authorLabel = target.authorHandle ? `@${target.authorHandle}` : target.authorName || '';
  const authorName = target.authorName || target.authorHandle || undefined;

  // What the card's ActionBar holds right now, asked on each open: its vote
  // and repost state move without a refetch, so the post object can be behind.
  const [bar, setBar] = useState(() => askPostBar({ postId: target.id, action: 'state' }));
  useEffect(() => {
    if (showing) setBar(askPostBar({ postId: target.id, action: 'state' }));
  }, [showing, open?.seq, target.id]);
  const myReaction = bar.handled ? bar.state?.myReaction ?? null : (getVoteCache(target.id)?.myReaction ?? target.myReaction ?? null);
  const reposted = bar.handled ? !!bar.state?.isReposted : (!!target.isReposted || isPostReposted(target.id));

  const { isBookmarked, toggleBookmark } = useBookmarkPost(target.id);
  const togglePin = useTogglePin();
  const isPinned = useIsPostPinned(tokenId || undefined);
  const { isFollowing: followOverride, toggleFollow } = useFollow(target.authorId);
  const [serverFollowing, setServerFollowing] = useState<boolean | null>(null);
  useEffect(() => {
    if (!showing || !signedIn || isOwn || !target.authorId || followOverride !== undefined || serverFollowing !== null) return;
    let cancelled = false;
    checkIsFollowing(target.authorId).then((res) => { if (!cancelled) setServerFollowing(res); }).catch(() => {});
    return () => { cancelled = true; };
  }, [showing, signedIn, isOwn, target.authorId, followOverride, serverFollowing]);
  const following = followOverride ?? serverFollowing;
  const { muteAuthor } = useMuteAuthor();
  const { blockAuthor } = useBlockAuthor();
  const { data: powers } = useSuperpowers(showing && signedIn);
  const canGiftBoost = !isOwn && !!powers?.powers.some((p) => p.key === 'deep_current' && p.unlocked && p.available);
  const { data: linkCopyCount = 0 } = usePostLinkCopyCount(showing ? target.id : undefined);
  const trackLinkCopy = useTrackPostLinkCopy();
  const [quoted, setQuoted] = useState<DeHubNFT | null>(null);

  const needLogin = useCallback(() => {
    if (signedIn) return false;
    openLoginModal();
    return true;
  }, [signedIn, openLoginModal]);

  const react = useCallback(async (emoji: string) => {
    const reaction = REACTION_BY_EMOJI[emoji];
    if (!reaction || needLogin()) return;
    if (askPostBar({ postId: target.id, action: 'react', reaction }).handled) return;
    if (!tokenId) return;
    try {
      if (reaction === 'like' || reaction === 'dislike') await voteOnPost({ tokenId, voteType: reaction === 'like' ? 'for' : 'against' });
      else await reactToPost({ tokenId, reaction });
      if (myReaction !== reaction) toast.success(emoji);
      queryClient.invalidateQueries({ queryKey: ['unified-feed'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['dehub-user-content'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['single-post', target.id] });
    } catch {
      toast.error(t('copy.520424cf959c', 'Failed to react. Please try again.'));
    }
  }, [needLogin, target.id, tokenId, myReaction, queryClient, t]);

  const repost = useCallback(async () => {
    if (needLogin()) return;
    if (askPostBar({ postId: target.id, action: 'repost' }).handled) return;
    if (!tokenId) return;
    const undo = reposted;
    if (undo) unmarkReposted(target.id); else markReposted(target.id);
    try {
      await repostPost(tokenId);
      toast.success(undo ? t('copy.6a629ab80468', 'Repost removed') : t('copy.5f39b8b65253', 'Reposted!'));
      queryClient.invalidateQueries({ queryKey: ['unified-feed'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['user-reposts'], refetchType: 'none' });
    } catch {
      if (undo) markReposted(target.id); else unmarkReposted(target.id);
      toast.error(t('copy.7527dc6722fc', 'Failed to repost'));
    }
  }, [needLogin, target.id, tokenId, reposted, queryClient, t]);

  const sendInDm = useCallback(() => {
    if (needLogin()) return;
    if (askPostBar({ postId: target.id, action: 'dm' }).handled) return;
    setSheet('dm');
  }, [needLogin, target.id, setSheet]);

  const quote = useCallback(async () => {
    if (needLogin()) return;
    if (target.actions?.quote) { target.actions.quote(); return; }
    try {
      const nft = await queryClient.fetchQuery({
        queryKey: ['pinned-post', String(tokenId)],
        queryFn: () => getNFTInfo(String(tokenId)),
        staleTime: 5 * 60 * 1000,
      });
      setQuoted(nft);
      setSheet('quote');
    } catch {
      toast.error(t('common.somethingWentWrong', 'Something went wrong'));
    }
  }, [needLogin, target.actions, queryClient, tokenId, setSheet, t]);

  const copy = useCallback(async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
      return true;
    } catch {
      toast.error(t('postOptions.copyFailed', 'Could not copy link'));
      return false;
    }
  }, [t]);

  const words = (target.text || '').trim();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // On a phone the post's action bar sits right under it, so the menu leaves
  // out what that bar already does (Requests 7399dd7d). Desktop keeps them:
  // their letter shortcuts live in this menu.
  const phone = useIsMobile();

  const actions = useMemo<MessageMenuAction[]>(() => {
    const list: MessageMenuAction[] = [];
    const add = (a: MessageMenuAction | false | null | undefined) => { if (a && !(phone && ON_ACTION_BAR.has(a.key))) list.push(a); };
    const link = viewerShareUrl(shareLink(target, tokenId));

    add({
      key: 'comment', label: t('copy.44f5e3fbec57', 'Comment'), icon: <MessageSquare />, hint: 'C',
      onSelect: () => (target.actions?.comments ? target.actions.comments() : navigate(`${postPath(target)}?comments=1`, { state: { fromFeed: true } })),
    });
    add(isPublic && tokenId > 0 && { key: 'dm', label: t('copy.20e392c29da3', 'Send in a message'), icon: <Send />, hint: 'M', onSelect: sendInDm });
    add(isPublic && tokenId > 0 && {
      key: 'repost', label: reposted ? t('postStage.undoRepost', 'Undo repost') : t('postStage.repost', 'Repost'), icon: <Repeat2 />, hint: 'R', onSelect: repost,
    });
    add(isPublic && tokenId > 0 && (isOwn || target.quotePolicy !== 'nobody') && { key: 'quote', label: t('postStage.quote', 'Quote'), icon: <Quote />, hint: 'Q', onSelect: quote });
    add(!isOwn && !!target.authorId && !target.noTip && {
      key: 'tip', label: t('postOptions.sendTip', 'Send Tip'), icon: <Diamond />, hint: 'T',
      onSelect: () => { if (needLogin()) return; if (target.actions?.tip) target.actions.tip(); else setSheet('tip'); },
    });
    add({
      key: 'bookmark', label: isBookmarked ? t('postOptions.removeBookmark', 'Remove bookmark') : t('postOptions.bookmark', 'Bookmark'),
      icon: <Bookmark />, hint: 'B', onSelect: () => toggleBookmark(),
    });
    add(isOwn && tokenId > 0 && {
      key: 'pin', label: isPinned ? t('postOptions.unpinPost', 'Unpin from your profile') : t('postOptions.pinPost', 'Pin to your profile'),
      icon: <Pin />, onSelect: () => togglePin.mutate(tokenId),
    });
    add(!!target.look && {
      key: 'look',
      label: target.look.kind === 'article' ? t('articleTile.title', 'Article tiles') : t('postBg.title', 'Post background'),
      icon: <Palette />, onSelect: () => openPostLook(target.look!),
    });

    add({
      key: 'copy-link', label: t('postOptions.copyLink', 'Copy link'), icon: <Link2 />, hint: 'L', divided: true,
      onSelect: () => { void copy(link, t('postOptions.postUrlCopied', 'Post link copied')).then((ok) => { if (ok) trackLinkCopy(target.id, walletAddress, linkCopyCount); }); },
    });
    add(!!words && { key: 'copy-text', label: t('comments.copyText', 'Copy text'), icon: <Type />, hint: 'X', onSelect: () => { void copy(words, t('common.copied', 'Copied')); } });
    add(canShare && {
      key: 'share', label: t('postOptions.share', 'Share'), icon: <Share />,
      onSelect: () => { navigator.share({ url: link }).catch(() => {}); },
    });
    add(!!target.actions?.askAI && { key: 'ai', label: t('postOptions.aiOverview', 'AI overview'), icon: <AssistantNavIcon />, onSelect: () => target.actions!.askAI!() });
    add(!!target.actions?.seeEngagements && { key: 'engagements', label: t('copy.f5ab429b0727', 'See Engagements'), icon: <Stats />, onSelect: () => target.actions!.seeEngagements!() });
    add({ key: 'info', label: t('postInfo.title', 'Post Info'), icon: <Info />, hint: 'I', onSelect: () => navigate(`/app/post/${target.id}/info`) });

    // SuperPowers: a gift on somebody else's post, a boost on your own.
    if (canGiftBoost && tokenId > 0) {
      add({
        key: 'gift-boost', label: t('postOptions.giftBoost', 'Gift a boost'), icon: <Gift />, divided: true,
        onSelect: () => setSheet('boost'),
      });
    }
    if (isOwn && tokenId > 0) {
      add({
        key: 'boost', label: t('postOptions.boostPost', 'Boost post'), icon: <Superpowers />, divided: true,
        onSelect: () => (target.actions?.boost ? target.actions.boost() : setSheet('boost')),
      });
    }

    if (!isOwn && target.authorId) {
      const name = authorLabel || t('copy.04f8996da763', 'user');
      add(following === false && {
        key: 'follow', label: t('follow.follow', 'Follow'), icon: <UserPlus />, divided: true,
        onSelect: () => { if (needLogin()) return; void toggleFollow(false, { name: authorName || name }); },
      });
      add(following === true && {
        key: 'unfollow', label: t('profileOptions.unfollow', 'Unfollow'), icon: <UserCheck />, divided: true,
        onSelect: () => { if (needLogin()) return; void toggleFollow(true, { name: authorName || name }); },
      });
      add({
        key: 'mute', label: t('postOptions.muteCreator', 'Mute creator'), icon: <VolumeX />, divided: following === null,
        onSelect: () => { if (needLogin()) return; muteAuthor(target.authorId!, authorName); },
      });
      add({
        key: 'block', label: t('postOptions.blockCreator', 'Block creator'), icon: <Ban />,
        onSelect: () => { if (needLogin()) return; blockAuthor(target.authorId!, authorName); },
      });
      add({
        key: 'report', label: t('postOptions.report', 'Report'), icon: <Flag />, destructive: true,
        onSelect: () => { if (needLogin()) return; if (target.actions?.report) target.actions.report(); else setSheet('report'); },
      });
    }

    if (isOwn) {
      add(!!target.actions?.edit && { key: 'edit', label: t('postOptions.editPost', 'Edit post'), icon: <Pencil />, divided: true, onSelect: () => target.actions!.edit!() });
      add(!!target.actions?.delete && { key: 'delete', label: t('postOptions.deletePost', 'Delete post'), icon: <Trash2 />, destructive: true, divided: !target.actions?.edit, onSelect: () => target.actions!.delete!() });
    }
    return list;
  }, [phone, target, tokenId, isPublic, isOwn, reposted, isBookmarked, isPinned, words, canShare, canGiftBoost, following, authorLabel, authorName, linkCopyCount, walletAddress,
    t, navigate, sendInDm, repost, quote, needLogin, setSheet, toggleBookmark, togglePin, copy, trackLinkCopy, toggleFollow, muteAuthor, blockAuthor]);

  const header = authorLabel ? (
    <p className="truncate text-[12px] font-semibold opacity-60">{authorLabel}</p>
  ) : null;

  return (
    <>
      <MessageMenu
        point={showing ? open!.point : null}
        onClose={closePostMenu}
        quickReactions={tokenId > 0 ? QUICK : null}
        mine={myReaction ? [EMOJI_BY_REACTION[myReaction]] : []}
        onReact={(emoji) => { void react(emoji); }}
        allowMore={false}
        actions={actions}
        label={t('postOptions.options', 'Post options')}
        width={MENU_WIDTH}
        header={header}
      />

      {sheet === 'dm' && tokenId > 0 && (
        <Suspense fallback={null}>
          <ShareToDmModal open onOpenChange={(o) => { if (!o) setSheet(null); }} url={shareLink(target, tokenId)} />
        </Suspense>
      )}
      {quoted && (
        <QuotePostModalLazy open={sheet === 'quote'} onOpenChange={(o) => { if (!o) setSheet(null); }} quotedPost={quoted} />
      )}
      {sheet === 'tip' && (
        <Suspense fallback={null}>
          <TipModal open onOpenChange={(o) => { if (!o) setSheet(null); }} creatorAddress={target.authorId ?? undefined} creatorName={authorName} tokenId={target.id} />
        </Suspense>
      )}
      <ReportModal open={sheet === 'report'} onOpenChange={(o) => { if (!o) setSheet(null); }} tokenId={target.id} contentType="post" />
      {sheet === 'boost' && tokenId > 0 && (
        <Suspense fallback={null}>
          <BoostModal open onOpenChange={(o) => { if (!o) setSheet(null); }} tokenId={tokenId} postTitle={target.title ?? target.text ?? ''} />
        </Suspense>
      )}
    </>
  );
}
