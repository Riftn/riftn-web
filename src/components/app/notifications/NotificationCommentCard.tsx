/**
 * The comment a notification is about, in full, with Reply / Like / Tip.
 *
 * A reply used to show as one clamped line of a 150-character preview, so
 * answering somebody meant leaving Notifications for the post. The list now
 * carries the comment itself (backend attaches `comment` to every row that is
 * about one): its whole text, its picture, GIF, clip or voice note, and the
 * reader's own reaction. Reply opens a small box right under it, Like reacts
 * in place, Tip opens the tip sheet aimed at the comment's author, and the
 * arrow still opens the post at that comment.
 *
 * Every control stops the row's click, so using one never navigates.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TranslatableText } from '@/components/app/TranslatableText';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import ThumbsUp from '@/components/ui/cut-icons/like';
import MessageSquare from '@/components/ui/cut-icons/messages';
import Send from '@/components/ui/cut-icons/send';
import OpenIcon from '@/components/ui/cut-icons/open-externally';
import { TipGemIcon } from '@/components/app/cards/TipGemIcon';
import { postComment, reactToComment } from '@/lib/api/dehub';
import type { DeHubNotification, NotificationComment } from '@/lib/api/dehub/notifications';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { NOTIFICATION_COMMENT_ACTIONABLE as ACTIONABLE } from '@/lib/notification-comment';

const TipModal = lazy(() => import('@/components/app/modals/TipModal').then((m) => ({ default: m.TipModal })));

const CDN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/';
const media = (key?: string | null) => (key ? (key.startsWith('http') ? key : `${CDN}${key}`) : undefined);

interface Props {
  notification: DeHubNotification;
  /** Marks the row read the first time the reader acts on it. */
  onEngaged?: () => void;
}

export function NotificationCommentCard({ notification, onEngaged }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { walletAddress } = useAuth();
  const comment = notification.comment as NotificationComment;
  const commentId = String(comment.id ?? notification.commentId);
  const tokenId = notification.tokenId ?? comment.tokenId;
  const author = (comment.address || notification.actorAddress || '').toLowerCase();
  const isOwn = !!walletAddress && author === walletAddress.toLowerCase();
  const actionable = ACTIONABLE.has(notification.type as string) && !isOwn && tokenId != null;

  const [liked, setLiked] = useState(comment.myReaction ? comment.myReaction !== 'dislike' : !!comment.isLiked);
  const [likes, setLikes] = useState(comment.likeCount ?? 0);
  const [liking, setLiking] = useState(false);
  const [replies, setReplies] = useState(comment.replyCount ?? 0);
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyOpen) inputRef.current?.focus({ preventScroll: true });
  }, [replyOpen]);

  const text = (comment.content || '').trim();
  const image = media(comment.imageUrl || comment.gifUrl);
  const video = media(comment.videoUrl);
  const audio = media(comment.audioUrl);
  const replyTo = notification.actor?.username || notification.actorUsername;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const toggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (liking) return;
    onEngaged?.();
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    setLiking(true);
    try {
      const res = await reactToComment({ commentId, reaction: 'like' });
      if (res && typeof res.likes === 'number') setLikes(res.likes);
      if (res && typeof res.liked === 'boolean') setLiked(res.liked);
    } catch {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
    } finally {
      setLiking(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending || tokenId == null) return;
    setSending(true);
    try {
      // Replies land in the comment's own thread; a reply to a reply still
      // threads under it, the same as the post page does.
      await postComment(String(tokenId), replyTo && !body.startsWith('@') ? `@${replyTo} ${body}` : body, commentId);
      setDraft('');
      setReplyOpen(false);
      setReplies((n) => n + 1);
      toast.success(t('toasts.comment_posted', { defaultValue: 'Comment posted!' }));
    } catch (err) {
      toast.error((err as Error)?.message || t('toasts.failed_to_post_comment', { defaultValue: 'Failed to post comment' }));
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-feed-comment className="mt-1.5">
      {text && (
        <p data-feed-comment-text className="text-[14.5px] leading-[1.42] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {/* Foreign text reads in your language (follows the auto-translate
              setting), same as comments under a post. */}
          <TranslatableText text={text} />
        </p>
      )}

      {image && (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          data-feed-comment-media
          className="mt-2 block max-h-[280px] w-auto max-w-full rounded-xl object-cover"
        />
      )}
      {video && (
        <video
          src={video}
          controls
          playsInline
          preload="metadata"
          onClick={stop}
          data-feed-comment-media
          className="mt-2 block max-h-[320px] w-auto max-w-full rounded-xl bg-black"
        />
      )}
      {audio && (
        <audio src={audio} controls preload="none" onClick={stop} className="mt-2 block h-9 w-full max-w-[320px]" />
      )}

      {actionable && (
        <div data-feed-actions className="-ml-2 mt-1.5 flex items-center gap-1" onClick={stop}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEngaged?.(); setReplyOpen((v) => !v); }}
            data-active={replyOpen ? '' : undefined}
            className="flex h-8 items-center gap-1.5 rounded-full px-2 text-[13px]"
            aria-label={t('messages.reply', { defaultValue: 'Reply' })}
          >
            <MessageSquare className="h-[17px] w-[17px] shrink-0" />
            {replies > 0 && <span className="tabular-nums">{replies}</span>}
          </button>
          <button
            type="button"
            onClick={toggleLike}
            data-active={liked ? '' : undefined}
            aria-pressed={liked}
            className="flex h-8 items-center gap-1.5 rounded-full px-2 text-[13px]"
            aria-label={t('reactionInfo.labels.like', { defaultValue: 'Like' })}
          >
            <ThumbsUp className={cn('h-[17px] w-[17px] shrink-0', liked && 'fill-current')} />
            {likes > 0 && <span className="tabular-nums">{likes}</span>}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEngaged?.(); setTipOpen(true); }}
            className="flex h-8 items-center gap-1.5 rounded-full px-2 text-[13px]"
            aria-label={t('comments.tip', { defaultValue: 'Tip' })}
          >
            <TipGemIcon tipped={false} className="h-[17px] w-[17px]" plainClassName="" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEngaged?.();
              navigate(`/app/post/${tokenId}?comments=1&comment=${commentId}`);
            }}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-full px-2 text-[13px]"
            aria-label={t('agents.life.viewPost', { defaultValue: 'View post' })}
            title={t('agents.life.viewPost', { defaultValue: 'View post' })}
          >
            <OpenIcon className="h-[16px] w-[16px] shrink-0" />
          </button>
        </div>
      )}

      {actionable && replyOpen && (
        <div data-feed-reply className="mt-1.5 flex items-end gap-2 rounded-2xl px-3 py-2" onClick={stop}>
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={500}
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
            disabled={!draft.trim() || sending}
            data-feed-pill="primary"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
            aria-label={t('tip.send', { defaultValue: 'Send' })}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}

      {tipOpen && (
        // The sheet is portalled, but React still bubbles its clicks up here:
        // without this every tap inside it would also open the post.
        <div onClick={stop} onPointerDown={stop} className="contents">
        <Suspense fallback={null}>
          <TipModal
            open={tipOpen}
            onOpenChange={setTipOpen}
            creatorAddress={author || undefined}
            creatorName={notification.actor?.displayName || replyTo}
            tokenId={tokenId != null ? String(tokenId) : undefined}
            commentId={commentId}
          />
        </Suspense>
        </div>
      )}
    </div>
  );
}
