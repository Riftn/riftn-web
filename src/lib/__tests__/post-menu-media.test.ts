import { describe, expect, it } from 'vitest';
import { mediaAt } from '@/lib/post-menu';

function box(el: Element, r: { left: number; top: number; width: number; height: number }) {
  el.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => r }) as DOMRect;
}

function card(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  root.querySelectorAll('img, video').forEach((el) => box(el, { left: 0, top: 0, width: 400, height: 300 }));
  return root;
}

describe('post menu: media under the pointer', () => {
  it('copies the full-size picture behind an overlay', () => {
    const root = card('<div><img src="https://dehub.io/cdn-cgi/image/format=auto,width=640/https://cdn.example/a.jpg"><span class="play">Play</span></div><p>words</p>');
    const media = mediaAt(root.querySelector('.play'), root, 100, 100);
    expect(media).toEqual({ url: 'https://cdn.example/a.jpg', kind: 'image' });
  });

  it('calls a .gif a GIF', () => {
    const root = card('<img src="https://cdn.example/b.gif">');
    expect(mediaAt(root.querySelector('img'), root, 10, 10)?.kind).toBe('gif');
  });

  it('gives a video post its file, poster included', () => {
    const root = card('<img src="https://cdn.example/poster.jpg">');
    expect(mediaAt(root.querySelector('img'), root, 10, 10, 'https://cdn.example/v.mp4')).toEqual({ url: 'https://cdn.example/v.mp4', kind: 'video' });
  });

  it('leaves out a paid video (no file given), a playlist, words and avatars', () => {
    const root = card('<video src="blob:x"></video><p>words</p>');
    expect(mediaAt(root.querySelector('video'), root, 10, 10)).toBeUndefined();
    expect(mediaAt(root.querySelector('video'), root, 10, 10, 'https://cdn.example/v.m3u8')).toBeUndefined();
    expect(mediaAt(root.querySelector('p'), root, 900, 900)).toBeUndefined();
    const small = card('<img src="https://cdn.example/avatar.jpg">');
    box(small.querySelector('img')!, { left: 0, top: 0, width: 40, height: 40 });
    expect(mediaAt(small.querySelector('img'), small, 10, 10)).toBeUndefined();
  });

  it('never copies a blurred, locked picture', () => {
    const root = card('<img style="filter: blur(16px)" src="https://cdn.example/locked.jpg">');
    expect(mediaAt(root.querySelector('img'), root, 10, 10)).toBeUndefined();
  });
});
