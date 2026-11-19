/**
 * What a Requests-board notification is about, fetched for the list.
 *
 * Those rows come from `custom_notifications`, which stores only the request
 * id, its title and the comment id. The list used to print the title twice and
 * nothing else, so reading what somebody said meant leaving Notifications.
 * These loaders fetch the comment or the request itself for every row on a
 * page in one query (rows ask one at a time; ids asked for in the same tick
 * share one round trip), so a page of 15 costs one or two reads, not 15.
 */
import { supabase } from '@/integrations/supabase/client';
import { isPositiveReaction, type PostReaction } from '@/lib/reactions';
import type { CommentMediaType } from '@/lib/comment-threads';
import type { DeHubNotification } from '@/lib/api/dehub/notifications';

type Row = DeHubNotification & { _customReferenceId?: string; _customCommentId?: string };

/** Rows about somebody else's comment on a request: Reply and Like. */
export const REQUEST_COMMENT_ACTIONABLE = new Set([
  'feature_request_comment',
  'feature_request_reply',
  'feature_request_mention',
  'feature_request_activity',
]);
/** Every row that carries a comment id, the reader's own liked comment included. */
export const REQUEST_COMMENT_TYPES = new Set([...REQUEST_COMMENT_ACTIONABLE, 'feature_request_comment_like']);

export interface RequestCommentView {
  id: string;
  featureRequestId: string;
  walletAddress: string;
  username: string | null;
  content: string;
  mediaUrl: string | null;
  mediaType: CommentMediaType | null;
  likeCount: number;
  myReaction: PostReaction | null;
}

export interface RequestView {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  authorAddress: string;
  voteCount: number;
  commentCount: number;
}

type Pending<T> = Map<string, Array<{ resolve: (v: T | null) => void; reject: (e: unknown) => void }>>;

/** Collects ids asked for in the same tick and fetches them together. */
function batcher<T>(run: (ids: string[], scope: string) => Promise<Map<string, T>>) {
  const queues = new Map<string, Pending<T>>();
  return (id: string, scope = ''): Promise<T | null> =>
    new Promise((resolve, reject) => {
      let pending = queues.get(scope);
      if (!pending) {
        pending = new Map();
        queues.set(scope, pending);
        setTimeout(async () => {
          const batch = queues.get(scope)!;
          queues.delete(scope);
          try {
            const found = await run([...batch.keys()], scope);
            batch.forEach((waiters, key) => waiters.forEach((w) => w.resolve(found.get(key) ?? null)));
          } catch (e) {
            batch.forEach((waiters) => waiters.forEach((w) => w.reject(e)));
          }
        }, 0);
      }
      const waiters = pending.get(id) ?? [];
      waiters.push({ resolve, reject });
      pending.set(id, waiters);
    });
}

/** `scope` is the viewer's lowercased wallet, for their own reaction. */
export const loadRequestComment = batcher<RequestCommentView>(async (ids, viewer) => {
  const { data, error } = await supabase
    .from('feature_request_comments')
    .select('id, feature_request_id, wallet_address, username, content, media_url, media_type')
    .in('id', ids);
  if (error) throw error;
  const rows = (data || []) as Array<{
    id: string; feature_request_id: string; wallet_address: string; username: string | null;
    content: string | null; media_url?: string | null; media_type?: CommentMediaType | null;
  }>;
  const out = new Map<string, RequestCommentView>();
  if (!rows.length) return out;

  const { data: reactions } = await supabase
    .from('feature_request_comment_reactions')
    .select('comment_id, wallet_address, reaction')
    .in('comment_id', rows.map((r) => r.id));
  const likes = new Map<string, number>();
  const mine = new Map<string, PostReaction>();
  for (const r of (reactions || []) as Array<{ comment_id: string; wallet_address: string; reaction: PostReaction }>) {
    let positive = false;
    try { positive = isPositiveReaction(r.reaction); } catch { /* a reaction this build does not know */ }
    if (positive) likes.set(r.comment_id, (likes.get(r.comment_id) ?? 0) + 1);
    if (viewer && r.wallet_address?.toLowerCase() === viewer) mine.set(r.comment_id, r.reaction);
  }

  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      featureRequestId: r.feature_request_id,
      walletAddress: (r.wallet_address || '').toLowerCase(),
      username: r.username,
      content: r.content || '',
      mediaUrl: r.media_url ?? null,
      mediaType: r.media_type ?? null,
      likeCount: likes.get(r.id) ?? 0,
      myReaction: mine.get(r.id) ?? null,
    });
  }
  return out;
});

export const loadRequest = batcher<RequestView>(async (ids) => {
  const { data, error } = await supabase
    .from('feature_requests')
    .select('id, title, description, image_url, author_wallet_address, vote_count, comment_count')
    .in('id', ids);
  if (error) throw error;
  const out = new Map<string, RequestView>();
  for (const r of (data || []) as Array<{
    id: string; title: string; description: string | null; image_url: string | null;
    author_wallet_address: string; vote_count: number | null; comment_count: number | null;
  }>) {
    out.set(r.id, {
      id: r.id,
      title: r.title,
      description: r.description || '',
      imageUrl: r.image_url,
      authorAddress: (r.author_wallet_address || '').toLowerCase(),
      voteCount: r.vote_count ?? 0,
      commentCount: r.comment_count ?? 0,
    });
  }
  return out;
});

/** True when this row gets a card: a comment row with its comment id, or a new request. */
export function notificationHasRequestCard(n: DeHubNotification): boolean {
  const row = n as Row;
  const type = n.type as string;
  if (REQUEST_COMMENT_TYPES.has(type)) return !!row._customCommentId;
  return type === 'feature_request_new' && !!row._customReferenceId;
}
