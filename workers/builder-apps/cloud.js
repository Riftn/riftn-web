// Riftn Cloud: creators host a whole app (website + backend + database) at
// https://<slug>.dhb.gg.
//
// Each app's code runs as a Dynamic Worker (Worker Loader) in its own isolate,
// with hard CPU and subrequest caps per request. It never sees this Worker's
// bindings: the only things handed to it are its own secrets and two scoped
// bindings, DB (SQL) and KV, that reach the app's own Durable Object and
// nothing else.
//
// Storage, one Durable Object per app (CloudApp, named by slug):
//   - storage KV API: uploaded files per version, secrets, KV values, deploy
//     keys, recent errors. Lives in the reserved _cf_ tables, which the app's
//     own SQL cannot read or drop.
//   - SQLite: the app's database, for the app alone.
// CloudRegistry (one object) maps slug -> owner wallet, version, suspended.
//
// Control API at https://cloud.dhb.gg/v1 (Riftn sign-in token, or a per-app
// deploy key for CI). The riftn.com/apps/dev panel is a thin client over it.

import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

export const CLOUD_LABEL = 'cloud';
const APPS_DOMAIN = 'dhb.gg';
const BUILDER_FUNCTIONS = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/builder-serve';
const AUTH_VERIFY = 'https://api.dehub.io/api/auth/verify';
const APP_COMPAT_DATE = '2026-07-18';

// The free tier. Paid tiers raise these per app later.
export const FREE = {
  apps: 3,
  cpuMs: 100,
  subRequests: 50,
  appBytes: 10_000_000,
  fileBytes: 2_000_000,
  files: 500,
  dbBytes: 500_000_000,
  kvValueBytes: 1_000_000,
  secrets: 50,
};

const RESERVED = new Set([
  'www', 'docs', 'cloud', 'api', 'admin', 'app', 'apps', 'riftn', 'dehub', 'mail', 'status',
  'assets', 'static', 'cdn', 'dev', 'staging', 'auth', 'login', 'support', 'help', 'blog',
]);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const SECRET_RE = /^[A-Z_][A-Z0-9_]{0,63}$/;
const BINDING_NAMES = new Set(['DB', 'KV', 'APP']);

const TYPES = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json',
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', xml: 'application/xml', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm', wasm: 'application/wasm', pdf: 'application/pdf',
  webmanifest: 'application/manifest+json', map: 'application/json',
};
const ext = (path) => (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
const typeOf = (path) => TYPES[ext(path)] || 'application/octet-stream';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  },
});
const fail = (status, error) => json({ error }, status);

export const appUrl = (slug) => `https://${slug}.${APPS_DOMAIN}`;
const registry = (env) => env.CLOUD_REGISTRY.get(env.CLOUD_REGISTRY.idFromName('registry'));
const appObject = (env, slug) => env.CLOUD_APPS.get(env.CLOUD_APPS.idFromName(slug));

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Which uploaded file a URL path maps to, or null. */
export function matchAsset(assets, pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  const candidates = path === '' || path.endsWith('/')
    ? [`${path}index.html`]
    : [path, `${path}.html`, `${path}/index.html`];
  return candidates.find((c) => Object.prototype.hasOwnProperty.call(assets, c)) ?? null;
}

/**
 * Splits an upload into Worker modules and public files. Anything under
 * public/ is served as a file at the same path without the prefix; everything
 * else is code. An upload with no code at all is a plain website.
 */
export function classifyUpload(files, mainHint) {
  const modules = {};
  const assets = {};
  for (const f of files) {
    const path = String(f.path || '').replace(/\\/g, '/').replace(/^\.?\/+/, '');
    if (!path || path.includes('..') || path.length > 200 || /[\0\r\n]/.test(path)) {
      throw new Error(`Bad file name: ${String(f.path).slice(0, 80)}`);
    }
    if (path.startsWith('public/')) {
      const served = path.slice('public/'.length);
      if (served) assets[served] = typeOf(served);
    } else {
      modules[path] = moduleKind(path);
    }
  }
  const isCode = (k) => k === 'js' || k === 'cjs' || k === 'py';
  const hasCode = Object.values(modules).some(isCode);
  let main = null;
  if (hasCode) {
    const preferred = [mainHint, 'index.js', 'worker.js', '_worker.js', 'index.mjs', 'src/index.js', 'dist/index.js', 'server.js',
      'main.py', 'worker.py', 'app.py', 'index.py', 'src/main.py'];
    main = preferred.find((p) => p && isCode(modules[p])) ?? null;
    if (!main) throw new Error('Could not tell which file starts your app. Name it index.js (or main.py), or send "main".');
  } else {
    // No code: every non-public file is part of the website too.
    for (const path of Object.keys(modules)) assets[path] = typeOf(path);
    for (const k of Object.keys(modules)) delete modules[k];
  }
  return { modules, assets, main };
}

