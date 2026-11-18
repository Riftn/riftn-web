/**
 * Which notification rows show their comment whole, with Reply / Like / Tip
 * (see components/app/notifications/NotificationCommentCard).
 */
import type { DeHubNotification } from '@/lib/api/dehub/notifications';

/** Rows about somebody else's comment: those get Reply / Like / Tip. */
export const NOTIFICATION_COMMENT_ACTIONABLE = new Set(['comment', 'comment_reply', 'creator_comment_reply', 'mention']);

/** The row carries a comment worth showing. A comment-like row already quotes
 *  the reader's own comment in its sentence, so it is left as it was. */
export function notificationHasComment(n: DeHubNotification): boolean {
  const c = n.comment;
  return !!c && NOTIFICATION_COMMENT_ACTIONABLE.has(n.type as string) &&
    !!(c.content?.trim() || c.imageUrl || c.gifUrl || c.videoUrl || c.audioUrl);
}
