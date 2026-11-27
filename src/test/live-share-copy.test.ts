/**
 * A live stream's link reads like a stream, not an article: `pureglo is live
 * on Riftn` / `Watch pureglo live on Riftn now! "glo is live"` while it is on
 * air, the replay or a past stream once it has ended. Covers the copy
 * (server/live-share-copy.js), the crawler page rewrite in the worker and the
 * LIVE / REPLAY tag on the share card.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { liveShareCopy, liveShareState } from '../../server/live-share-copy.js';
import { postCardData, renderPostCardSvg } from '../../server/post-share-card.js';

const WORKER = readFileSync(resolve(__dirname, '../../CLOUDFLARE_WORKER_SEO.js'), 'utf8');
const decl = (signature: string) => {
  const start = WORKER.indexOf(signature);
  expect(start, signature).toBeGreaterThan(-1);
  return WORKER.slice(start, WORKER.indexOf('\n}\n', start) + 2);
};
const constant = (name: string) => WORKER.match(new RegExp(`^const ${name} = .*$`, 'm'))![0];

const { enrichLivePostMeta } = new Function(`
  ${constant('DESCRIPTION_MAX')}
  ${decl('function truncate(text, max) {')}
  ${decl('function decodeFnText(s) {')}
  ${decl('function escFnAttr(s) {')}
  ${decl('function escJsonText(s) {')}
  ${decl('function replacePostTitle(html, oldTitle, newTitle) {')}
  ${decl('function enrichLivePostMeta(html, copy) {')}
  return { enrichLivePostMeta };
`)() as { enrichLivePostMeta: (html: string, copy: ReturnType<typeof liveShareCopy>) => string };

const live = {
  tokenId: 8048, postType: 'live', name: 'glo is live', minterDisplayName: 'pureglo', mintername: 'glo',
  createdAt: '2026-11-19T17:02:01.618Z', imageUrl: 'live/thumbnails/6aff2b89790b84974a8f0bf8-1795121098036.jpg',
  stream: { status: 'LIVE', isActive: true, startedAt: '2026-11-19T17:02:13.090Z' },
};
const ended = (recording?: object) => ({
  ...live,
  stream: { status: 'ENDED', isActive: false, startedAt: '2026-11-19T17:02:13.090Z', endedAt: '2026-11-19T21:00:00Z', recording },
});
const replay = ended({ status: 'ready', url: 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/replays/s-1.mp4' });

describe('live share copy', () => {
  it('reads like a stream while it is on air', () => {
    expect(liveShareCopy(live, 'pureglo')).toEqual({
      state: 'live',
      title: 'pureglo is live on Riftn',
      description: 'Watch pureglo live on Riftn now! "glo is live"',
    });
  });

  it('points at the replay once the recording is ready, without repeating "is live"', () => {
    const copy = liveShareCopy(replay, 'pureglo')!;
    expect(copy.state).toBe('replay');
    expect(copy.title).toBe("pureglo's live replay on Riftn, 19 Nov 2026");
    expect(copy.description).toBe("Watch pureglo's live replay on Riftn. Streamed on 19 Nov 2026.");
  });

  it('keeps a stream title the streamer chose', () => {
    const copy = liveShareCopy({ ...replay, name: 'Late night ranked' }, 'pureglo')!;
    expect(copy.title).toBe("Late night ranked | pureglo's live replay on Riftn");
    expect(copy.description).toBe(`Watch pureglo's live replay on Riftn: "Late night ranked". Streamed on 19 Nov 2026.`);
  });

  it('says the stream happened when no replay was kept', () => {
    for (const recording of [undefined, { status: 'skipped', reason: 'allowance' }]) {
      const copy = liveShareCopy(ended(recording), 'pureglo')!;
      expect(copy.state).toBe('ended');
      expect(copy.title).toBe('pureglo was live on Riftn, 19 Nov 2026');
      expect(copy.description).toBe('pureglo was live on Riftn on 19 Nov 2026. Follow pureglo to catch the next stream live.');
    }
  });

  it('announces a scheduled stream', () => {
    const later = { ...live, stream: { status: 'SCHEDULED', scheduledFor: '2099-01-01T00:00:00Z' } };
    expect(liveShareCopy(later, 'pureglo')!.description).toBe('pureglo is going live on Riftn soon! "glo is live"');
  });

  it('leaves every other post alone', () => {
    expect(liveShareState({ postType: 'video' })).toBe('');
    expect(liveShareCopy({ postType: 'feed-simple', name: 'x' }, 'a')).toBeNull();
  });

  it('keeps long titles inside the title limit', () => {
    const copy = liveShareCopy({ ...replay, name: 'x'.repeat(65) }, 'pureglo', { titleMax: 70 })!;
    expect(copy.title.length).toBeLessThanOrEqual(70);
  });
});

describe('crawler page for a live post', () => {
  const OLD_TITLE = 'glo is live | a post by pureglo on Riftn';
  const OLD_DESC = 'Read "glo is live", a post by pureglo on Riftn, the open source, user-owned social network. Topics: web3.';
  const a = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const page = `<html><head><title>${a(OLD_TITLE)}</title>
<meta name="description" content="${a(OLD_DESC)}">
<meta property="og:title" content="${a(OLD_TITLE)}">
<meta property="og:description" content="${a(OLD_DESC)}">
<meta name="twitter:title" content="${a(OLD_TITLE)}">
<meta name="twitter:description" content="${a(OLD_DESC)}">
<script type="application/ld+json">${JSON.stringify({ '@type': 'SocialMediaPosting', headline: OLD_TITLE, description: OLD_DESC, author: { '@type': 'Person', name: 'pureglo' } })}</script>
</head><body><h1>${a(OLD_TITLE)}</h1><p>${a(OLD_DESC)}</p></body></html>`;

  it('swaps the title and description everywhere the page carries them', () => {
    const out = enrichLivePostMeta(page, liveShareCopy(live, 'pureglo'));
    expect(out).not.toContain('a post by');
    expect(out).not.toContain('Topics:');
    expect(out.match(/pureglo is live on Riftn/g)).toHaveLength(5);
    const desc = 'Watch pureglo live on Riftn now! &quot;glo is live&quot;';
    expect(out).toContain(`<meta name="description" content="${desc}">`);
    expect(out).toContain(`<meta property="og:description" content="${desc}">`);
    expect(out).toContain(`<meta name="twitter:description" content="${desc}">`);
    expect(out).toContain(`<p>${desc}</p>`);
    const ld = JSON.parse(out.match(/ld\+json">([^<]*)</)![1]);
    expect(ld.description).toBe('Watch pureglo live on Riftn now! "glo is live"');
    expect(ld.headline).toBe('pureglo is live on Riftn');
    expect(ld.author.name).toBe('pureglo');
  });

  it('does nothing for a post that is not a stream', () => {
    expect(enrichLivePostMeta(page, null)).toBe(page);
  });
});

describe('share card for a live post', () => {
  const render = (post: object) => renderPostCardSvg(postCardData(post)!, { logo: '', media: 'data:image/png;base64,AA' });

  it('tags a stream on air LIVE and invites people to watch it live', () => {
    const svg = render(live);
    expect(svg).toContain('data-live-tag="live"');
    expect(svg).toContain('Watch live on Riftn');
  });

  it('tags a finished stream with a replay REPLAY and names whose it was', () => {
    const svg = render(replay);
    expect(svg).toContain('data-live-tag="replay"');
    expect(svg).toContain('Watch the replay');
    expect(svg).toContain('pureglo&apos;s live replay');
    expect(svg).not.toContain('glo is live');
  });

  it('changes nothing on any other post card', () => {
    const video = { ...live, postType: 'video', stream: undefined, imageUrl: 'images/8048.jpg' };
    expect(postCardData(video)).not.toHaveProperty('live', expect.anything());
    expect(render(video)).not.toContain('data-live-tag');
  });
});