function moduleKind(path) {
  const e = ext(path);
  if (e === 'js' || e === 'mjs') return 'js';
  if (e === 'cjs') return 'cjs';
  if (e === 'py') return 'py';
  if (e === 'json') return 'json';
  if (e === 'wasm') return 'wasm';
  if (['txt', 'html', 'htm', 'css', 'md', 'sql', 'svg', 'xml', 'csv'].includes(e)) return 'text';
  return 'data';
}

// ---------------------------------------------------------------- registry

export class CloudRegistry extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS apps (
      slug TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      suspended INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    sql.exec('CREATE INDEX IF NOT EXISTS apps_owner ON apps(owner)');
  }

  lookup(slug) {
    return this.ctx.storage.sql.exec('SELECT slug, owner, name, version, suspended FROM apps WHERE slug = ?', slug).toArray()[0] ?? null;
  }

  listByOwner(owner) {
    return this.ctx.storage.sql.exec('SELECT slug, name, version, suspended, created_at, updated_at FROM apps WHERE owner = ? ORDER BY created_at', owner).toArray();
  }

  listAll() {
    return this.ctx.storage.sql.exec('SELECT slug, owner, name, version, suspended, created_at, updated_at FROM apps ORDER BY updated_at DESC LIMIT 1000').toArray();
  }

  create(slug, owner, name, maxApps) {
    if (this.lookup(slug)) return { error: 'That address is taken.' };
    const count = this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM apps WHERE owner = ?', owner).one().n;
    if (count >= maxApps) return { error: `You can host ${maxApps} apps for now. Delete one to make another.` };
    const now = Date.now();
    this.ctx.storage.sql.exec('INSERT INTO apps (slug, owner, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', slug, owner, name, now, now);
    return { ok: true };
  }

  setVersion(slug, version) {
    this.ctx.storage.sql.exec('UPDATE apps SET version = ?, updated_at = ? WHERE slug = ?', version, Date.now(), slug);
  }

  rename(slug, name) {
    this.ctx.storage.sql.exec('UPDATE apps SET name = ?, updated_at = ? WHERE slug = ?', name, Date.now(), slug);
  }

  setSuspended(slug, suspended) {
    this.ctx.storage.sql.exec('UPDATE apps SET suspended = ?, updated_at = ? WHERE slug = ?', suspended ? 1 : 0, Date.now(), slug);
  }

  remove(slug) {
    this.ctx.storage.sql.exec('DELETE FROM apps WHERE slug = ?', slug);
  }
}

// ---------------------------------------------------------------- one app

export class CloudApp extends DurableObject {
  async meta() {
    return (await this.ctx.storage.get('meta')) ?? null;
  }

  /** Stores a new version. Older versions beyond the previous one are dropped. */
  async deploy(files, mainHint) {
    if (!Array.isArray(files) || !files.length) throw new Error('Send at least one file.');
    if (files.length > FREE.files) throw new Error(`At most ${FREE.files} files per app.`);
    const { modules, assets, main } = classifyUpload(files, mainHint);
    let bytes = 0;
    for (const f of files) {
      const size = f.bytes.byteLength;
      if (size > FREE.fileBytes) throw new Error(`${f.path} is over ${FREE.fileBytes / 1_000_000} MB.`);
      bytes += size;
    }
    if (bytes > FREE.appBytes) throw new Error(`The upload is over ${FREE.appBytes / 1_000_000} MB.`);

    const old = await this.meta();
    const version = (old?.version ?? 0) + 1;
    const entries = {};
    for (const f of files) {
      const path = String(f.path).replace(/\\/g, '/').replace(/^\.?\/+/, '');
      const key = path.startsWith('public/') ? `a:${version}:${path.slice('public/'.length)}`
        : main ? `m:${version}:${path}` : `a:${version}:${path}`;
      entries[key] = f.bytes;
    }
    const keys = Object.keys(entries);
    for (let i = 0; i < keys.length; i += 100) {
      const batch = {};
      for (const k of keys.slice(i, i + 100)) batch[k] = entries[k];
      await this.ctx.storage.put(batch);
    }
    const meta = { version, main, modules, assets, bytes, files: files.length, deployedAt: Date.now() };
    await this.ctx.storage.put('meta', meta);
    if (old?.prevVersion) await this.dropVersion(old.prevVersion);
    await this.ctx.storage.put('meta', { ...meta, prevVersion: old?.version ?? null });
    return { ...meta, prevVersion: old?.version ?? null };
  }

