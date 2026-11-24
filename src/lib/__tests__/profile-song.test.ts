import { describe, expect, it } from 'vitest';
import { encodeProfileSong, profileSongFromSound, readProfileSong, withProfileSong, PROFILE_SONG_KEY } from '@/lib/profile-song';

const sound = {
  url: 'https://api.audius.co/v1/tracks/abc/stream?app_name=Riftn#t=48&end=78&src=audius&page=https%3A%2F%2Faudius.co%2Fx',
  title: 'Golden Hour Drive',
  creator: 'Lumen Coast',
  creatorAvatar: 'https://example.com/art.jpg',
};

describe('profile song', () => {
  it('turns a picked song into a profile song with its part', () => {
    const song = profileSongFromSound(sound, true)!;
    expect(song.url).toBe('https://api.audius.co/v1/tracks/abc/stream?app_name=Riftn');
    expect(song.start).toBe(48);
    expect(song.end).toBe(78);
    expect(song.autoplay).toBe(true);
  });

  it('round-trips through customs and keeps the key first', () => {
    const song = profileSongFromSound(sound, false)!;
    const customs = withProfileSong({ theme: 'osaka', nested: { a: 1 } as unknown as string }, song);
    expect(Object.keys(customs)[0]).toBe(PROFILE_SONG_KEY);
    expect(customs.theme).toBe('osaka');
    expect('nested' in customs).toBe(false);
    expect(readProfileSong(customs)).toEqual(song);
  });

  it('removes the song', () => {
    const customs = withProfileSong({ [PROFILE_SONG_KEY]: encodeProfileSong(profileSongFromSound(sound, true)!), theme: 'osaka' }, null);
    expect(customs).toEqual({ theme: 'osaka' });
    expect(readProfileSong(customs)).toBeNull();
  });

  it('fits the 500 character limit', () => {
    const long = profileSongFromSound({ ...sound, title: 'x'.repeat(300), creator: 'y'.repeat(300), creatorAvatar: `https://example.com/${'a'.repeat(200)}.jpg` }, true)!;
    expect(encodeProfileSong(long).length).toBeLessThanOrEqual(500);
  });

  it('ignores broken or unsafe values', () => {
    expect(readProfileSong({ [PROFILE_SONG_KEY]: 'nope' })).toBeNull();
    expect(readProfileSong({ [PROFILE_SONG_KEY]: '{"u":"javascript:alert(1)","t":"x"}' })).toBeNull();
    expect(readProfileSong({ [PROFILE_SONG_KEY]: '{"u":"https://a.b/s","t":"x","s":10,"e":500}' })?.end).toBe(40);
  });
});
