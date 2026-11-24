import { beforeEach, describe, expect, it, vi } from 'vitest';

const getNFTInfo = vi.fn();
const checkRemix = vi.fn();
vi.mock('@/lib/api/dehub', () => ({ getNFTInfo: (id: string) => getNFTInfo(id) }));
vi.mock('@/lib/remix-links', () => ({ checkRemix: (id: string, kind: string) => checkRemix(id, kind) }));

const { checkRemixSource } = await import('../checkRemixSource');
const url = 'https://riftn.com/app/post/42';

describe('checkRemixSource', () => {
  beforeEach(() => {
    getNFTInfo.mockReset();
    checkRemix.mockReset().mockResolvedValue({ allowed: true });
  });

  it('only lets "who can quote" decide duets', async () => {
    getNFTInfo.mockResolvedValue({ postType: 'video', visibility: 'public', quotePolicy: 'nobody' });
    await expect(checkRemixSource(url, 'duet')).rejects.toThrow();
    await expect(checkRemixSource(url, 'stitch')).resolves.toBeUndefined();
    await expect(checkRemixSource(url, 'react')).resolves.toBeUndefined();
    await expect(checkRemixSource(url, 'green-screen')).resolves.toBeUndefined();
  });

  it('leaves followers-only quoting to the server check', async () => {
    getNFTInfo.mockResolvedValue({ postType: 'video', visibility: 'public', quotePolicy: 'followers' });
    await expect(checkRemixSource(url, 'duet')).resolves.toBeUndefined();
    expect(checkRemix).toHaveBeenCalledWith('42', 'duet');
    checkRemix.mockResolvedValue({ allowed: false, reason: 'Only the creator’s followers can do this.' });
    await expect(checkRemixSource(url, 'duet')).rejects.toThrow('followers');
  });

  it('still blocks gated and private videos', async () => {
    getNFTInfo.mockResolvedValue({ postType: 'video', visibility: 'public', is_ppv: true });
    await expect(checkRemixSource(url, 'stitch')).rejects.toThrow();
    getNFTInfo.mockResolvedValue({ postType: 'video', visibility: 'followers' });
    await expect(checkRemixSource(url, 'react')).rejects.toThrow();
  });
});
