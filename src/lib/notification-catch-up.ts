export const CATCH_UP_LIMIT = 30;

export const catchUpPrompts = [
  { key: 'summary', label: 'Catch me up', question: 'Summarize what needs my attention and what I should handle first.' },
  { key: 'replies', label: 'Needs a reply', question: 'Which notifications genuinely need a written reply?' },
  { key: 'urgent', label: 'Urgent', question: 'Which notifications are urgent and why?' },
  { key: 'cleanup', label: 'Clear the noise', question: 'Preview low-priority notifications I can mark as read.' },
  { key: 'drafts', label: 'Draft replies for all', question: 'Get back to everyone who genuinely needs a written reply.' },
] as const;

type NotificationSource = {
  _id: string;
  type: string;
  content: string;
  createdAt: string;
  actorUsername?: string;
  actorAddress?: string;
  read: boolean;
  updatedAt: string;
  actor?: { username?: string | null; displayName?: string | null };
  comment?: {
    id: number | string;
    content?: string;
    address?: string;
    imageUrl?: string;
    audioUrl?: string;
    videoUrl?: string;
    gifUrl?: string;
    tokenId?: number;
  };
  commentId?: number | string;
  commentPreview?: string;
  tokenId?: number;
  metadata?: { mentionContext?: string };
};

const reactionTypes = new Set([
  'like', 'dislike', 'reaction', 'comment_like', 'feature_request_like',
  'feature_request_comment_like', 'generation_like', 'generation_comment_like',
  'governance_like', 'governance_comment_like',
]);
const postCommentTypes = new Set(['comment', 'comment_reply', 'creator_comment_reply', 'mention']);
const positiveOnly = /^(?:(?:thanks?(?: you)?|ty|cheers|nice(?: one)?|great(?: job| work)?|looks good|love (?:it|this)|well done|awesome|amazing|congrats|congratulations|lol|lmao)[\s\p{P}\p{S}\p{M}\p{Cf}]*)+$/iu;

export function catchUpItem<T extends NotificationSource>(source: T, wallet: string) {
  const { actor, comment, type } = source;
  const username = actor?.username || source.actorUsername;
  const sender = username ? '@' + username : actor?.displayName || '';
  const message = comment?.content?.trim() || source.commentPreview?.trim() || '';
  const hasMedia = !!(comment?.imageUrl || comment?.audioUrl || comment?.videoUrl || comment?.gifUrl);
  const reaction = reactionTypes.has(type);
  const fullText = !!comment?.content?.trim() && !hasMedia && message.length <= 260;
  const acknowledgment = fullText && (!/\p{L}|\p{N}/u.test(message) || positiveOnly.test(message));
  const tokenId = source.tokenId ?? comment?.tokenId;
  const commentId = comment?.id ?? source.commentId;
  const author = comment?.address || source.actorAddress;
  const replyTarget = !reaction && !acknowledgment && message && postCommentTypes.has(type) &&
    (!source.metadata?.mentionContext || source.metadata.mentionContext === 'comment') &&
    author && author.toLowerCase() !== wallet.toLowerCase() &&
    typeof tokenId === 'number' && tokenId > 0 && commentId != null && /^\d+$/.test(String(commentId))
    ? { tokenId, commentId: String(commentId), username }
    : undefined;

  return {
    id: source._id,
    source,
    sender,
    message: message.slice(0, 260),
    preview: (message || source.content || type.replace(/_/g, ' ')).slice(0, 260),
    cleanup: reaction || acknowledgment,
    canClear: reaction || (fullText && !/[?？]/u.test(message) && postCommentTypes.has(type)),
    canNeedReply: !reaction && !acknowledgment,
    replyTarget,
  };
}

export type CatchUpItem<T extends NotificationSource> = ReturnType<typeof catchUpItem<T>>;
export type CatchUpResult = {
  answer: string;
  urgent: { index: number; reason: string }[];
  replies: { index: number; reason: string }[];
  cleanup: number[];
  drafts: { index: number; text: string }[];
  showCleanup: boolean;
};

const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export function readCatchUpResult<T extends NotificationSource>(raw: string, items: CatchUpItem<T>[]): CatchUpResult {
  const value: unknown = JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('answer' in value)) {
    throw new Error('Invalid notification summary');
  }
  const result = value as Record<string, unknown>;
  const valid = (index: unknown): index is number =>
    typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < items.length;
  const flagged = (entries: unknown) => {
    const seen = new Set<number>();
    const flags: { index: number; reason: string }[] = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry || !valid(entry.index) || seen.has(entry.index) || !items[entry.index].canNeedReply) continue;
      const reason = text(entry.reason, 220);
      if (!reason) continue;
      seen.add(entry.index);
      flags.push({ index: entry.index, reason });
    }
    return flags;
  };
  const urgent = flagged(result.urgent);
  const replies = flagged(result.replies);
  const needsReply = new Set(replies.map(row => row.index));
  const protectedItems = new Set([...needsReply, ...urgent.map(row => row.index)]);
  const proposed = new Set(Array.isArray(result.cleanup) ? result.cleanup.filter(valid) : []);
  const cleanup = items.flatMap((item, index) =>
    !protectedItems.has(index) && (item.cleanup || (item.canClear && proposed.has(index))) ? [index] : [],
  );
  const seenTargets = new Set<string>();
  const drafts: CatchUpResult['drafts'] = [];
  for (const entry of Array.isArray(result.drafts) ? result.drafts : []) {
    if (!entry || !valid(entry.index) || !needsReply.has(entry.index)) continue;
    const target = items[entry.index].replyTarget;
    const draft = text(entry.text, 1000);
    if (!target || !draft) continue;
    const key = replyTargetKey(target);
    if (seenTargets.has(key)) continue;
    seenTargets.add(key);
    drafts.push({ index: entry.index, text: draft });
  }
  return { answer: text(result.answer, 2500), urgent, replies, cleanup, drafts, showCleanup: result.showCleanup === true };
}

export function replyTargetKey(target: { tokenId: number; commentId: string }) {
  return target.tokenId + ':' + target.commentId;
}

export function catchUpPayload<T extends NotificationSource>(items: CatchUpItem<T>[], question: string, language: string) {
  return JSON.stringify({
    question,
    language,
    now: new Date().toISOString(),
    notifications: items.map((item, index) => ({
      index,
      type: item.source.type,
      sender: item.sender.slice(0, 80),
      displayName: item.source.actor?.displayName?.slice(0, 80),
      text: item.preview,
      receivedAt: item.source.createdAt,
      canNeedReply: item.canNeedReply,
      canDraft: !!item.replyTarget,
      canClear: item.canClear,
    })),
  });
}
