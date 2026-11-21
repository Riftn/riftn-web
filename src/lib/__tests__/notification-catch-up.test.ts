import { expect, test } from 'vitest';
import { catchUpItem, readCatchUpResult } from '../notification-catch-up';

const wallet = '0xviewer';
function row(id: string, type: string, content: string, fullText = true) {
  return catchUpItem({
    _id: id, type, content, createdAt: '2026-11-21', updatedAt: '2026-11-21', read: false,
    tokenId: 1, actorAddress: '0xsender', commentId: 2,
    comment: fullText ? { id: 2, content } : undefined,
    commentPreview: fullText ? undefined : content,
  }, wallet);
}

test('keeps reaction-only and acknowledgment rows out of reply drafts', () => {
  const items = [
    row('urgent', 'comment_reply', 'Can you get this to me before noon?'),
    row('thanks', 'comment_reply', 'Thanks! 🙌'),
    row('emoji', 'comment', '👍'),
    row('reaction', 'like', 'Liked your post'),
    row('thin', 'comment_reply', 'Are you available', false),
  ];
  const result = readCatchUpResult(JSON.stringify({
    answer: 'One request',
    urgent: [{ index: 0, reason: 'Due before noon' }],
    replies: [0, 1, 2, 3].map(index => ({ index, reason: 'Reply' })),
    cleanup: [0, 1, 2, 3, 4, 99],
    drafts: [0, 1, 2, 3, 99].map(index => ({ index, text: 'A draft' })),
  }), items);
  expect(result.cleanup).toEqual([1, 2, 3]);
  expect(result.replies.map(item => item.index)).toEqual([0]);
  expect(result.drafts.map(item => item.index)).toEqual([0]);
});

test('reduces duplicate mentions and replies to one draft for the same comment', () => {
  const items = [
    row('reply', 'comment_reply', 'Please send the details'),
    row('mention', 'mention', 'Please send the details'),
  ];
  const result = readCatchUpResult(JSON.stringify({
    answer: 'Please send the details',
    replies: items.map((_, index) => ({ index, reason: 'A direct request' })),
    drafts: items.map((_, index) => ({ index, text: 'Which details are you looking for?' })),
  }), items);
  expect(result.drafts).toHaveLength(1);
});
