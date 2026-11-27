import { describe, expect, it } from 'vitest';
import { NAMED_FEEDS, homeApiPostType, namedFeedFor, toHomePostType } from './feed-utils';

describe('named Home filters', () => {
  it('maps each name to the post types it covers', () => {
    expect(homeApiPostType('pulse')).toBe('feed-simple,feed-images');
    expect(homeApiPostType('motion')).toBe('video,short');
    expect(homeApiPostType('echo')).toBe('feed-audio');
    expect(NAMED_FEEDS.map((f) => `${f.name} · ${f.purpose}`)).toEqual(['Pulse · Read & discuss', 'Motion · Watch', 'Echo · Listen']);
  });

  it('leaves plain post types and Home alone', () => {
    expect(homeApiPostType('all')).toBeUndefined();
    expect(homeApiPostType('article')).toBe('article');
    expect(namedFeedFor('video')).toBeUndefined();
  });

  it('reads stored values back safely', () => {
    expect(toHomePostType('motion')).toBe('motion');
    expect(toHomePostType('feed-audio')).toBe('feed-audio');
    expect(toHomePostType('nonsense')).toBe('all');
    expect(toHomePostType(undefined)).toBe('all');
  });
});
