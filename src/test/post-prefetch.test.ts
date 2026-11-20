import { describe, it, expect, beforeEach } from 'vitest';
import { takePrefetchedPost } from '@/lib/post-prefetch';

type W = Window & { __postPrefetch?: unknown };

function prefetch(id: string, body: unknown, extra: Record<string, unknown> = {}) {
  (window as W).__postPrefetch = { id, at: Date.now(), signedIn: false, p: Promise.resolve(body), ...extra };
}

describe('post link prefetch', () => {
  beforeEach(() => {
    localStorage.clear();
    (window as W).__postPrefetch = undefined;
  });

  it('hands over the post asked for during page load, once', async () => {
    prefetch('8092', { result: { tokenId: 8092, name: 'hello' } });
    expect(await takePrefetchedPost('8092')).toMatchObject({ tokenId: 8092, name: 'hello' });
    expect(await takePrefetchedPost('8092')).toBeNull();
  });

  it('ignores another post, an old answer, a failed request and a changed sign-in', async () => {
    prefetch('1', { result: { tokenId: 1 } });
    expect(await takePrefetchedPost('2')).toBeNull();
    prefetch('1', { result: { tokenId: 1 } }, { at: Date.now() - 60_000 });
    expect(await takePrefetchedPost('1')).toBeNull();
    prefetch('1', null);
    expect(await takePrefetchedPost('1')).toBeNull();
    localStorage.setItem('dehub_token', 'x');
    prefetch('1', { result: { tokenId: 1 } });
    expect(await takePrefetchedPost('1')).toBeNull();
  });
});
