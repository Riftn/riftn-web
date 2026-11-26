import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.PERFORMANCE_BROWSER_ROOT}/package.json`);
const { chromium } = require('playwright');
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
  const page = await context.newPage();
  await page.goto('https://dehub.io/shorts?app=1', { waitUntil: 'domcontentloaded' });

  const videoWithPoster = 'video[poster]:not([poster=""])';
  const tiles = page.locator('[data-media-tile]').filter({ has: page.locator(videoWithPoster) });
  const tile = tiles.nth(2);
  await tile.waitFor({ state: 'visible', timeout: 30000 });

  async function posterPath(video) {
    return video.evaluate((element) => new URL(element.poster).pathname.replace(/^\/cdn-cgi\/image\/[^/]+\//, '/'));
  }

  const expected = await posterPath(tile.locator(videoWithPoster));
  assert.notEqual(expected, await posterPath(tiles.first().locator(videoWithPoster)), 'choose a tile with a distinct poster');
  await tile.click();

  const viewer = page.locator('[data-shorts-viewer]');
  const activeVideo = viewer.locator('[data-shorts-slide][style*="z-index: 2"]').locator(videoWithPoster);
  await activeVideo.waitFor({ state: 'visible', timeout: 15000 });
  const actual = await posterPath(activeVideo);
  assert.equal(actual, expected, 'the first active video must have the tapped tile’s poster');
  console.log(`The third video tile and the active video both use ${actual}.`);
} finally {
  await browser.close();
}
