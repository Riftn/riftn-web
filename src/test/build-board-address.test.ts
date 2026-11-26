/**
 * The Build board lives at /build. Its older addresses (/features, /requests
 * and their /app twins) 301 there in one hop with the query intact, so shared
 * request links keep opening the same request, and the board unfurls with the
 * Build card.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

const ROOT = resolve(__dirname, '../..');

function makeEnv() {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response('<!doctype html><html><head><title>Riftn</title></head><body><div id="root"></div></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })),
    },
  };
}

async function get(path: string, ua = 'Twitterbot/1.0') {
  const res = await worker.fetch(
    new Request(`https://riftn.com${path}`, { headers: { 'User-Agent': ua } }),
    makeEnv(),
    { waitUntil() {} },
  );
  return {
    status: res.status,
    location: res.headers.get('Location'),
    body: res.status >= 300 && res.status < 400 ? '' : await res.text(),
  };
}

const ID = '9cea24f0-1234-4abc-8def-0123456789ab';

describe('Build board address', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: Request | URL | string) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith('/feature_requests')) {
        const found = url.searchParams.get('id') === 'eq.' + ID;
        return Response.json(found ? [{ id: ID }] : []);
      }
      return new Response('Not found', { status: 404 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns a real 404 for an unknown request UUID', async () => {
    const { status } = await get('/app/post/00000000-0000-0000-0000-000000000000');
    expect(status).toBe(404);
  });

  it.each([
    ['/features', 'https://riftn.com/build'],
    ['/app/features', 'https://riftn.com/build'],
    ['/requests', 'https://riftn.com/build'],
    ['/app/requests', 'https://riftn.com/build'],
    ['/app/build', 'https://riftn.com/build'],
    [`/features?feature=${ID}`, `https://riftn.com/build?feature=${ID}`],
    [`/app/features?request=${ID}&comments=1&comment=c9`, `https://riftn.com/build?request=${ID}&comments=1&comment=c9`],
    ['/features?tab=shipped', 'https://riftn.com/build?tab=shipped'],
    [`/app/post/${ID}`, `https://riftn.com/build?feature=${ID}`],
  ])('%s forwards to %s', async (from, to) => {
    for (const ua of ['Twitterbot/1.0', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)']) {
      const res = await get(from, ua);
      expect(res.status).toBe(301);
      expect(res.location).toBe(to);
    }
  });

  it('unfurls /build with the Build card and its own canonical', async () => {
    const res = await get('/build');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Build Riftn by talking to it | Riftn');
    expect(res.body).toMatch(/<meta property="og:image" content="https:\/\/riftn\.com\/og\/build\.jpg\?v=\d+">/);
    expect(res.body).toContain('<link rel="canonical" href="https://riftn.com/build"');
    expect(existsSync(resolve(ROOT, 'public/og/build.jpg'))).toBe(true);
  });
});
