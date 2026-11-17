import { describe, it, expect } from 'vitest';
import { parseDehubLink, findDehubLinks } from '@/lib/dehub-links';

describe('shared skills', () => {
  it.each(['https://riftn.com', 'https://dehub.io', ''])('recognizes skill links from %s', origin => {
    expect(parseDehubLink(origin + '/app/assistant?skill=the-riftn-logo')).toMatchObject({
      kind: 'skill', skillSlug: 'the-riftn-logo', path: '/app/assistant?skill=the-riftn-logo',
    });
  });
  it('keeps other query parameters and decodes the slug', () => {
    expect(parseDehubLink('https://riftn.com/app/assistant?from=post&skill=brand%2Dkit')).toMatchObject({
      kind: 'skill', skillSlug: 'brand-kit', path: '/app/assistant?from=post&skill=brand%2Dkit',
    });
  });
  it.each([
    'https://evil.example/app/assistant?skill=logo',
    '/app/assistant', '/app/assistant?skill=', '/app/assistant?skill=bad%2Fslug',
    '/app/assistant/other?skill=logo',
  ])('does not card %s', url => {
    expect(parseDehubLink(url)).toBeNull();
    expect(findDehubLinks(url)).toEqual([]);
  });
  it('finds a skill alongside another entity and leaves foreign hosts alone', () => {
    expect(findDehubLinks('Try https://riftn.com/app/assistant?skill=logo. https://evil.example/app/assistant?skill=logo /app/post/12').map(link => link.kind)).toEqual(['skill', 'post']);
  });
});
