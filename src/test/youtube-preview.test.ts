import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeYouTubePreview, isBareYouTubePreview, parseYouTubeVideoId } from '@/lib/youtube-preview';

describe('parseYouTubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=c-Q5r3THR3M', 'c-Q5r3THR3M'],
    ['https://youtube.com/shorts/awLsBlfQ6js?si=Ow3hP5q_a4VRiUj-', 'awLsBlfQ6js'],
    ['https://youtu.be/dQw4w9WgXcQ?t=3', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s', (url, id) => expect(parseYouTubeVideoId(url)).toBe(id));

  it('ignores channels, playlists and other sites', () => {
    expect(parseYouTubeVideoId('https://www.youtube.com/@pbsspacetime')).toBeNull();
    expect(parseYouTubeVideoId('https://github.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});

describe('completeYouTubePreview', () => {
  const shell = { url: 'u', title: '- YouTube', description: 'Enjoy the videos and music you love, upload original content.', image: null, siteName: 'youtube.com' };
  afterEach(() => { (global as any).fetch = undefined; });

  it('treats the shell page as bare', () => {
    expect(isBareYouTubePreview(shell)).toBe(true);
    expect(isBareYouTubePreview({ ...shell, title: 'A real video', image: 'https://i.ytimg.com/x.jpg' })).toBe(false);
  });

  it('fills the title, channel and thumbnail from oEmbed', async () => {
    (global as any).fetch = vi.fn(async () => ({ ok: true, json: async () => ({ title: 'Heisenberg Made a Discovery', author_name: 'PBS Space Time', thumbnail_url: 'https://i.ytimg.com/vi/c-Q5r3THR3M/hqdefault.jpg' }) }));
    expect(await completeYouTubePreview('u', 'c-Q5r3THR3M', shell)).toEqual({
      url: 'u', title: 'Heisenberg Made a Discovery', description: 'PBS Space Time', image: 'https://i.ytimg.com/vi/c-Q5r3THR3M/hqdefault.jpg', siteName: 'YouTube',
    });
  });

  it('still shows the thumbnail when oEmbed fails', async () => {
    (global as any).fetch = vi.fn(async () => { throw new Error('offline'); });
    const preview = await completeYouTubePreview('u', 'c-Q5r3THR3M', shell);
    expect(preview.image).toBe('https://i.ytimg.com/vi/c-Q5r3THR3M/hqdefault.jpg');
    expect(preview.title).toBe('YouTube');
  });
});
