#!/usr/bin/env node
/**
 * Measures each page's real layout and writes its loading placeholder.
 *
 *   node scripts/page-bones.mjs [--base https://riftn.com] [--only stats,tv]
 *
 * Opens every page below at phone, tablet, desktop and wide desktop width, waits for it to settle,
 * and saves where its text, pictures and panels sit (see
 * page-bones-extract.js) to src/data/page-bones.json. The app draws those as
 * grey shapes while the page loads, so the placeholder is the page's own
 * layout. Run it again after a page's layout changes.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// Playwright is not a dependency of the site: use the machine's own install.
const { chromium } = createRequire(import.meta.url)('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'src', 'data', 'page-bones.json');
const extract = readFileSync(join(here, 'page-bones-extract.js'), 'utf8');

/** Cached page key (PersistentPageCache) -> the path that opens it. */
export const PAGES = {
  explore: '/explore', assistant: '/assistant', leaderboard: '/leaderboard', music: '/music', stages: '/stages',
  tv: '/tv', buy: '/buy', agents: '/agents', features: '/features', governance: '/governance', dao: '/dao',
  careers: '/jobs', glossary: '/glossary', stats: '/stats', feedback: '/feedback', stake: '/stake',
  bridge: '/bridge', 'top-100': '/top-100', communities: '/communities', events: '/events',
  fractions: '/fractions', usernames: '/usernames', accounts: '/accounts', work: '/work', arcade: '/arcade',
  ads: '/ads',
};
const SIZES = [['phone', 390, 844], ['tablet', 820, 1100], ['desktop', 1280, 800], ['wide', 1680, 1000]];

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const base = (arg('base') || 'https://riftn.com').replace(/\/$/, '');
const only = arg('only')?.split(',');

const result = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const browser = await chromium.launch();
for (const [size, width, height] of SIZES) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  // The first-visit welcome card would cover the page being measured.
  await context.addInitScript(() => { try { localStorage.setItem('dehub.welcome.dismissed', '1'); } catch { /* private mode */ } });
  const page = await context.newPage();
  for (const [key, path] of Object.entries(PAGES)) {
    if (only && !only.includes(key)) continue;
    try {
      await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector(`[data-cached-page="${key}"]`, { timeout: 30000 });
      // Settled: no loader or placeholder left in the page, then a quiet moment.
      await page.waitForFunction((k) => {
        const root = document.querySelector(`[data-cached-page="${k}"]`);
        return root && root.getBoundingClientRect().height > 200
          && !root.querySelector('[data-skeleton], .theme-skeleton, .animate-pulse, [data-dehub-loader], [data-copy-gate="hold"], [data-page-bones]');
      }, key, { timeout: 20000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      const bones = await page.evaluate(`(${extract})(${JSON.stringify(key)}, ${Math.round(height * 1.3)})`);
      if (!bones || bones.bones.length < 2) { console.warn(`${size} ${key}: nothing measured`); continue; }
      result[key] = { ...(result[key] || {}), [size]: [bones.w, bones.h, bones.pill ? 1 : 0, bones.bones.map((b) => b.join(',')).join(';')] };
      console.log(`${size} ${key}: ${bones.bones.length} shapes`);
    } catch (error) {
      console.warn(`${size} ${key}: ${String(error).split('\n')[0]}`);
    }
  }
  await context.close();
}
await browser.close();
const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
writeFileSync(OUT, JSON.stringify(sorted) + '\n');
console.log(`Wrote ${OUT} (${Math.round(JSON.stringify(sorted).length / 1024)} KB)`);
