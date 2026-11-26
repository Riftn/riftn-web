import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.PERFORMANCE_BROWSER_ROOT}/package.json`);
const { chromium } = require('playwright');
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://riftn.com' });
  const page = await context.newPage();
  await page.goto('https://dehub.io/shorts?app=1', { waitUntil: 'domcontentloaded' });

  const tiles = page.locator('[data-media-tile]').filter({ has: page.locator('video') });
  const tile = tiles.nth(2);
  await tile.waitFor({ state: 'visible', timeout: 30000 });

  async function copyPostLink(locator) {
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await locator.click({ button: 'right' });
    await page.getByText('Copy link', { exact: true }).click({ timeout: 5000 });
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes('/app/post/'));
    return new URL(await page.evaluate(() => navigator.clipboard.readText())).pathname;
  }

  const expected = await copyPostLink(tile);
  await tile.click();

  const viewer = page.locator('[data-shorts-viewer]');
  const activePicture = viewer.locator('[data-shorts-slide][style*="z-index: 2"] [data-shorts-picture]');
  await activePicture.waitFor({ state: 'visible', timeout: 15000 });
  const actual = await copyPostLink(activePicture);
  assert.equal(actual, expected, 'the first active viewer slide must link to the tapped post');
  console.log(`The third video tile and the active viewer both link to ${actual}.`);
} finally {
  await browser.close();
}
