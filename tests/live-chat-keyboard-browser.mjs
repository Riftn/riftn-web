// The live chat box on a phone has to stay above the keyboard, and show the
// whole of a long message. Opens a real live on a phone-sized screen, puts
// the cursor in the chat box, brings the keyboard up the way Android Chrome
// does (the page shrinks: interactive-widget=resizes-content), then types a
// long message. Nothing is ever sent.
//
// BASE_URL: the site to check (a local dev server in CI, riftn.com by default).
// BROWSER_DEPS: a folder with playwright installed (CI), else the global one.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(resolve(process.env.BROWSER_DEPS || process.cwd(), 'package.json'));
const { chromium, devices } = require('playwright');
const base = (process.env.BASE_URL || 'https://riftn.com').replace(/\/$/, '');
const output = resolve('live-chat-keyboard-evidence');
await mkdir(output, { recursive: true });

const streams = await fetch('https://api.dehub.io/api/live?status=live').then((r) => r.json()).catch(() => []);
const list = Array.isArray(streams) ? streams : streams?.data ?? [];
const stream = list.find((s) => String(s?.status).toUpperCase() === 'LIVE') ?? list[0];
assert(stream?.tokenId, 'No live to open');
const KEYBOARD = 330;
const LONG = 'this is a long message to check that the box grows with it and every word stays in view above the keyboard while typing on a phone';

const browser = await chromium.launch({ args: ['--disable-web-security'] });
const failures = [];
try {
  for (const theme of ['system', 'light', 'osaka']) {
    const device = devices['Pixel 7'];
    const context = await browser.newContext({ ...device });
    await context.addInitScript((t) => { try { localStorage.setItem('dehub.theme', t); } catch { /* private mode */ } }, theme);
    const page = await context.newPage();
    await page.goto(`${base}/app/post/${stream.tokenId}`, { waitUntil: 'commit' });
    const box = page.locator('textarea').first();
    await box.waitFor({ state: 'visible', timeout: 90_000 });
    await page.waitForTimeout(2500);
    // Signed out the box is read-only (a tap opens sign-in); its layout is the same, so open it up.
    await box.evaluate((el) => { el.disabled = false; el.removeAttribute('disabled'); el.readOnly = false; el.removeAttribute('readonly'); });
    await box.focus();
    await page.setViewportSize({ width: device.viewport.width, height: device.viewport.height - KEYBOARD });
    await page.waitForTimeout(1200);
    const measure = () => box.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, scroll: el.scrollHeight, client: el.clientHeight, view: window.visualViewport?.height ?? window.innerHeight };
    });
    const empty = await measure();
    await page.screenshot({ path: `${output}/${theme}-1-keyboard.png` });
    await box.fill(LONG);
    await page.waitForTimeout(600);
    const long = await measure();
    await page.screenshot({ path: `${output}/${theme}-2-long-message.png` });
    await box.fill('');
    await page.waitForTimeout(400);
    const cleared = await measure();
    console.log(theme, JSON.stringify({ empty, long, cleared }));
    const check = (ok, what) => { if (!ok) failures.push(`${theme}: ${what}`); };
    check(empty.bottom <= empty.view + 0.5, `empty box under the keyboard (bottom ${empty.bottom}, visible ${empty.view})`);
    check(long.bottom <= long.view + 0.5, `long message box under the keyboard (bottom ${long.bottom}, visible ${long.view})`);
    check(long.top >= 0, 'long message box ran off the top');
    check(long.height > empty.height + 30, `box did not grow with a long message (${empty.height} -> ${long.height})`);
    check(long.scroll <= long.client + 2, `part of the long message is scrolled out of view (${long.scroll} > ${long.client})`);
    check(Math.abs(cleared.height - empty.height) < 2, `box did not shrink back after clearing (${cleared.height} vs ${empty.height})`);
    await context.close();
  }
} finally {
  await browser.close();
}
assert.deepEqual(failures, [], failures.join('\n'));
console.log('Live chat box stays above the keyboard and grows with a long message.');
