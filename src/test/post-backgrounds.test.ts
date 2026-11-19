import { describe, expect, it } from 'vitest';
import {
  POST_BACKGROUNDS,
  mergePostBg,
  parsePostBg,
  parsePostBgColors,
  postBgFromToken,
  postBgPaletteIndex,
  postBgToken,
  postBgTone,
  postBgById,
  withPostBgColors,
} from '@/lib/post-backgrounds';

const KEY = 'postbgs/0x' + 'a'.repeat(40) + '-' + 'b'.repeat(32) + '.webp';

describe('profile post backgrounds', () => {
  it('ships 13 still, 21 moving and your own photo, all with unique ids', () => {
    expect(POST_BACKGROUNDS.filter((b) => b.kind === 'still')).toHaveLength(13);
    expect(POST_BACKGROUNDS.filter((b) => b.kind === 'moving')).toHaveLength(21);
    expect(POST_BACKGROUNDS.filter((b) => b.kind === 'photo')).toHaveLength(1);
    expect(new Set(POST_BACKGROUNDS.map((b) => b.id)).size).toBe(35);
  });

  it('gives every moving backdrop at least four colourways of plain hex', () => {
    for (const b of POST_BACKGROUNDS.filter((x) => x.kind === 'moving')) {
      expect(b.palettes.length, b.id).toBeGreaterThanOrEqual(4);
      for (const p of b.palettes) for (const c of p) expect(c, b.id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('reads only known ids from customs', () => {
    expect(parsePostBg({ postBg: 'aurora' })?.name).toBe('Aurora');
    expect(parsePostBg({ postBg: '' })).toBeNull();
    expect(parsePostBg({ postBg: 'url(evil)' })).toBeNull();
    expect(parsePostBg(undefined)).toBeNull();
  });

  it('applies a colour choice and works out the text colour from it', () => {
    const bg = parsePostBg({ postBg: 'mesh', postBgColors: '#ffffff,#eeeeee,#dddddd' });
    expect(bg?.colors).toEqual(['#ffffff', '#eeeeee', '#dddddd']);
    expect(bg?.custom).toBe(true);
    expect(bg?.tone).toBe('light');
    expect(parsePostBg({ postBg: 'mesh' })?.tone).toBe('dark');
    // Junk colours fall back to the default colourway.
    expect(parsePostBg({ postBg: 'mesh', postBgColors: 'red;background:url(x)' })?.colors).toEqual(postBgById('mesh')?.palettes[0]);
    expect(parsePostBgColors('#000000,#fff,#111111')).toBeNull();
    expect(postBgTone(['#000000', '#ffffff', '#ffffff'])).toBe('dark');
  });

  it('knows which preset is on', () => {
    const mesh = postBgById('mesh')!;
    expect(postBgPaletteIndex(withPostBgColors(mesh, mesh.palettes[2]))).toBe(2);
    expect(postBgPaletteIndex(withPostBgColors(mesh, ['#123456', '#123456', '#123456']))).toBe(-1);
  });

  it('only shows a photo from our own uploads', () => {
    expect(parsePostBg({ postBg: 'photo', postBgImage: KEY })?.image).toMatch(/\/postbgs\/0xa+-b+\.webp$/);
    expect(parsePostBg({ postBg: 'photo', postBgImage: 'https://evil.example/x.gif' })).toBeNull();
    expect(parsePostBg({ postBg: 'photo' })).toBeNull();
  });

  it('carries a whole look through one string', () => {
    const bg = parsePostBg({ postBg: 'rift', postBgColors: '#000000,#ffffff,#ff0000' });
    expect(postBgFromToken(postBgToken(bg))?.colors).toEqual(['#000000', '#ffffff', '#ff0000']);
    expect(postBgFromToken('aurora')?.id).toBe('aurora');
    expect(postBgFromToken('photo||https://evil.example/x.gif')).toBeNull();
  });

  it('keeps every other customs key when saving', () => {
    expect(mergePostBg({ defaultProfileTab: 'posts', postBg: 'ink' }, 'holo')).toEqual({ defaultProfileTab: 'posts', postBg: 'holo', postBgColors: '' });
    expect(mergePostBg({ a: 1 }, null)).toEqual({ a: 1, postBg: '', postBgColors: '' });
    expect(mergePostBg({}, 'nope')).toEqual({ postBg: '', postBgColors: '' });
    expect(mergePostBg({ postBgImage: KEY }, { id: 'chrome', colors: ['#000000', '#ffffff', '#888888'] })).toEqual({ postBgImage: KEY, postBg: 'chrome', postBgColors: '#000000,#ffffff,#888888' });
    // The default colourway is stored as nothing, so old apps and new agree.
    expect(mergePostBg({}, { id: 'chrome', colors: postBgById('chrome')!.palettes[0] }).postBgColors).toBe('');
  });
});
