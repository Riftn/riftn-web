import { describe, expect, it } from 'vitest';
import type { LiveStream } from '@/lib/api/dehub/livestream';
import { liveSwipeDirection, liveSwipeRoomIds } from './room-swipe';

const id = (n: number) => String(n).padStart(24, '0');
const row = (n: number, extra = {}): LiveStream => ({
  _id: id(n), status: 'live', playbackId: 'public', address: 'viewer', ...extra,
} as LiveStream);

describe('live room swiping', () => {
  it('keeps public room order and skips replays, duplicates, blocked creators and access gates', () => {
    const rooms = [
      row(3), row(3), row(9, { status: 'ended' }), row(8, { visibility: 'unlisted' }),
      row(7, { streamInfo: '{"isPayPerView":true}' }), row(6, { streamInfo: '[]' }),
      row(5, { plansDetails: [{}] }), row(4, { account: { address: 'BLOCKED' } }),
      row(2, { streamInfo: '{}' }), row(1, { isLocked: true }),
    ];
    expect(liveSwipeRoomIds(rooms, new Set(['blocked']))).toEqual([id(3), id(2)]);
  });

  it('pages up and down and rejects short or horizontal drags', () => {
    expect(liveSwipeDirection(-8, -52)).toBe(1);
    expect(liveSwipeDirection(8, 52)).toBe(-1);
    expect(liveSwipeDirection(0, 40)).toBeNull();
    expect(liveSwipeDirection(84, -52)).toBeNull();
  });
});
