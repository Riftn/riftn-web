import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiCallMock } = vi.hoisted(() => ({ apiCallMock: vi.fn() }));
vi.mock('@/lib/api/dehub/core', () => ({ apiCall: apiCallMock }));
vi.mock('@/lib/media-url', () => ({ buildAvatarUrl: () => null }));
vi.mock('@/lib/assistant', () => ({
  ASSISTANT_AVATAR: '',
  isAssistantAddress: (address?: string) => address === '0xbot',
}));

import {
  AnswerCache,
  fetchPeople,
  guessPeople,
  mentionMatchRank,
  normalizeMentionQuery,
  rememberMentionPick,
  resetMentionPeople,
  settledPeople,
  toMentionUser,
  warmMentionPeople,
} from '@/lib/mention-people';

const row = (username: string, displayName?: string) => ({ username, displayName, address: `0x${username}` });
const names = (users: Array<{ username: string }>) => users.map((u) => u.username);

describe('AnswerCache', () => {
  it('reuses a fresh answer and narrows from the longest earlier text', () => {
    const cache = new AnswerCache<string>(1000, 5000);
    cache.set('m', ['mal', 'mia'], 0);
    cache.set('ma', ['mal'], 0);
    expect(cache.fresh('ma', 500)).toEqual(['mal']);
    expect(cache.fresh('ma', 1500)).toBeNull();
    expect(cache.fromPrefix('mal', 1500)).toEqual(['mal']);
    expect(cache.fromPrefix('mi', 1500)).toEqual(['mal', 'mia']);
    expect(cache.fromPrefix('x', 1500)).toEqual([]);
    expect(cache.fromPrefix('mal', 6000)).toEqual([]);
  });

  it('drops the oldest answer once full', () => {
    const cache = new AnswerCache<string>(1000, 5000, 2);
    cache.set('a', ['a'], 0);
    cache.set('b', ['b'], 0);
    cache.set('c', ['c'], 0);
    expect(cache.fresh('a', 1)).toBeNull();
    expect(cache.fresh('c', 1)).toEqual(['c']);
  });
});

describe('mention people', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('dehub_wallet', '0xME');
    resetMentionPeople();
    apiCallMock.mockReset();
  });

  it('reads the letters the way the server does', () => {
    expect(normalizeMentionQuery(' @Mal ')).toBe('mal');
    expect(mentionMatchRank({ username: 'mal', displayName: null }, 'mal')).toBe(0);
    expect(mentionMatchRank({ username: 'maldo', displayName: null }, 'mal')).toBe(1);
    expect(mentionMatchRank({ username: 'x', displayName: 'Big Mal' }, 'mal')).toBe(2);
    expect(mentionMatchRank({ username: 'animal', displayName: null }, 'mal')).toBe(3);
    expect(mentionMatchRank({ username: 'zed', displayName: null }, 'mal')).toBe(-1);
  });

  it('answers the next letter from the last answer while the server is asked', async () => {
    apiCallMock.mockResolvedValueOnce({ result: [row('mal'), row('mia'), row('max')] });
    await fetchPeople('m');
    expect(settledPeople('m')).not.toBeNull();
    expect(settledPeople('ma')).toBeNull();
    expect(names(guessPeople('ma'))).toEqual(['mal', 'max']);
  });

  it('asks once for the same letters and not again while the answer is fresh', async () => {
    apiCallMock.mockResolvedValue({ result: [row('mal')] });
    await Promise.all([fetchPeople('ma'), fetchPeople('ma')]);
    await fetchPeople('ma');
    expect(apiCallMock).toHaveBeenCalledTimes(1);
  });

  it('offers recent picks, then the stored short list, before anyone else', async () => {
    apiCallMock.mockImplementation((endpoint: string) =>
      Promise.resolve(endpoint.includes('mention_seed')
        ? { result: [row('sam_followed'), row('sara')] }
        : { result: [row('sam_stranger')] }));
    warmMentionPeople();
    await vi.waitFor(() => expect(names(guessPeople('sa'))).toEqual(['sam_followed', 'sara']));
    await fetchPeople('s');
    rememberMentionPick(toMentionUser(row('sam_picked')));
    expect(names(guessPeople('sam'))).toEqual(['sam_picked', 'sam_followed', 'sam_stranger']);

    // A new page load starts from what was stored, with no request at all.
    resetMentionPeople();
    apiCallMock.mockClear();
    expect(names(guessPeople('sam'))).toEqual(['sam_picked', 'sam_followed']);
    warmMentionPeople();
    expect(apiCallMock).not.toHaveBeenCalled();
  });

  it('keeps one account from seeing another account’s people', async () => {
    rememberMentionPick(toMentionUser(row('mine')));
    localStorage.setItem('dehub_wallet', '0xOTHER');
    expect(guessPeople('mi')).toEqual([]);
  });

  it('puts the assistant first, then the handle typed in full', async () => {
    apiCallMock.mockResolvedValueOnce({ result: [row('riftnfan'), row('riftn'), { username: 'riftn_ai', address: '0xbot' }] });
    await fetchPeople('r');
    expect(names(guessPeople('riftn'))).toEqual(['riftn_ai', 'riftn', 'riftnfan']);
  });
});
