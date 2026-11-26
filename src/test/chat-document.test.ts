// @vitest-environment node
import { describe, expect, it } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

const shell = '<!doctype html><html lang="en"><head></head><body><div id="root"><div class="bskel-chat"></div><!--home-intro-start--><div data-prerendered-intro><img src="/brand-kit/icons/globe-480.webp"></div><!--home-intro-end--></div><script type="module" src="/assets/app.js"></script></body></html>';

function requestDocument(path: string) {
  return worker.fetch(new Request(`https://riftn.com${path}`, {
    headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36' },
  }), {
    ASSETS: {
      async fetch(input: Request | URL) {
        if (new URL(input instanceof URL ? input : input.url).pathname === '/seo-i18n.json') {
          return Response.json({});
        }
        return new Response(shell, {
          headers: { 'Content-Type': 'text/html', 'Content-Length': String(shell.length), ETag: '"shell"' },
        });
      },
    },
  }, { waitUntil() {} });
}

describe('chat startup document', () => {
  it.each(['/chat', '/chat?chat=public'])('omits the homepage artwork at %s', async path => {
    const response = await requestDocument(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('ETag')).toBeNull();
    expect(response.headers.get('Content-Length')).toBeNull();
    const html = await response.text();
    expect(html).toContain('class="bskel-chat"');
    expect(html).toContain('src="/assets/app.js"');
    expect(html).not.toContain('/brand-kit/icons/');
  });

  it('keeps the prerendered artwork on the homepage', async () => {
    const response = await requestDocument('/?app=1');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('/brand-kit/icons/globe-480.webp');
  });
});
