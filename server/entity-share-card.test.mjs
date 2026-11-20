import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { ENTITY_ART, entityCardProps, entityQuery, entityShareImageUrl, renderEntityCardSvg } from './entity-share-card.js';


const rows = {
  event: { event_number: 12, title: 'Synth Lab meetup', starts_at: '2026-11-28T19:00:00Z', location: 'London', going_count: 42 },
  community: { slug: 'synth-lab', name: 'Synth Lab', description: 'Patch notes, gear talk and weekly jams.', member_count: 4200 },
  clip: { short_id: 77, title: '', stream_title: 'Ranked grind to Diamond', streamer_username: 'zeke', clipper_username: 'kai', kind: 'viewer' },
  dex: { chain: 'base', token_address: '0x' + 'a'.repeat(40), name: 'Synth Coin', symbol: 'synth' },
  costream: { id: '3f9a0c12-be47-4a2b-9d55-2f1e1c0a9b11', host_username: 'zeke', status: 'active' },
};

test('cards come from the row only, and private rows get none', () => {
  assert.equal(entityCardProps('event', { ...rows.event, is_private: true }), null);
  assert.equal(entityCardProps('community', { ...rows.community, is_private: true }), null);
  assert.equal(entityCardProps('nope', rows.event), null);
  assert.equal(entityCardProps('dex', rows.dex).title, '$SYNTH');
  assert.equal(entityCardProps('clip', rows.clip).title, 'Ranked grind to Diamond');
  assert.equal(entityCardProps('costream', rows.costream).live, true);
});

test('ids are checked before any query is built', () => {
  assert.match(entityQuery('event', '12'), /^community_events\?event_number=eq\.12&/);
  assert.match(entityQuery('dex', `base~0x${'A'.repeat(40)}`), /token_address=eq\.0x[a]{40}/);
  for (const [kind, id] of [['event', '1;drop'], ['community', '../x'], ['clip', 'abc'], ['costream', 'not-a-uuid'], ['dex', 'base~0x12'], ['other', '1']]) {
    assert.equal(entityQuery(kind, id), null, `${kind}/${id}`);
  }
  assert.equal(entityShareImageUrl('dex', 'base~0xab'), 'https://riftn.com/_og/dex/v1/base~0xab.png');
});

test('renders every kind as a 1200 by 630 PNG with escaped text', async () => {
  await initWasm(readFileSync(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url))).catch(() => {});
  const file = (p, t) => `data:${t};base64,${readFileSync(new URL(`../public${p}`, import.meta.url)).toString('base64')}`;
  const font = ['manrope-500', 'manrope-700', 'mono'].map(f => readFileSync(new URL(`../public/brand-kit/font/${f}.ttf`, import.meta.url)));
  const logo = file('/brand-kit/brand/riftn-logo-white.png', 'image/png');
  const backdrop = file('/brand-kit/bg/bg-12.jpg', 'image/jpeg');
  mkdirSync('post-card-checks', { recursive: true });
  for (const [kind, row] of Object.entries(rows)) {
    const props = entityCardProps(kind, kind === 'community' ? { ...row, name: 'Synth <b>Lab</b> & co' } : row);
    const svg = renderEntityCardSvg(props, { logo, backdrop, art: file(`/brand-kit/icons/${ENTITY_ART[kind]}.png`, 'image/png') });
    if (kind === 'community') assert.ok(svg.includes('&amp;') && !svg.includes('<b>'));
    const renderer = new Resvg(svg, { font: { fontBuffers: font, defaultFontFamily: 'Manrope' } });
    const image = renderer.render();
    try {
      assert.equal(image.width, 1200);
      assert.equal(image.height, 630);
      writeFileSync(`post-card-checks/entity-${kind}.png`, image.asPng());
    } finally { image.free(); renderer.free(); }
  }
});