  async dropVersion(version) {
    for (const prefix of [`m:${version}:`, `a:${version}:`]) {
      const listed = await this.ctx.storage.list({ prefix, limit: 1000 });
      const keys = [...listed.keys()];
      for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128));
    }
  }

  /** Everything the loader needs to start this version. */
  async code(version) {
    const meta = await this.meta();
    if (!meta || meta.version !== version || !meta.main) throw new Error('Version not found');
    const modules = {};
    for (const [path, kind] of Object.entries(meta.modules)) {
      const bytes = await this.ctx.storage.get(`m:${version}:${path}`);
      const text = () => new TextDecoder().decode(bytes);
      if (kind === 'js') modules[path] = { js: text() };
      else if (kind === 'cjs') modules[path] = { cjs: text() };
      else if (kind === 'py') modules[path] = { py: text() };
      else if (kind === 'json') {
        try { modules[path] = { json: JSON.parse(text()) }; } catch { modules[path] = { text: text() }; }
      } else if (kind === 'text') modules[path] = { text: text() };
      else if (kind === 'wasm') modules[path] = { wasm: toArrayBuffer(bytes) };
      else modules[path] = { data: toArrayBuffer(bytes) };
    }
    const secrets = (await this.ctx.storage.get('secrets')) ?? {};
    return { main: meta.main, modules, secrets };
  }

  async asset(version, path) {
    const meta = await this.meta();
    if (!meta || meta.version !== version || !meta.assets[path]) return null;
    const bytes = await this.ctx.storage.get(`a:${version}:${path}`);
    if (!bytes) return null;
    return { body: toArrayBuffer(bytes), type: meta.assets[path] };
  }

  async info() {
    const meta = await this.meta();
    const secrets = Object.keys((await this.ctx.storage.get('secrets')) ?? {});
    const errors = (await this.ctx.storage.get('errors')) ?? [];
    let dbBytes = 0;
    try { dbBytes = this.ctx.storage.sql.databaseSize; } catch { /* ignore */ }
    return {
      version: meta?.version ?? 0,
      deployedAt: meta?.deployedAt ?? null,
      main: meta?.main ?? null,
      bytes: meta?.bytes ?? 0,
      files: meta ? [...Object.keys(meta.modules), ...Object.keys(meta.assets).map((p) => `public/${p}`)] : [],
      secrets,
      errors,
      dbBytes,
    };
  }

  async setSecrets(set, remove) {
    const secrets = (await this.ctx.storage.get('secrets')) ?? {};
    for (const [k, v] of Object.entries(set ?? {})) {
      if (!SECRET_RE.test(k) || BINDING_NAMES.has(k)) throw new Error(`Secret names are CAPITALS_AND_UNDERSCORES (not DB, KV or APP): ${k}`);
      if (typeof v !== 'string' || v.length > 5000) throw new Error(`${k} must be text, 5000 characters at most.`);
      secrets[k] = v;
    }
    for (const k of remove ?? []) delete secrets[k];
    if (Object.keys(secrets).length > FREE.secrets) throw new Error(`At most ${FREE.secrets} secrets.`);
    await this.ctx.storage.put('secrets', secrets);
    return Object.keys(secrets);
  }

  async logError(message) {
    const errors = (await this.ctx.storage.get('errors')) ?? [];
    errors.unshift({ at: Date.now(), message: String(message).slice(0, 1000) });
    await this.ctx.storage.put('errors', errors.slice(0, 30));
  }

  // ---- the app's own SQL database
  sql(query, params = []) {
    if (typeof query !== 'string' || !query.trim()) throw new Error('Empty query');
    if (query.length > 100_000) throw new Error('Query too long');
    if (this.ctx.storage.sql.databaseSize > FREE.dbBytes && /^\s*(insert|update|replace|create)/i.test(query)) {
      throw new Error(`Database is over ${FREE.dbBytes / 1_000_000} MB`);
    }
    const cursor = this.ctx.storage.sql.exec(query, ...params);
    const rows = cursor.toArray();
    return { rows, rowsRead: cursor.rowsRead, rowsWritten: cursor.rowsWritten };
  }

  // ---- the app's KV
  async kvGet(key) {
    return (await this.ctx.storage.get(`kv:${checkKey(key)}`)) ?? null;
  }

  async kvPut(key, value) {
    if (typeof value !== 'string') throw new Error('KV values are strings (use JSON.stringify)');
    if (value.length > FREE.kvValueBytes) throw new Error('KV value too large');
    await this.ctx.storage.put(`kv:${checkKey(key)}`, value);
  }

  async kvDelete(key) {
    await this.ctx.storage.delete(`kv:${checkKey(key)}`);
  }

  async kvList(prefix = '', limit = 100) {
    const listed = await this.ctx.storage.list({ prefix: `kv:${prefix}`, limit: Math.min(1000, Math.max(1, limit)) });
    return [...listed.keys()].map((k) => k.slice(3));
  }

  // ---- deploy keys (for CI), stored hashed
  async addKey(hash) {
    await this.ctx.storage.put(`key:${hash}`, Date.now());
  }

  async hasKey(hash) {
    return !!(await this.ctx.storage.get(`key:${hash}`));
  }

  async destroy() {
    await this.ctx.storage.deleteAll();
  }
}

