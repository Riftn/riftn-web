/**
 * What a Requests-board notification is about, with Reply / Like or Upvote.
 *
 * A comment row shows the comment itself, whole, with its picture, clip or
 * voice note; Reply answers it in its thread and Like reacts in place. A new
 * request shows its whole description and first picture; Upvote votes for it
 * and Reply leaves a comment on it. The arrow opens the board at the request.
 *
 * Every control stops the row's click, so using one never navigates.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TranslatableText } from '@/components/app/TranslatableText';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowBigUp, Loader2 } from 'lucide-react';
import ThumbsUp from '@/components/ui/cut-icons/like';
import MessageSquare from '@/components/ui/cut-icons/messages';
import Send from '@/components/ui/cut-icons/send';
import OpenIcon from '@/components/ui/cut-icons/open-externally';
import { useAuth } from '@/contexts/AuthContext';
import { useReactToComment, useSubmitComment } from '@/hooks/use-feature-request-comments';
import { useUserVotes, useVoteFeatureRequest } from '@/hooks/use-feature-requests';
import { isPositiveReaction, type PostReaction } from '@/lib/reactions';
import { cn } from '@/lib/utils';
import {
  loadRequest,
  loadRequestComment,
  REQUEST_COMMENT_ACTIONABLE,
} from '@/lib/notification-request';
import type { DeHubNotification } from '@/lib/api/dehub/notifications';

import { formatCount } from '@/lib/format-count';
type Row = DeHubNotification & { _customReferenceId?: string; _customReferenceTitle?: string; _customCommentId?: string };

const positive = (r: PostReaction | null) => {
  if (!r) return false;
  try { return isPositiveReaction(r); } catch { return false; }
};

interface Props {
  notification: DeHubNotification;
  /** Marks the row read the first time the reader acts on it. */
  onEngaged?: () => void;
}

