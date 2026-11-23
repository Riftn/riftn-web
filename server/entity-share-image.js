import { Resvg } from '@resvg/resvg-wasm';
import { resvgReady } from './resvg.js';
import { ENTITY_ART, ENTITY_CARD_VERSION, entityCardProps, entityQuery, renderEntityCardSvg } from './entity-share-card.js';

const SHARE_IMAGE = 'https://riftn.com/og/riftn-share.png';
const FONTS = ['/brand-kit/font/manrope-500.ttf', '/brand-kit/font/manrope-700.ttf', '/brand-kit/font/mono.ttf'];
const TYPES = { jpg: 'image/jpeg', png: 'image/png' };
let fonts;
const files = new Map();

function loadFile(env, path) {
  if (!files.has(path)) files.set(path, (async () => {
    const response = await env.ASSETS.fetch(new Request(`https://riftn.com${path}`));
    if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) throw new Error(`Share card asset unavailable: ${path}`);
    return new Uint8Array(await response.arrayBuffer());
  })().catch((error) => { files.delete(path); throw error; }));
  return files.get(path);
}

async function dataUri(env, path) {
  try {
    const bytes = await loadFile(env, path);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${TYPES[path.split('.').pop()]};base64,${btoa(binary)}`;
  } catch { return ''; }
}

function loadFonts(env) {
  if (!fonts) fonts = Promise.all(FONTS.map((path) => loadFile(env, path))).catch((error) => { fonts = undefined; throw error; });
  return fonts;
}

/** /_og/<kind>/v1/<id>.png: rendered from the live row, cached under a fingerprint of what it shows. */
export async function handleEntityShareImage(request, env, ctx, kind, id, lookup) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' };
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers });
  const fallback = () => Response.redirect(SHARE_IMAGE, 302);
  try {
    const query = entityQuery(kind, id);
    const props = query ? entityCardProps(kind, await lookup(query)) : null;
    if (!props) return fallback();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ revision: 2, kind, props })));
    const fingerprint = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    const key = new Request(`https://riftn.com/_og/${kind}/${ENTITY_CARD_VERSION}/${encodeURIComponent(id)}.png?data=${fingerprint}`);
    const cache = typeof caches !== 'undefined' ? caches.default : undefined;
    const publicCache = 'public, max-age=60, s-maxage=300';
    const cached = await cache?.match(key);
    if (cached) {
      const hit = new Response(request.method === 'HEAD' ? null : cached.body, cached);
      hit.headers.set('Cache-Control', publicCache);
      return hit;
    }
    const [, fontBuffers, logo, backdrop, art] = await Promise.all([
      resvgReady(), loadFonts(env), dataUri(env, '/brand-kit/brand/riftn-logo-white.png'),
      dataUri(env, '/brand-kit/bg/bg-12.jpg'), dataUri(env, `/brand-kit/icons/${ENTITY_ART[kind]}.png`),
    ]);
    const renderer = new Resvg(renderEntityCardSvg(props, { logo, backdrop, art }), { font: { fontBuffers, defaultFontFamily: 'Manrope' } });
    let png;
    try { const rendered = renderer.render(); png = rendered.asPng(); rendered.free(); }
    finally { renderer.free(); }
    const response = new Response(png, { headers: {
      ...headers, 'Content-Type': 'image/png', 'Cache-Control': publicCache,
      'ETag': `"${ENTITY_CARD_VERSION}-${fingerprint}"`, 'X-DeHub-Share-Card': `${kind}-${ENTITY_CARD_VERSION}`,
    } });
    if (cache) {
      const stored = new Response(response.clone().body, response);
      stored.headers.set('Cache-Control', 'public, max-age=604800, immutable');
      ctx.waitUntil(cache.put(key, stored).catch(() => {}));
    }
    return request.method === 'HEAD' ? new Response(null, response) : response;
  } catch (error) {
    console.error('[Entity share image]', error);
    return fallback();
  }
}
