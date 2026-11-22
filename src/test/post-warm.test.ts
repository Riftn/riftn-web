import { describe, it, expect, beforeEach, vi } from 'vitest';

const getNFTInfo = vi.fn();
vi.mock('@/lib/api/dehub', () => ({ getNFTInfo: (id: string) => getNFTInfo(id) }));

import { warmPostData, loadPostData, takeWarmPostData, __resetPostWarm } from '@/lib/post-warm';

describe('post data warmed on tap', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetPostWarm();
    getNFTInfo.mockReset();
    getNFTInfo.mockImplementation(async (id: string) => ({ tokenId: Number(id), name: `post ${id}` }));
  });

  it('starts the request on tap and the page joins it instead of asking again', async () => {
    warmPostData(42);
    warmPostData('42');
    expect(getNFTInfo).toHaveBeenCalledTimes(1);
    expect(await loadPostData('42')).toMatchObject({ tokenId: 42 });
    expect(getNFTInfo).toHaveBeenCalledTimes(1);
  });

  it('is used once, so a later refetch goes to the network', async () => {
    warmPostData(7);
    await loadPostData('7');
    await loadPostData('7');
    expect(getNFTInfo).toHaveBeenCalledTimes(2);
  });

  it('skips slugs and falls back when the warm request failed', async () => {
    warmPostData('some-article-slug');
    expect(getNFTInfo).not.toHaveBeenCalled();
    getNFTInfo.mockRejectedValueOnce(new Error('down'));
    warmPostData(9);
    expect(await takeWarmPostData('9')).toBeNull();
    expect(await loadPostData('9')).toMatchObject({ tokenId: 9 });
  });

  it('drops an answer made before a sign-in change', async () => {
    warmPostData(5);
    localStorage.setItem('dehub_token', 'x');
    expect(await takeWarmPostData('5')).toBeNull();
  });
});
