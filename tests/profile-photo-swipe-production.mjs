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

async function verifyGrid(page, width, adaptive) {
  const grid = page.locator('[data-profile-image-grid]');
  const tiles = grid.locator('[data-profile-photo]');
  await tiles.first().waitFor({ timeout: 45_000 });
  const geometry = await tiles.evaluateAll(elements => elements.slice(0, 4).map(tile => {
    const { left, right, top } = tile.getBoundingClientRect();
    return {
      left, right, top,
      radius: getComputedStyle(tile).borderTopLeftRadius,
      fit: getComputedStyle(tile.querySelector('img')).objectFit,
    };
  }));
  assert.equal(geometry.length, 4);
  assert.ok(geometry.every(tile => tile.fit === 'contain' && tile.left >= 0 && tile.right <= width + 1));
  assert.equal(geometry[0].top, geometry[1].top);
  if (adaptive) {
    assert.ok(geometry[2].top > geometry[1].top);
    assert.equal(geometry[2].top, geometry[3].top);
    assert.equal(geometry[0].radius, '12px');
  } else {
    assert.equal(geometry[2].top, geometry[0].top);
    assert.ok(geometry[3].top > geometry[2].top);
    assert.equal(geometry[0].radius, '0px');
  }
}

async function verifyHazy() {
  const width = 390;
  const context = await browser.newContext({ viewport: { width, height: 852 }, isMobile: true, hasTouch: true });
  try {
    await context.addInitScript(() => {
      if (location.origin === 'https://riftn.com') localStorage.setItem('dehub.theme', 'hazy');
    });
    const page = await context.newPage();
    // Open the canonical URL directly so the legacy handoff doesn't transfer
    // a different local theme into this isolated browser session.
    await page.goto('https://riftn.com/araf', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-profile-tabs] button[title="Images"]').click({ timeout: 45_000 });
    // The signed-out page resets the saved appearance after hydration. Test
    // the production grid's theme selector directly, as for System Light.
    await page.locator('html').evaluate(root => { root.dataset.theme = 'hazy'; });
    await verifyGrid(page, width, true);
    await page.locator('[data-profile-photo]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/hazy-${width}-grid.png`, animations: 'disabled' });
  } finally {
    await context.close();
  }
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
    await verifyGrid(page, width, false);
    if (!phone) {
      await images.focus();
      for (let i = 0; i < 20 && !(await tile.evaluate(button => button === document.activeElement)); i++) {
        await page.keyboard.press('Tab');
      }
      assert.ok(await tile.evaluate(button =>
        button.matches(':focus-visible') && getComputedStyle(button, '::after').borderTopWidth === '2px',
      ));
      await tile.hover();
      await page.mouse.down();
      assert.equal(await tile.evaluate(button => getComputedStyle(button).opacity), '0.8');
      await page.mouse.up();
    }
    const tapTile = () => tile.tap({ position: { x: 24, y: 24 } });
    if (phone) await tapTile();
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
      // The pointer can already be over the close button when it opens. Its
      // hover scale changes the painted bounds without changing its target.
      const { width, height, borderTopLeftRadius: radius } = getComputedStyle(button);
      return { width, height, radius };
    });
    assert.deepEqual(size, { width: '44px', height: '44px', radius: '12px' });
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
      const focus = await close.evaluate(button => ({
        visible: button.matches(':focus-visible'),
        outline: getComputedStyle(button).outlineStyle,
        width: getComputedStyle(button).outlineWidth,
      }));
      assert.deepEqual(focus, { visible: true, outline: 'solid', width: '2px' });
      await page.screenshot({ path: `${output}/${name}-focus.png`, animations: 'disabled' });
      await close.hover();
      await page.mouse.down();
      assert.ok(await close.evaluate(button => button.matches(':active')));
      assert.equal(await close.locator('svg').evaluate(icon => getComputedStyle(icon).color), 'rgb(255, 255, 255)');
      await page.screenshot({ path: `${output}/${name}-pressed.png`, animations: 'disabled' });
      await page.mouse.move(96, 30);
      await page.mouse.up();
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
  try {
    await verifyHazy();
    console.log('Passed Hazy at 390px');
  } catch (error) {
    failures.push(error);
    console.error('Failed Hazy at 390px', error);
  }
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
