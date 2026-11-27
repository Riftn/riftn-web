import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { ThreadedComments, type ThreadedCommentsLabels } from '@/components/app/comments/ThreadedComments';
import { attachReactions, buildThreads } from '@/lib/comment-threads';
import { readGenerationDiscussion, writeGeneration } from '@/lib/creator/gallery';
import type { Json } from '@/integrations/supabase/types';

export function GenerationDiscussion({ id, owner, focusCommentId }: { id: string; owner: string | null; focusCommentId?: string | null }) {
  const { t } = useTranslation();
  const { walletAddress, user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['generation-discussion', id, walletAddress], queryFn: () => readGenerationDiscussion(id) });
  const threads = useMemo(() => query.data ? buildThreads(attachReactions(query.data.comments, query.data.reactions, walletAddress?.toLowerCase() ?? null)) : undefined, [query.data, walletAddress]);
  const mutation = useMutation({
    mutationFn: ({ action, data }: { action: string; data: Record<string, Json> }) => writeGeneration(id, action, { ...data, username: user?.username ?? null, avatar: user?.avatarImageUrl ?? null }, walletAddress),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['generation-discussion', id] }); void qc.invalidateQueries({ queryKey: ['public-generations'] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const labels: ThreadedCommentsLabels = {
    addComment: t('governance.addComment'), writeReply: t('governance.discussion.writeReply'), reply: t('governance.discussion.reply'),
    replyingTo: name => t('governance.discussion.replyingTo', { name }), edited: t('governance.discussion.edited'),
    empty: t('governance.discussion.empty'), showMoreReplies: count => t('governance.discussion.showMoreReplies', { count }),
    signInToComment: t('governance.discussion.signInToComment'),
  };
  return <ThreadedComments draftScope={`generation:${id}`} threads={threads} isLoading={query.isLoading} isError={query.isError} isFetching={query.isFetching}
    onRetry={() => void query.refetch()} entityAuthorAddress={owner ?? ''} focusCommentId={focusCommentId} labels={labels}
    busy={mutation.isPending} submitting={mutation.isPending} listMaxHeightClass="max-h-none"
    onSubmit={({ content, parent }) => mutation.mutateAsync({ action: 'comment', data: { content, parent_id: parent?.id ?? null } })}
    onEdit={(comment, content) => mutation.mutateAsync({ action: 'edit', data: { comment_id: comment.id, content } })}
    onDelete={comment => mutation.mutate({ action: 'delete', data: { comment_id: comment.id } })}
    onReact={(comment, reaction) => mutation.mutate({ action: 'comment_react', data: { comment_id: comment.id, reaction: comment.myReaction === reaction ? null : reaction } })} />;
}
