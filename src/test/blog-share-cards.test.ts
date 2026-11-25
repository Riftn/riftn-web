/**
 * Blog posts: clean addresses, their own share card, and complete crawler
 * markup.
 *
 * - Every published post has a banner drawn with the house banner kit
 *   (.agents/skills/dehub-poster), the file exists, and it has alt text. The
 *   banner is the post's share card, so a post without one would unfurl as a
 *   generic image in every chat it is pasted into.
 * - No published slug carries the old "---a-dehub-milestone-from-q2-2025"
 *   tail or a doubled dash, and the old long URLs 301 to the clean one in a
 *   single hop.
 * - The edge page for a post carries the post's own image as og:image, a
 *   description short enough to show in full, and BlogPosting markup.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';
import { MILESTONE_REDIRECTS, cleanBlogSlug } from '@/lib/blog-redirects.js';

const ROOT = resolve(__dirname, '../..');
type ManifestPost = {
  slug: string;
  title: string;
  excerpt?: string;
  seoDescription?: string;
  bannerImage?: string;
  bannerImageAlt?: string;
  bannerWidth?: number;
  bannerHeight?: number;
};
const MANIFEST_TEXT = readFileSync(resolve(ROOT, 'public/blog-manifest.json'), 'utf8');
const manifest: ManifestPost[] = JSON.parse(MANIFEST_TEXT);

const OLD_SLUG = 'get-ready-players-final-snapshot-for-last-chad-standing-airdrop---a-dehub-milestone-from-q2-2025';
const NEW_SLUG = 'get-ready-players-final-snapshot-for-last-chad-standing-airdrop';

function makeEnv() {
  return {
    ASSETS: {
      fetch: vi.fn(async (input: Request | URL | string) => {
        const u = new URL(typeof input === 'string' ? input : 'url' in input ? input.url : input.href);
        if (u.pathname === '/blog-manifest.json') {
          return new Response(MANIFEST_TEXT, { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const content = u.pathname.match(/^\/blog-content\/(.+)\.json$/);
        if (content) {
          const file = resolve(ROOT, 'public/blog-content', `${decodeURIComponent(content[1])}.json`);
          if (existsSync(file)) {
            return new Response(readFileSync(file, 'utf8'), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }
        if (u.pathname.startsWith('/guides/')) {
          return new Response('<html lang="en"><head><title>Riftn</title><meta name="description" content="Riftn home"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>', {
            headers: { 'Content-Type': 'text/html' },
          });
        }
        return new Response('nope', { status: 404 });
      }),
    },
  };
}

async function get(path: string) {
  const res = await worker.fetch(
    new Request(`https://riftn.com${path}`, { headers: { 'User-Agent': 'Twitterbot/1.0' } }),
    makeEnv(),
    { waitUntil() {} },
  );
  return {
    status: res.status,
    location: res.headers.get('Location'),
    body: res.status >= 300 && res.status < 400 ? '' : await res.text(),
  };
}

const meta = (html: string, key: string) =>
  (html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`)) || [])[1];

describe('blog share cards', () => {
  it('every published post has its own banner file with alt text', () => {
    for (const p of manifest) {
      expect(p.bannerImage, p.slug).toMatch(/^\/media\//);
      expect(existsSync(resolve(ROOT, 'public', p.bannerImage!.slice(1))), p.bannerImage).toBe(true);
      expect((p.bannerImageAlt || '').trim().length, p.slug).toBeGreaterThan(0);
      expect(p.bannerWidth, p.slug).toBeGreaterThan(0);
      expect(p.bannerHeight, p.slug).toBeGreaterThan(0);
    }
  });

  it('no two posts share a banner', () => {
    const banners = manifest.map((p) => p.bannerImage);
    expect(new Set(banners).size).toBe(banners.length);
  });

  it("uses the post's own banner as og:image, as a 1200x630 card", async () => {
    const res = await get(`/guides/${NEW_SLUG}`);
    expect(res.status).toBe(200);
    const post = manifest.find((p) => p.slug === NEW_SLUG)!;
    const image = meta(res.body, 'og:image');
    expect(image).toBe('https://riftn.com/_og/blog-card/' + NEW_SLUG + '.jpg');
    expect(meta(res.body, 'twitter:image')).toBe(image);
    expect(meta(res.body, 'og:image:alt')).toBe(post.bannerImageAlt);
    expect(meta(res.body, 'twitter:card')).toBe('summary_large_image');
  });

  it('advertises a 1200 by 630 first-party card for wide banners', async () => {
    const odd = manifest.find((p) => p.bannerWidth! / p.bannerHeight! > 2.2)!;
    expect(odd).toBeTruthy();
    const res = await get(`/guides/${odd.slug}`);
    expect(meta(res.body, 'og:image')).toBe('https://riftn.com/_og/blog-card/' + odd.slug + '.jpg');
    expect(meta(res.body, 'og:image:width')).toBe('1200');
    expect(meta(res.body, 'og:image:height')).toBe('630');
  });
});

describe('clean blog slugs', () => {
  it('no published slug carries the milestone tail or a doubled dash', () => {
    for (const p of manifest) {
      expect(p.slug).not.toMatch(/--|a-dehub-milestone-from-q\d/);
      expect(cleanBlogSlug(p.slug)).toBe(p.slug);
    }
  });

  it('the sitemap and RSS list only clean slugs', () => {
    for (const file of ['public/sitemap-static.xml', 'public/rss.xml']) {
      expect(readFileSync(resolve(ROOT, file), 'utf8')).not.toMatch(/guides\/[^<"]*(--|a-dehub-milestone-from-q)/);
    }
  });

  it('301s an old long URL to the clean one in one hop', async () => {
    for (const path of [`/guides/${OLD_SLUG}`, `/docs/blog/${OLD_SLUG}`, `/blog/${OLD_SLUG}`]) {
      const res = await get(path);
      expect(res.status, path).toBe(301);
      expect(res.location, path).toBe(`https://riftn.com/guides/${NEW_SLUG}`);
    }
  });

  it('still sends a superseded milestone to the post that replaced it', async () => {
    const [from, to] = Object.entries(MILESTONE_REDIRECTS)[0];
    const res = await get(`/guides/${from}`);
    expect(res.status).toBe(301);
    expect(res.location).toBe(`https://riftn.com/guides/${to}`);
  });
});

describe('blog post crawler markup', () => {
  it('gives browser navigations the article and preserves the app entry', async () => {
    const response = await worker.fetch(new Request('https://riftn.com/guides/' + NEW_SLUG, {
      headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 Chrome/149.0.0.0 Safari/537.36' },
    }), makeEnv(), { waitUntil() {} });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('edge-public-content');
    expect(html).toContain('<article>');
    expect(html).toContain('href="https://riftn.com/guides/' + NEW_SLUG + '"');
    expect(html).toContain('src="/assets/app.js"');
    expect(html).not.toContain('content="Riftn home"');
  });

  it('has a short description, canonical, robots and BlogPosting data', async () => {
    const res = await get(`/guides/${NEW_SLUG}`);
    const description = meta(res.body, 'description');
    expect(description.length).toBeLessThanOrEqual(160);
    expect(res.body).toContain(`<link rel="canonical" href="https://riftn.com/guides/${NEW_SLUG}">`);
    expect(meta(res.body, 'robots')).toContain('max-image-preview:large');
    const title = (res.body.match(/<title>([^<]*)<\/title>/) || [])[1];
    expect(title.length).toBeLessThanOrEqual(70);
    const ld = JSON.parse((res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]);
    const article = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'BlogPosting');
    expect(article).toBeTruthy();
    expect(article.image[0]).toMatchObject({ width: 1200, height: 630 });
    expect(article.wordCount).toBeGreaterThan(0);
    expect(res.body).toMatch(/<h1>[^<]+<\/h1>/);
    expect(res.body).toMatch(/<img src="[^"]+" alt="[^"]+" width="\d+" height="\d+"/);
  });
});

describe('article share tags for browser-shaped previewers', () => {
  const SHELL = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

  async function shell(path: string) {
    const env = makeEnv();
    const assets = env.ASSETS.fetch.getMockImplementation()!;
    env.ASSETS.fetch.mockImplementation(async (input: Request | URL | string) => {
      const u = new URL(typeof input === 'string' ? input : 'url' in input ? input.url : input.href);
      if (/^\/(?:guides|docs\/blog|explore)/.test(u.pathname)) {
        return new Response(SHELL, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return assets(input);
    });
    const res = await worker.fetch(new Request(`https://riftn.com${path}`, { headers: { 'User-Agent': CHROME } }), env, { waitUntil() {} });
    return res.text();
  }

  it("the app shell for an article carries the article's title and banner", async () => {
    const post = manifest.find((p) => p.slug === NEW_SLUG)!;
    const html = await shell(`/guides/${NEW_SLUG}?ref=ABC`);
    expect(html).toContain('<div id="root"');
    expect(meta(html, 'og:image')).toContain(post.bannerImage!);
    expect(meta(html, 'twitter:image')).toBe(meta(html, 'og:image'));
    expect(meta(html, 'og:title')).not.toBe('Riftn');
    expect(html).toContain('<meta property="og:type" content="article"');
    expect(meta(html, 'og:url')).toBe(`https://riftn.com/guides/${NEW_SLUG}`);
  });

  it('other app pages keep the default shell', async () => {
    const html = await shell('/explore');
    expect(meta(html, 'og:title')).toBe('Riftn');
  });
});
