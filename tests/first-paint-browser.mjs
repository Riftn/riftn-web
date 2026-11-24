// Films the first load of the site on a slow phone and on a desktop, frame by
// frame, and fails on anything that blinks, flashes or jumps:
//
//  - home: the welcome card is painted from index.html before the app starts.
//    From the first frame it is on screen until the end of the run it must
//    stay on screen (never hidden, faded or swapped out for a frame) and never
//    move by more than a couple of pixels;
//  - every route: once something is on screen the screen is never empty
//    again (the boot skeleton handing over to a placeholder that fades in
//    later left a blank gap);
//  - no raw translation key ("creator.signUp") is ever shown.
//
// Outside requests are blocked so the run is the same every time and only
// tests this branch's own load path (the feed then draws its placeholders).
//
// BASE_URL: the built site (vite build + any static server with SPA fallback).
// BROWSER_DEPS: a folder with playwright installed (CI), else the global one.
// Frames of every run are saved in first-paint-evidence/ for a look by eye.
import { createRequire } from 'node:module';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.env.BROWSER_DEPS || process.cwd(), 'package.json'));
const { chromium, devices } = require('playwright');
const base = (process.env.BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const output = resolve('first-paint-evidence');
const RUN_MS = 7000;
const JUMP_PX = 3;

const RUNS = [
  { name: 'home-phone', path: '/', phone: true, cpu: 4, intro: true },
  { name: 'home-desktop', path: '/', phone: false, cpu: 2, intro: true },
  { name: 'explore-phone', path: '/explore', phone: true, cpu: 4 },
  { name: 'leaderboard-phone', path: '/leaderboard', phone: true, cpu: 4 },
];

/** Runs in the page: samples every frame from the very first one. */
function sampler() {
  const KEY = /^(?:copy\.c[0-9a-f]{12}|[a-z][a-zA-Z]+\.[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9.]*)$/;
  // minOpacity: the card must be fully there; a pulsing placeholder still counts as painted.
  const shown = (el, minOpacity = 0.99) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= innerHeight) return false;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < minOpacity) return false;
    }
    return true;
  };
  const log = (window.__firstPaint = { frames: [], keys: [] });
  let lastKeys = 0;
  const tick = () => {
    const t = Math.round(performance.now());
    const cards = [...document.querySelectorAll('section.dehub-intro')].filter(shown);
    const head = cards[0] && cards[0].querySelector('h1, h2');
    // Anything painted in the main column: page content, a placeholder or the boot skeleton.
    const root = document.getElementById('root');
    let painted = false;
    if (root) {
      for (const el of root.querySelectorAll('main *, .bskel-main *, [data-skeleton-appear] *, section, article, h1, h2')) {
        if (el.children.length) continue;
        if (shown(el, 0.05)) { painted = true; break; }
      }
    }
    log.frames.push([t, cards.length, head ? Math.round(head.getBoundingClientRect().top) : null, painted]);
    if (t - lastKeys > 120 && root) {
      lastKeys = t;
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const s = n.data.trim();
        if (s.length > 4 && KEY.test(s) && shown(n.parentElement)) log.keys.push([t, s]);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const failures = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const run of RUNS) {
    const context = await browser.newContext({
      ...(run.phone ? devices['Moto G4'] : {}),
      viewport: run.phone ? { width: 412, height: 823 } : { width: 1366, height: 860 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
    const page = await context.newPage();
    await page.addInitScript(sampler);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: run.cpu });
    const shots = [];
    cdp.on('Page.screencastFrame', (f) => {
      shots.push([Math.round(f.metadata.timestamp * 1000), f.data]);
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 45, everyNthFrame: 1 });
    await page.goto(base + run.path, { waitUntil: 'commit' });
    await page.waitForTimeout(RUN_MS);
    await cdp.send('Page.stopScreencast').catch(() => {});
    const { frames, keys } = await page.evaluate(() => window.__firstPaint);
    await context.close();

    const dir = resolve(output, run.name);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const t0 = shots.length ? shots[0][0] : 0;
    await Promise.all(shots.map(([t, d], i) => writeFile(resolve(dir, `${String(i).padStart(3, '0')}-${t - t0}ms.jpg`), Buffer.from(d, 'base64'))));

    const fail = (msg) => failures.push(`${run.name}: ${msg}`);
    const firstPaint = frames.findIndex((f) => f[3]);
    if (firstPaint < 0) fail('nothing was ever painted');
    else {
      const gap = frames.slice(firstPaint).find((f) => !f[3]);
      if (gap) fail(`the screen went empty at ${gap[0]} ms after content had been painted`);
    }
    if (run.intro) {
      const first = frames.findIndex((f) => f[1] > 0);
      if (first < 0) fail('the welcome card never showed');
      else {
        const lost = frames.slice(first).find((f) => f[1] === 0);
        if (lost) fail(`the welcome card disappeared at ${lost[0]} ms (first shown at ${frames[first][0]} ms)`);
        const top = frames[first][2];
        const jump = frames.slice(first).find((f) => f[2] !== null && Math.abs(f[2] - top) > JUMP_PX);
        if (jump) fail(`the welcome card moved from ${top}px to ${jump[2]}px at ${jump[0]} ms`);
      }
    }
    if (keys.length) fail(`raw translation key on screen: ${[...new Set(keys.map((k) => k[1]))].join(', ')}`);
    console.log(`${run.name}: ${frames.length} frames, ${shots.length} screenshots, first paint ${firstPaint >= 0 ? frames[firstPaint][0] : '-'} ms`);
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nFirst paint check failed (frames in first-paint-evidence/):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('First paint check passed: nothing blinked, flashed or jumped.');
