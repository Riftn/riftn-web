#!/usr/bin/env node
/**
 * Keep the previous deploys' code files online after a new deploy.
 * ===============================================================
 * A Workers deploy replaces the whole asset set, so the moment a new build goes
 * live every `/assets/*` file the old build used is gone. A tab that was opened
 * before the deploy still runs the old build, and the next page it opens asks
 * for one of those files, gets a 404 and has to reload itself onto the new
 * version (lib/lazy-with-retry). This script makes that rare: before deploying,
 * it copies the files the live site serves today, and anything it carried for
 * earlier deploys, back into dist/assets, so old tabs keep working and pick up
 * the new version quietly on their next page change.
 *
 * Bookkeeping lives in dist/deploy-assets.json, deployed with the site:
 *   { "files": { "assets/Foo-abc.js": 0, "assets/Bar-def.js": 1731600000000 } }
 * 0 = part of this build; a timestamp = when a deploy dropped it. Retired files
 * are kept for RETAIN_HOURS, newest first, inside a file-count budget that keeps
 * the whole upload under the Workers per-version file limit.
 *
 * The very first run has no bookkeeping to read, so it finds the live build's
 * files by following references from the live index.html through its scripts.
 *
 * Never fails the deploy: anything that cannot be fetched is skipped with a
 * warning, and the deploy goes ahead with whatever was carried.
 *
 * Usage: node scripts/carry-retired-assets.mjs https://riftn.com [distDir]
 */
import fs from 'node:fs';
import path from 'node:path';

const LIVE = (process.argv[2] || '').replace(/\/+$/, '');
const DIST = path.resolve(process.argv[3] || 'dist');
const MANIFEST = 'deploy-assets.json';
const RETAIN_HOURS = Number(process.env.RETAIN_HOURS || 72);
/** Cloudflare's limit is 20,000 files per Worker version on the free plan. */
const MAX_TOTAL_FILES = Number(process.env.MAX_TOTAL_FILES || 19_000);
const MAX_CARRIED_BYTES = Number(process.env.MAX_CARRIED_BYTES || 1_500_000_000);
const CONCURRENCY = 16;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) riftn-deploy/1.0';

if (!LIVE) {
  console.error('usage: carry-retired-assets.mjs <live-origin> [distDir]');
  process.exit(2);
}

const now = Date.now();
const log = (...args) => console.log('[carry-assets]', ...args);

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

async function get(url, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (error) {
      if (i >= attempts) throw error;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

async function pool(items, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function readLiveManifest() {
  try {
    const res = await get(`${LIVE}/${MANIFEST}?t=${now}`);
    if (!res) return null;
    if (!(res.headers.get('content-type') || '').includes('json')) return null;
    const data = await res.json();
    return data && typeof data.files === 'object' && data.files ? data.files : null;
  } catch (error) {
    log('could not read live manifest:', error.message);
    return null;
  }
}

const ASSET_REF = /assets\/[A-Za-z0-9_\-.]+\.(?:js|mjs|css|wasm|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|json|mp3|mp4|webm|riv|glb|wav|ogg)/g;

/** First run only: everything reachable from the live index.html. */
async function crawlLiveBuild() {
  const found = new Set();
  const queue = [];
  const take = (text) => {
    for (const m of text.matchAll(ASSET_REF)) {
      if (!found.has(m[0])) {
        found.add(m[0]);
        if (/\.(?:js|mjs|css)$/.test(m[0])) queue.push(m[0]);
      }
    }
  };
  const index = await get(`${LIVE}/?t=${now}`);
  if (!index) return found;
  take(await index.text());
  while (queue.length) {
    const batch = queue.splice(0, queue.length);
    await pool(batch, async (file) => {
      try {
        const res = await get(`${LIVE}/${file}`);
        if (res) take(await res.text());
      } catch {
        // Unreachable file — it simply is not carried.
      }
    });
  }
  return found;
}

async function main() {
  const built = listFiles(path.join(DIST, 'assets')).map((f) => `assets/${f}`);
  const builtSet = new Set(built);
  const totalBuilt = listFiles(DIST).length;

  let live = await readLiveManifest();
  if (!live) {
    log('no live manifest, finding the live build from index.html');
    live = {};
    for (const file of await crawlLiveBuild()) live[file] = 0;
    log(`found ${Object.keys(live).length} files in the live build`);
  }

  const cutoff = now - RETAIN_HOURS * 3_600_000;
  const candidates = [];
  for (const [file, retiredAt] of Object.entries(live)) {
    if (builtSet.has(file) || !file.startsWith('assets/') || file.includes('..')) continue;
    const when = retiredAt === 0 ? now : Number(retiredAt);
    if (!Number.isFinite(when) || when < cutoff) continue;
    candidates.push({ file, when });
  }
  // Newest retirements first: the tabs most likely to still be open.
  candidates.sort((a, b) => b.when - a.when);
  const room = Math.max(0, MAX_TOTAL_FILES - totalBuilt - 1);
  const wanted = candidates.slice(0, room);
  if (candidates.length > wanted.length) log(`file budget: dropping ${candidates.length - wanted.length} oldest`);

  const carried = {};
  let bytes = 0;
  let missing = 0;
  await pool(wanted, async ({ file, when }) => {
    if (bytes > MAX_CARRIED_BYTES) return;
    try {
      const res = await get(`${LIVE}/${file}`);
      if (!res || (res.headers.get('content-type') || '').startsWith('text/html')) { missing++; return; }
      const body = Buffer.from(await res.arrayBuffer());
      bytes += body.length;
      const target = path.join(DIST, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
      carried[file] = when;
    } catch (error) {
      missing++;
      log('skip', file, error.message);
    }
  });

  const files = {};
  for (const file of built) files[file] = 0;
  Object.assign(files, carried);
  fs.writeFileSync(path.join(DIST, MANIFEST), JSON.stringify({ generatedAt: new Date(now).toISOString(), files }));
  log(`built ${built.length}, carried ${Object.keys(carried).length} (${(bytes / 1e6).toFixed(1)} MB) from ${LIVE}, skipped ${missing}, total files ${listFiles(DIST).length}`);
}

main().catch((error) => {
  // Never block a deploy over this: the site still works, old tabs just reload.
  log('failed, deploying without carried files:', error.message);
  try {
    const built = listFiles(path.join(DIST, 'assets'));
    const files = Object.fromEntries(built.map((f) => [`assets/${f}`, 0]));
    fs.writeFileSync(path.join(DIST, MANIFEST), JSON.stringify({ generatedAt: new Date(now).toISOString(), files }));
  } catch {
    // Nothing more to do.
  }
});
