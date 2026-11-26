import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.SWIPE_BROWSER_ROOT}/package.json`);
const { chromium } = require('playwright');
const output = 'swipe-back-results';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();

async function swipe(session, x, y, dx, dy) {
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x + dx * step / 6, y: y + dy * step / 6 }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function verify(theme, width, phone) {
  const context = await browser.newContext({
    viewport: { width, height: phone ? 852 : 900 },
    isMobile: phone,
    hasTouch: phone,
  });
  await context.addInitScript(value => localStorage.setItem('dehub.theme', value), theme);
  const page = await context.newPage();
  const name = `${theme}-${width}`;
  try {
    await page.goto('https://dehub.io/araf', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('https://riftn.com/araf');
    const profileUrl = page.url();
    const tone = theme === 'system-light' ? 'light' : 'dark';
    assert.equal(await page.locator('html').getAttribute('data-system-tone'), tone);
    const images = page.locator('[data-profile-tabs] button[title="Images"]');
    await images.click({ timeout: 45_000 });
    const tile = page.locator('[data-profile-image-grid] button').first();
    await tile.click({ timeout: 45_000 });
    const viewer = page.getByRole('dialog', { name: 'Images', exact: true });
    const close = viewer.getByRole('button', { name: /^Close(?: fullscreen)?$/ });
    await close.waitFor();
    const size = await close.evaluate(button => {
      const { width, height } = button.getBoundingClientRect();
      return { width, height, radius: getComputedStyle(button).borderTopLeftRadius };
    });
    assert.deepEqual(size, { width: 44, height: 44, radius: '12px' });
    await page.screenshot({ path: `${output}/${name}-photos.png`, animations: 'disabled' });

    if (phone) {
      const session = await context.newCDPSession(page);
      await swipe(session, 24, 30, -18, 1);
      assert.ok(await viewer.isVisible(), 'A short reverse drag closed the viewer');
      await swipe(session, 48, 30, 135, 3);
      await viewer.waitFor({ state: 'hidden' });
      assert.equal(page.url(), profileUrl, 'The photo swipe skipped the profile grid');
      await tile.tap();
      await viewer.waitFor();
      await page.goBack();
      await viewer.waitFor({ state: 'hidden' });
      assert.equal(page.url(), profileUrl, 'Browser Back skipped the profile grid');
      await swipe(session, 12, 180, 130, 2);
      await page.waitForURL('https://riftn.com/app');
    } else {
      await close.focus();
      await page.screenshot({ path: `${output}/${name}-focus.png`, animations: 'disabled' });
      await page.keyboard.press('Escape');
      await viewer.waitFor({ state: 'hidden' });
      await page.waitForFunction(() =>
        document.activeElement === document.querySelector('[data-profile-image-grid] button'),
      );
    }
  } catch (error) {
    await page.screenshot({ path: `${output}/${name}-failure.png` }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

try {
  for (const theme of ['system', 'system-light']) {
    for (const width of [360, 390, 1280]) await verify(theme, width, width < 768);
  }
  console.log('Profile photos passed at 360, 390 and 1280 px in System and System Light.');
} finally {
  await browser.close();
}
