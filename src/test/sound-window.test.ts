import { describe, expect, it } from 'vitest';
import { buildSoundtrackTag, parseSoundtrackTag } from '@/lib/soundtrack';
import { soundCredit, soundMix, soundTimeFor, soundWindow, withSoundMix, withSoundWindow } from '@/lib/sound-window';

const AUDIUS = 'https://api.audius.co/v1/tracks/ZlwB7/stream?app_name=Riftn';

describe('sound window', () => {
  it('round-trips the part and credit through a soundtrack tag', () => {
    const url = withSoundWindow(AUDIUS, { start: 42, end: 72 }, {
      source: 'audius',
      license: 'Audius Open Music License',
      licenseUrl: 'https://audius.org/open-music-license.pdf',
      page: 'https://audius.co/arly/chill',
    });
    const tag = buildSoundtrackTag({ tokenId: '0', title: 'Chill: the remix', creator: 'Arly', url });
    expect(tag.startsWith('[soundtrack:0:Chill%3A%20the%20remix:Arly:https://api.audius.co/')).toBe(true);
    const parsed = parseSoundtrackTag(`hello\n${tag}`);
    expect(parsed.soundtrackTitle).toBe('Chill: the remix');
    expect(parsed.soundtrackCreator).toBe('Arly');
    expect(soundWindow(parsed.soundtrackUrl)).toEqual({ start: 42, end: 72 });
    expect(soundCredit(parsed.soundtrackUrl)).toEqual({
      source: 'audius',
      license: 'Audius Open Music License',
      licenseUrl: 'https://audius.org/open-music-license.pdf',
      page: 'https://audius.co/arly/chill',
    });
  });

  it('leaves plain links alone', () => {
    expect(soundWindow('https://cdn.test/a.mp3')).toBeNull();
    expect(soundCredit('https://cdn.test/a.mp3')).toBeNull();
    expect(withSoundWindow('https://cdn.test/a.mp3', null)).toBe('https://cdn.test/a.mp3');
    expect(soundTimeFor('https://cdn.test/a.mp3', 12)).toBe(12);
  });

  it('trims a Riftn sound without a credit', () => {
    const url = withSoundWindow('https://cdn.test/a.mp3', { start: 10 }, { source: 'riftn' });
    expect(url).toBe('https://cdn.test/a.mp3#t=10');
    expect(soundCredit(url)).toBeNull();
  });

  it('maps video time into the looping part', () => {
    const url = withSoundWindow(AUDIUS, { start: 30, end: 45 }, null);
    expect(soundTimeFor(url, 0)).toBe(30);
    expect(soundTimeFor(url, 20)).toBe(35);
  });

  it('ignores credit links that are not https', () => {
    expect(soundCredit(`${AUDIUS}#src=audius&page=javascript:alert(1)`)?.page).toBeUndefined();
  });
});

describe('sound mix', () => {
  it('defaults to the song alone and reads levels', () => {
    expect(soundMix('https://x/a.mp3')).toEqual({ song: 1, video: 0 });
    expect(soundMix('https://x/a.mp3#t=4&sv=80&vv=40')).toEqual({ song: 0.8, video: 0.4 });
  });
  it('writes levels, drops them for the default, keeps the rest', () => {
    const url = withSoundMix('https://x/a.mp3#t=4&src=audius', { song: 0.8, video: 0.4 });
    expect(url).toBe('https://x/a.mp3#t=4&src=audius&sv=80&vv=40');
    expect(withSoundMix(url, { song: 1, video: 0 })).toBe('https://x/a.mp3#t=4&src=audius');
  });
  it('a new part keeps the levels', () => {
    expect(soundMix(withSoundWindow('https://x/a.mp3#sv=50&vv=50', { start: 10, end: 20 }))).toEqual({ song: 0.5, video: 0.5 });
  });
});
