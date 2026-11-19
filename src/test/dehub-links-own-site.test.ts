import { describe, expect, it } from 'vitest';
import { ownSitePath } from '@/lib/dehub-links';

describe('ownSitePath', () => {
  it('gives the in-site path for our own links, even ones with no card', () => {
    expect(ownSitePath('https://riftn.com/newpost/12?ref=AB')).toBe('/newpost/12?ref=AB');
    expect(ownSitePath('riftn.com/app/shorts')).toBe('/app/shorts');
    expect(ownSitePath('https://dehub.io/app/post/5')).toBe('/app/post/5');
  });

  it('leaves other sites and our separate subdomains alone', () => {
    expect(ownSitePath('https://example.com/app/post/5')).toBeNull();
    expect(ownSitePath('https://staging.dehub.io/app/post/5')).toBeNull();
  });
});
