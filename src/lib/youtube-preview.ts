/**
 * YouTube link previews
 * =====================
 * YouTube answers our crawler with its bare shell page for many videos: the
 * title "- YouTube", the site blurb and no share image. The card then shows a
 * grey box instead of the video. YouTube's own oEmbed always has the title,
 * channel and thumbnail, so a bare crawl is filled in from there, the same way
 * Spotify links fall back to Spotify's oEmbed. The app runs the same rule
 * (riftn-mobile libs/youtube-preview.ts).
 */
import type { LinkPreviewData } from './api/link-preview';

const ID = /^[A-Za-z0-9_-]{11}$/;

/** The video id in a YouTube watch, share, Shorts, live or embed link. */
export function parseYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = parsed.pathname.split('/')[1] || null;
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'watch') id = parsed.searchParams.get('v');
      else if (['shorts', 'live', 'embed', 'v'].includes(parts[0])) id = parts[1] || null;
    }
    return id && ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

const GENERIC_BLURB = /^Enjoy the videos and music you love/i;

/** A crawl that only read YouTube's shell page, not the video. */
export function isBareYouTubePreview(preview: LinkPreviewData | null | undefined): boolean {
  return !preview?.image || !realTitle(preview.title);
}

/** The crawled title, unless it is the shell page's or just the domain. */
function realTitle(title: string | null | undefined): string {
  const t = (title || '').trim();
  return /^(- )?YouTube$/i.test(t) || /^(www\.|m\.)?(youtube\.com|youtu\.be)$/i.test(t) ? '' : t;
}

export function youTubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** The crawl, filled in from YouTube's oEmbed where it came back bare. */
export async function completeYouTubePreview(url: string, id: string, crawled: LinkPreviewData | null): Promise<LinkPreviewData> {
  let title = '';
  let channel = '';
  let image: string | null = null;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (res.ok) {
      const data = await res.json();
      title = typeof data?.title === 'string' ? data.title : '';
      channel = typeof data?.author_name === 'string' ? data.author_name : '';
      image = typeof data?.thumbnail_url === 'string' ? data.thumbnail_url : null;
    }
  } catch {
    /* private or removed video: the thumbnail below still loads for most */
  }
  const crawledTitle = realTitle(crawled?.title);
  const crawledBlurb = crawled?.description && !GENERIC_BLURB.test(crawled.description) ? crawled.description : '';
  return {
    url,
    title: title || crawledTitle || 'YouTube',
    description: crawledBlurb || channel,
    image: crawled?.image || image || youTubeThumbnail(id),
    siteName: 'YouTube',
  };
}
