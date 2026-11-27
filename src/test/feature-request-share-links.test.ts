/**
 * A request on the Requests board is not a post. Its share button used to fall
 * back to /app/post/<request id>, which no post route can answer, so every
 * shared request unfurled and opened as Not Found.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('feature request share links', () => {
  it('shares a request as its board link, not as a post', () => {
    const page = read('src/pages/app/FeaturesPage.tsx');
    expect(page).toContain('shareUrl={dehubLinkFor.featureRequest(feature.id)}');
    expect(read('src/lib/dehub-links.ts')).toContain('/build?feature=${encodeURIComponent(id)}');
  });

  it('pins the request for either query name', () => {
    expect(read('src/pages/app/FeaturesPage.tsx')).toContain(
      "searchParams.get('request') ?? searchParams.get('feature')",
    );
  });

  it('sends old /app/post/<request id> links to the board', () => {
    const worker = read('CLOUDFLARE_WORKER_SEO.js');
    const match = worker.match(/const requestAsPost = trimmedPath\.match\((\/.+\/i)\);/);
    expect(match).not.toBeNull();
    // eslint-disable-next-line no-new-func
    const re = new Function(`return ${match![1]}`)() as RegExp;
    expect(re.test('/app/post/9cea24f0-db7e-498f-ad41-829bff08840e')).toBe(true);
    expect(re.test('/post/9cea24f0-db7e-498f-ad41-829bff08840e')).toBe(true);
    expect(re.test('/app/post/42')).toBe(false);
    expect(re.test('/app/post/a-readable-article-slug')).toBe(false);
    expect(read('src/pages/app/SinglePostPage.tsx')).toContain('FEATURE_REQUEST_ID.test(postId)');
  });
});
