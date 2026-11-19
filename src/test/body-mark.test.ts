import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { bodyMarked, markBody } from '@/lib/body-mark';

afterEach(() => {
  document.body.removeAttribute('data-probe');
});

describe('page-wide state on body', () => {
  it('is a data attribute, and leaves the class list alone', () => {
    document.body.className = 'keep';
    markBody('data-probe', true);
    expect(document.body.hasAttribute('data-probe')).toBe(true);
    expect(bodyMarked('data-probe')).toBe(true);
    expect(document.body.className).toBe('keep');
    markBody('data-probe', false);
    expect(bodyMarked('data-probe')).toBe(false);
    document.body.className = '';
  });

  // A class added to body restyles every element on the page, because the
  // theme sheets match on `[class*=...]`. These open and close on every post
  // and every video, so they must stay attributes.
  it.each([
    'src/hooks/use-in-app-video-mini.ts',
    'src/pages/app/SinglePostPage.tsx',
    'src/components/app/post-stage/PostStagePhone.tsx',
  ])('%s does not put classes on body', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/document\.body\.classList\.(add|remove|toggle)/);
  });

  it('the rules read the attributes', () => {
    const css = readFileSync('src/index.css', 'utf8') + readFileSync('src/styles/post-stage.css', 'utf8');
    for (const name of ['immersive-video-mode', 'immersive-live-mode', 'post-media-back', 'shorts-viewer-open', 'post-stage-mode']) {
      expect(css).toContain(`body[data-${name}]`);
      expect(css).not.toContain(`body.${name}`);
      expect(css).not.toContain(`body:not(.${name})`);
    }
  });
});