export function NotificationRequestCard({ notification, onEngaged }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { walletAddress } = useAuth();
  const viewer = walletAddress?.toLowerCase() ?? '';
  const row = notification as Row;
  const type = notification.type as string;
  const isNew = type === 'feature_request_new';
  const requestId = row._customReferenceId;
  const commentId = row._customCommentId;

  const commentQuery = useQuery({
    queryKey: ['notification-request-comment', commentId, viewer],
    queryFn: () => loadRequestComment(commentId!, viewer),
    enabled: !isNew && !!commentId,
    staleTime: 60_000,
  });
  const requestQuery = useQuery({
    queryKey: ['notification-request', requestId],
    queryFn: () => loadRequest(requestId!),
    enabled: isNew && !!requestId,
    staleTime: 60_000,
  });
  const { data: votes } = useUserVotes();
  const vote = useVoteFeatureRequest();
  const react = useReactToComment();
  const submit = useSubmitComment();

  const comment = commentQuery.data ?? null;
  const request = requestQuery.data ?? null;

  const [myReaction, setMyReaction] = useState<PostReaction | null>(null);
  const [likes, setLikes] = useState(0);
  const [voteDelta, setVoteDelta] = useState(0);
  const [replies, setReplies] = useState(0);
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!comment) return;
    setMyReaction(comment.myReaction);
    setLikes(comment.likeCount);
  }, [comment]);
  useEffect(() => {
    if (replyOpen) inputRef.current?.focus({ preventScroll: true });
  }, [replyOpen]);

  if (isNew ? !request : !comment) return null;

  const author = isNew ? request!.authorAddress : comment!.walletAddress;
  const isOwn = !!viewer && author === viewer;
  const canReply = !!viewer && (isNew ? true : REQUEST_COMMENT_ACTIONABLE.has(type) && !isOwn);
  const text = (isNew ? request!.description : comment!.content).trim();
  const mediaUrl = isNew ? request!.imageUrl : comment!.mediaUrl;
  const mediaType = isNew ? (request!.imageUrl ? 'image' : null) : comment!.mediaType;
  const replyTo = isNew ? null : (notification.actor?.username || notification.actorUsername || comment!.username);
  const fid = isNew ? request!.id : comment!.featureRequestId;
  const myVote = votes?.[fid];
  const upvoted = myVote === 1;
  const liked = positive(myReaction);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const open = () => {
    const base = `/features?request=${encodeURIComponent(fid)}`;
    navigate(isNew ? base : `${base}&comments=1&comment=${encodeURIComponent(comment!.id)}`);
  };

  const toggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!comment || react.isPending) return;
    onEngaged?.();
    // Holding any warm reaction counts as liked; tapping again takes it off.
    const reaction: PostReaction = liked && myReaction ? myReaction : 'like';
    const before = myReaction;
    const next = liked ? null : 'like';
    setMyReaction(next);
    setLikes((n) => Math.max(0, n + (liked ? -1 : 1)));
    react.mutate(
      { commentId: comment.id, reaction, current: before, featureRequestId: fid },
      { onError: () => { setMyReaction(before); setLikes((n) => Math.max(0, n + (liked ? 1 : -1))); } },
    );
  };

  const toggleVote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!request || vote.isPending) return;
    onEngaged?.();
    setVoteDelta((d) => d + (upvoted ? -1 : 1));
    vote.mutate(
      { featureRequestId: request.id, voteType: 1, currentVote: myVote },
      { onError: () => setVoteDelta((d) => d + (upvoted ? 1 : -1)) },
    );
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || submit.isPending) return;
    try {
      await submit.mutateAsync({
        featureRequestId: fid,
        content: replyTo && !body.startsWith('@') ? `@${replyTo} ${body}` : body,
        parentId: isNew ? null : comment!.id,
        featureTitle: row._customReferenceTitle || notification.tokenTitle || null,
        featureAuthorAddress: isNew ? request!.authorAddress : null,
        parentAuthorAddress: isNew ? null : comment!.walletAddress,
      });
      setDraft('');
      setReplyOpen(false);
      setReplies((n) => n + 1);
      toast.success(t('toasts.comment_posted', { defaultValue: 'Comment posted!' }));
    } catch {
      // useSubmitComment already said it failed.
    }
  };

  const voteCount = isNew ? Math.max(0, request!.voteCount + voteDelta) : 0;
  const replyCount = isNew ? request!.commentCount + replies : replies;

  return (
    <div data-feed-comment className="mt-1.5">
      {text && (
        <p data-feed-comment-text className="text-[14.5px] leading-[1.42] whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-[12]">
          {/* Foreign text reads in your language (follows the auto-translate
              setting), same as comments under a post. */}
          <TranslatableText text={text} />
        </p>
      )}

      {mediaUrl && (mediaType === 'image' || mediaType === 'gif') && (
        <img
          src={mediaUrl}
          alt=""
          loading="lazy"
          decoding="async"
          data-feed-comment-media
          className="mt-2 block max-h-[280px] w-auto max-w-full rounded-xl object-cover"
        />
      )}
      {mediaUrl && mediaType === 'video' && (
        <video
          src={mediaUrl}
          controls
          playsInline
          preload="metadata"
          onClick={stop}
          data-feed-comment-media
          className="mt-2 block max-h-[320px] w-auto max-w-full rounded-xl bg-black"
        />
      )}
      {mediaUrl && (mediaType === 'audio' || mediaType === 'voice') && (
        <audio src={mediaUrl} controls preload="none" onClick={stop} className="mt-2 block h-9 w-full max-w-[320px]" />
      )}

      {!!viewer && (
        <div data-feed-actions className="-ml-2 mt-1.5 flex items-center gap-1" onClick={stop}>
          {canReply && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEngaged?.(); setReplyOpen((v) => !v); }}
              data-active={replyOpen ? '' : undefined}
              className="flex h-8 items-center gap-1.5 rounded-full px-2 text-[13px]"
              aria-label={t('messages.reply', { defaultValue: 'Reply' })}
            >
              <MessageSquare className="h-[17px] w-[17px] shrink-0" />
              {replyCount > 0 && <span className="tabular-nums">{formatCount(replyCount)}</span>}
            </button>
          )}
          {isNew ? (
            <button
              type="button"
              onClick={toggleVote}
              data-active={upvoted ? '' : undefined}
              aria-pressed={upvoted}
              className="flex h-8 items-center gap-1 rounded-full px-2 text-[13px]"
              aria-label={t('glossary.upvote', { defaultValue: 'Upvote' })}
            >
              <ArrowBigUp className={cn('h-[19px] w-[19px] shrink-0', upvoted && 'fill-current')} strokeWidth={1.8} />
              {voteCount > 0 && <span className="tabular-nums">{formatCount(voteCount)}</span>}
            </button>
          ) : (
            !isOwn && (
              <button
                type="button"
                onClick={toggleLike}
                data-active={liked ? '' : undefined}
                aria-pressed={liked}
                className="flex h-8 items-center gap-1.5 rounded-full px-2 text-[13px]"
                aria-label={t('reactionInfo.labels.like', { defaultValue: 'Like' })}
              >
                <ThumbsUp className={cn('h-[17px] w-[17px] shrink-0', liked && 'fill-current')} />
                {likes > 0 && <span className="tabular-nums">{formatCount(likes)}</span>}
              </button>
            )
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEngaged?.(); open(); }}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-full px-2 text-[13px]"
            aria-label={t('dehubLinks.viewRequest', { defaultValue: 'View request' })}
            title={t('dehubLinks.viewRequest', { defaultValue: 'View request' })}
          >
            <OpenIcon className="h-[16px] w-[16px] shrink-0" />
          </button>
        </div>
      )}

      {canReply && replyOpen && (
        <div data-feed-reply className="mt-1.5 flex items-end gap-2 rounded-2xl px-3 py-2" onClick={stop}>
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={2000}
            onChange={(e) => {
              setDraft(e.target.value);
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
              if (e.key === 'Escape') setReplyOpen(false);
            }}
            placeholder={replyTo
              ? t('features.replyingTo', { name: `@${replyTo}`, defaultValue: 'Replying to {{name}}' })
              : t('features.writeReply', { defaultValue: 'Write a reply...' })}
            className="min-h-[24px] flex-1 resize-none bg-transparent text-[14.5px] leading-[1.4] outline-none placeholder:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || submit.isPending}
            data-feed-pill="primary"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
            aria-label={t('tip.send', { defaultValue: 'Send' })}
          >
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