function checkKey(key) {
  if (typeof key !== 'string' || !key || key.length > 512) throw new Error('KV keys are 1-512 characters');
  return key;
}

function toArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// ------------------------------------------- bindings handed to app code

/** env.DB inside an app: its own SQLite database. */
export class CloudDb extends WorkerEntrypoint {
  #app() {
    return appObject(this.env, this.ctx.props.slug);
  }
  async query(sql, ...params) {
    return (await this.#app().sql(sql, params)).rows;
  }
  async first(sql, ...params) {
    return (await this.#app().sql(sql, params)).rows[0] ?? null;
  }
  async run(sql, ...params) {
    const r = await this.#app().sql(sql, params);
    return { rowsRead: r.rowsRead, rowsWritten: r.rowsWritten };
  }
}

/** env.KV inside an app: simple string key/value storage. */
export class CloudKv extends WorkerEntrypoint {
  #app() {
    return appObject(this.env, this.ctx.props.slug);
  }
  get(key) { return this.#app().kvGet(key); }
  put(key, value) { return this.#app().kvPut(key, value); }
  delete(key) { return this.#app().kvDelete(key); }
  list(prefix, limit) { return this.#app().kvList(prefix, limit); }
}

// ------------------------------------------------------------ serving apps

const entryCache = new Map(); // slug -> { entry, exp }
const metaCache = new Map(); // `${slug}:${version}` -> meta

export async function lookupCloudApp(env, slug) {
  if (!env.CLOUD_REGISTRY) return null;
  const hit = entryCache.get(slug);
  if (hit && hit.exp > Date.now()) return hit.entry;
  const entry = await registry(env).lookup(slug);
  entryCache.set(slug, { entry, exp: Date.now() + 10_000 });
  if (entryCache.size > 5000) entryCache.clear();
  return entry;
}

function blockedSlugs(env) {
  return new Set(String(env.BLOCKED_SLUGS || '').split(/[\s,]+/).filter(Boolean));
}

export async function serveCloudApp(request, env, ctx, entry, page) {
  const { slug, version } = entry;
  if (entry.suspended || blockedSlugs(env).has(slug)) {
    return page(403, 'This app is switched off', 'It broke the Riftn rules.');
  }
  if (!version) return page(503, 'Nothing here yet', 'This app has not been uploaded yet.');

  const app = appObject(env, slug);
  const cacheKey = `${slug}:${version}`;
  let meta = metaCache.get(cacheKey);
  if (!meta) {
    meta = await app.meta();
    if (!meta || meta.version !== version) return page(503, 'Updating', 'This app is updating. Try again in a few seconds.');
    metaCache.set(cacheKey, meta);
    if (metaCache.size > 2000) metaCache.clear();
  }

  const url = new URL(request.url);
  const isRead = request.method === 'GET' || request.method === 'HEAD';
  if (isRead) {
    let path = matchAsset(meta.assets, url.pathname);
    // Single-page sites: unknown paths without a file extension get index.html.
    if (!path && !meta.main && !ext(url.pathname) && meta.assets['index.html']) path = 'index.html';
    if (path) {
      const file = await app.asset(version, path);
      if (file) {
        return new Response(request.method === 'HEAD' ? null : file.body, {
          headers: {
            'Content-Type': file.type,
            'Cache-Control': 'no-cache',
            ETag: `W/"c${version}-${path}"`,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
    }
  }
  if (!meta.main) return page(404, 'Not found', 'There is no page at this address.');

  const worker = env.LOADER.get(cacheKey, async () => {
    const code = await app.code(version);
    return {
      compatibilityDate: APP_COMPAT_DATE,
      compatibilityFlags: code.main.endsWith('.py') ? ['python_workers'] : ['nodejs_compat'],
      mainModule: code.main,
      modules: code.modules,
      env: {
        ...code.secrets,
        DB: ctx.exports.CloudDb({ props: { slug } }),
        KV: ctx.exports.CloudKv({ props: { slug } }),
        APP: { slug, url: appUrl(slug) },
      },
    };
  });
  try {
    const res = await worker.getEntrypoint(null, { limits: { cpuMs: FREE.cpuMs, subRequests: FREE.subRequests } }).fetch(request);
    return res;
  } catch (error) {
    const message = String(error?.stack || error?.message || error);
    ctx.waitUntil(app.logError(message).catch(() => {}));
    return new Response('This app ran into an error. Its creator can see it on riftn.com/apps/dev.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

// ------------------------------------------------------------- control API

const tokenCache = new Map(); // sha(token) -> { wallet, exp }

async function walletFromToken(token) {
  const key = await sha256(token);
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.wallet;
  const res = await fetch(AUTH_VERIFY, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const wallet = typeof data?.address === 'string' ? data.address.toLowerCase() : '';
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return null;
  tokenCache.set(key, { wallet, exp: Date.now() + 5 * 60_000 });
  if (tokenCache.size > 5000) tokenCache.clear();
  return wallet;
}

async function builderSlugTaken(slug) {
  try {
    const res = await fetch(`${BUILDER_FUNCTIONS}?host=${encodeURIComponent(slug)}&manifest=1`, { signal: AbortSignal.timeout(8000) });
    return res.status !== 404;
  } catch {
    return true;
  }
}

function preflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-dehub-token',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function handleCloudApi(request, env, ctx) {
  if (request.method === 'OPTIONS') return preflight();
  if (!env.CLOUD_REGISTRY || !env.LOADER) return fail(503, 'Riftn Cloud is not switched on yet.');
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  if (!parts.length) {
    return json({ name: 'Riftn Cloud', docs: 'https://riftn.com/apps/dev#cloud', api: `${url.origin}/v1/apps` });
  }
  if (parts[0] !== 'v1') return fail(404, 'Not found');

  try {
    return await route(request, env, ctx, parts.slice(1), url);
  } catch (error) {
    return fail(400, String(error?.message || error).replace(/^Error:\s*/, ''));
  }
}

async function route(request, env, ctx, parts, url) {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    || (request.headers.get('x-dehub-token') || '').trim();
  if (!bearer) return fail(401, 'Sign in to Riftn first.');

  const reg = registry(env);
  const [collection, slug, action] = parts;
  const admins = new Set(String(env.ADMIN_WALLETS || '').toLowerCase().split(/[\s,]+/).filter(Boolean));

  // A deploy key only uploads files to its own app.
  if (bearer.startsWith('rk_')) {
    const keySlug = /^rk_([a-z0-9-]+)_/.exec(bearer)?.[1];
    if (collection !== 'apps' || !slug || slug !== keySlug || action !== 'files' || request.method !== 'PUT') {
      return fail(403, 'Deploy keys can only upload files to their own app.');
    }
    if (!(await appObject(env, slug).hasKey(await sha256(bearer)))) return fail(401, 'That deploy key is not valid.');
    return uploadFiles(request, env, reg, slug);
  }

  const wallet = await walletFromToken(bearer);
  if (!wallet) return fail(401, 'Your Riftn sign-in has expired. Sign in again.');

  if (collection === 'admin') {
    if (!admins.has(wallet)) return fail(403, 'Staff only.');
    if (parts[1] === 'apps' && !parts[2] && request.method === 'GET') return json({ apps: await reg.listAll() });
    if (parts[1] === 'apps' && parts[2] && request.method === 'POST') {
      const body = await request.json();
      await reg.setSuspended(parts[2], !!body.suspended);
      entryCache.delete(parts[2]);
      return json({ ok: true });
    }
    return fail(404, 'Not found');
  }
  if (collection !== 'apps') return fail(404, 'Not found');

  if (!slug) {
    if (request.method === 'GET') {
      const apps = await reg.listByOwner(wallet);
      return json({ apps: apps.map((a) => ({ ...a, url: appUrl(a.slug) })), limits: FREE });
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const want = String(body.slug || '').toLowerCase().trim();
      const name = String(body.name || want).trim().slice(0, 60) || want;
      if (!SLUG_RE.test(want)) return fail(400, 'Addresses are 3-32 letters, numbers or dashes, and cannot start or end with a dash.');
      if (RESERVED.has(want) || blockedSlugs(env).has(want)) return fail(409, 'That address is reserved.');
      if (await builderSlugTaken(want)) return fail(409, 'That address is taken.');
      const out = await reg.create(want, wallet, name, admins.has(wallet) ? 100 : FREE.apps);
      if (out.error) return fail(409, out.error);
      entryCache.delete(want);
      return json({ ok: true, slug: want, url: appUrl(want) }, 201);
    }
    return fail(405, 'Method not allowed');
  }

  const entry = await reg.lookup(slug);
  if (!entry || (entry.owner !== wallet && !admins.has(wallet))) return fail(404, 'App not found.');
  const app = appObject(env, slug);

  if (!action) {
    if (request.method === 'GET') return json({ ...entry, url: appUrl(slug), ...(await app.info()) });
    if (request.method === 'PATCH') {
      const body = await request.json();
      const name = String(body.name || '').trim().slice(0, 60);
      if (name) await reg.rename(slug, name);
      return json({ ok: true });
    }
    if (request.method === 'DELETE') {
      await app.destroy();
      await reg.remove(slug);
      entryCache.delete(slug);
      return json({ ok: true });
    }
    return fail(405, 'Method not allowed');
  }
  if (action === 'files' && request.method === 'PUT') return uploadFiles(request, env, reg, slug);
  if (action === 'secrets' && request.method === 'PUT') {
    const body = await request.json();
    const names = await app.setSecrets(body.set, body.remove);
    // Secrets are baked into the running copy: start a fresh one.
    const meta = await app.meta();
    if (meta?.version) {
      const again = await app.deploy(await currentFiles(app, meta), meta.main);
      await reg.setVersion(slug, again.version);
      entryCache.delete(slug);
    }
    return json({ ok: true, secrets: names });
  }
  if (action === 'keys' && request.method === 'POST') {
    const random = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const key = `rk_${slug}_${random}`;
    await app.addKey(await sha256(key));
    return json({ key });
  }
  if (action === 'sql' && request.method === 'POST') {
    const body = await request.json();
    const out = await app.sql(String(body.sql || ''), Array.isArray(body.params) ? body.params : []);
    return json({ rows: out.rows.slice(0, 200), rowsRead: out.rowsRead, rowsWritten: out.rowsWritten });
  }
  return fail(404, 'Not found');
}

/** Re-reads the live version's files, for a redeploy after secrets change. */
async function currentFiles(app, meta) {
  const files = [];
  const code = meta.main ? await app.code(meta.version) : { modules: {} };
  for (const [path, mod] of Object.entries(code.modules)) {
    const value = mod.js ?? mod.cjs ?? mod.py ?? mod.text ?? (mod.json !== undefined ? JSON.stringify(mod.json) : null);
    const bytes = value !== null ? new TextEncoder().encode(value) : new Uint8Array(mod.wasm ?? mod.data);
    files.push({ path, bytes });
  }
  for (const path of Object.keys(meta.assets)) {
    const file = await app.asset(meta.version, path);
    if (file) files.push({ path: meta.main ? `public/${path}` : path, bytes: new Uint8Array(file.body) });
  }
  return files;
}

async function uploadFiles(request, env, reg, slug) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > FREE.appBytes * 1.5) return fail(413, `The upload is over ${FREE.appBytes / 1_000_000} MB.`);
  const body = await request.json();
  if (!Array.isArray(body.files)) return fail(400, 'Send { files: [{ path, data }] } with data in base64.');
  const files = body.files.map((f) => ({
    path: String(f.path || ''),
    bytes: typeof f.data === 'string' ? b64ToBytes(f.data) : new TextEncoder().encode(String(f.text ?? '')),
  }));
  const meta = await appObject(env, slug).deploy(files, typeof body.main === 'string' ? body.main : undefined);
  await reg.setVersion(slug, meta.version);
  entryCache.delete(slug);
  return json({
    ok: true,
    version: meta.version,
    url: appUrl(slug),
    main: meta.main,
    files: meta.files,
    bytes: meta.bytes,
  });
}
