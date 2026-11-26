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
  const page = await context.newPage();
  const name = `${theme}-${width}`;
  try {
    await page.goto('https://dehub.io/araf', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('https://riftn.com/araf');
    const profileUrl = page.url();
    const images = page.locator('[data-profile-tabs] button[title="Images"]');
    await images.click({ timeout: 45_000 });
    const tile = page.locator('[data-profile-image-grid] button').first();
    await tile.waitFor({ timeout: 45_000 });
    const tone = theme === 'system-light' ? 'light' : 'dark';
    // The public session uses System dark after its preferences hydrate. The
    // two System choices share layout and use this attribute for the palette.
    await page.locator('html').evaluate((root, value) => {
      root.dataset.systemTone = value;
      root.style.colorScheme = value;
    }, tone);
    const tapTile = () => tile.tap({ position: { x: 24, y: 24 } });
    if (phone) await tapTile();
    else await tile.click();
    const viewer = page.getByRole('dialog', { name: 'Images', exact: true });
    const close = viewer.getByRole('button', { name: /^Close(?: fullscreen)?$/ });
    await close.waitFor();
    assert.equal(await page.locator('html').getAttribute('data-system-tone'), tone);
    if (await viewer.getAttribute('data-profile-photo-dialog') !== null) {
      const profileBack = page.locator('[data-profile-pull-root] [data-swipe-back]').filter({ visible: true });
      await profileBack.first().waitFor({ state: 'hidden' });
      assert.equal(await close.locator('svg').evaluate(icon => getComputedStyle(icon).color), 'rgb(255, 255, 255)');
    }
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
      await page.waitForFunction(() => !history.state?.__dehubOverlay && !document.querySelector('[data-overlay-ghost]'));
      await tapTile();
      await viewer.waitFor();
      await page.goBack();
      await viewer.waitFor({ state: 'hidden' });
      assert.equal(page.url(), profileUrl, 'Browser Back skipped the profile grid');
      await page.waitForFunction(() => !history.state?.__dehubOverlay && !document.querySelector('[data-overlay-ghost]'));
      await tile.scrollIntoViewIfNeeded();
      const gridPhoto = await tile.boundingBox();
      assert.ok(gridPhoto, 'The photo grid did not settle after Browser Back');
      await swipe(session, gridPhoto.x + 12, gridPhoto.y + Math.min(48, gridPhoto.height / 3), 130, 2);
      await page.waitForURL(url => url.origin === 'https://riftn.com' && ['/', '/app'].includes(url.pathname));
    } else {
      await close.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      assert.ok(await close.evaluate(button => button.matches(':focus-visible')));
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
  const failures = [];
  for (const theme of ['system', 'system-light']) {
    for (const width of [360, 390, 1280]) {
      try {
        await verify(theme, width, width < 768);
        console.log(`Passed ${theme} at ${width}px`);
      } catch (error) {
        failures.push(error);
        console.error(`Failed ${theme} at ${width}px`, error);
      }
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Profile photo checks failed');
} finally {
  await browser.close();
}
