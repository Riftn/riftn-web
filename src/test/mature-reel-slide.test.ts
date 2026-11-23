import { describe, expect, it } from 'vitest';
import { toReelShort } from '@/lib/profile-reel';
import { asViewerSlide, mapToShortVideo } from '@/lib/short-video';

const post = { tokenId: 42, postType: 'short', videoUrl: 'https://example.org/video.mp4', imageUrl: 'https://example.org/poster.jpg' };

describe('mature posts in Shorts', () => {
  it.each([false, true])('covers mature media in the Shorts feed and profile reel (paid=%s)', (paid) => {
    const row = { ...post, contentRating: 'mature', streamInfo: { isPayPerView: paid } };
    for (const short of [asViewerSlide(mapToShortVideo(row, 0)), toReelShort(row, 0)]) {
      expect(short).toMatchObject({ id: '42', reelPost: { kind: 'mature' }, videoUrl: '', thumbnail: '', gated: paid });
      expect(short?.hlsUrl).toBeUndefined();
    }
  });

  it('preserves the distinction between a playable standard video and a paid post', () => {
    expect(toReelShort(post, 0)?.videoUrl).toBe(post.videoUrl);
    expect(toReelShort(post, 0)?.reelPost).toBeUndefined();
    expect(toReelShort({ ...post, streamInfo: { isPayPerView: true } }, 0)?.reelPost?.kind).toBe('locked');
  });
});
