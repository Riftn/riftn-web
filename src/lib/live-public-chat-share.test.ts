import { describe, expect, it } from 'vitest';
import type { LiveStream } from '@/types/feed.types';
import type { DeHubNFT } from '@/lib/api/dehub/types';
import { canDraftPublicLivePost, publicChatShareTokenId } from './live-public-chat-share';

const stream = { id: 'stream-id', tokenId: '42', isLive: true } as LiveStream;

describe('Public Chat as a live share destination', () => {
  it('uses the post id for an on-air stream or an available replay', () => {
    expect(publicChatShareTokenId(stream)).toBe('42');
    expect(publicChatShareTokenId({ ...stream, isLive: false, replayUrl: 'recording.mp4' })).toBe('42');
    expect(publicChatShareTokenId({ ...stream, id: '43', tokenId: undefined })).toBe('43');
  });

  it('omits unavailable streams and posts with a limited audience', () => {
    expect(publicChatShareTokenId({ ...stream, isLive: false })).toBeUndefined();
    expect(publicChatShareTokenId({ ...stream, tokenId: undefined })).toBeUndefined();
    expect(publicChatShareTokenId({ ...stream, visibility: 'followers' })).toBeUndefined();
    expect(publicChatShareTokenId({ ...stream, isPPV: true })).toBeUndefined();
    expect(publicChatShareTokenId({ ...stream, isLocked: true, lockedPrice: 10 })).toBeUndefined();
  });

  it('checks the canonical post before drafting a link', () => {
    const post = { tokenId: 42 } as DeHubNFT;
    expect(canDraftPublicLivePost(post, '42')).toBe(true);
    expect(canDraftPublicLivePost(post, '43')).toBe(false);
    expect(canDraftPublicLivePost({ ...post, visibility: 'direct' }, '42')).toBe(false);
    expect(canDraftPublicLivePost({ ...post, isHidden: true }, '42')).toBe(false);
    expect(canDraftPublicLivePost({ ...post, plans: ['plan'] }, '42')).toBe(false);
  });
});
