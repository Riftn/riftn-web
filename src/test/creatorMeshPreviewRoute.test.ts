import { describe, expect, it, vi } from 'vitest';
import worker from '../../CLOUDFLARE_WORKER_SEO.js';

describe('3D preview page route', () => {
  it.each(['/creator-mesh-preview.html', '/creator-mesh-preview'])('serves %s straight from assets', async (path) => {
    const fetch = vi.fn().mockResolvedValue(new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }));
    const response = await worker.fetch(new Request(`https://riftn.com${path}`), { ASSETS: { fetch } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(new URL((fetch.mock.calls[0][0] as Request).url).pathname).toBe('/creator-mesh-preview');
    expect(response.status).toBe(200);
  });

  it.each(['/binary-metal/render.html', '/binary-metal/render'])('serves the Binary Metal renderer %s straight from assets', async (path) => {
    const fetch = vi.fn().mockResolvedValue(new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }));
    const response = await worker.fetch(new Request(`https://riftn.com${path}`), { ASSETS: { fetch } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(new URL((fetch.mock.calls[0][0] as Request).url).pathname).toBe('/binary-metal/render');
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
