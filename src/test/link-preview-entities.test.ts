import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '@/lib/api/link-preview';

describe('link preview text', () => {
  it('decodes escaped meta values', () => {
    expect(decodeHtmlEntities('What Riftn&#39;s Tagline Means')).toBe("What Riftn's Tagline Means");
    expect(decodeHtmlEntities('you&#x27;d &amp; &quot;more&quot;')).toBe('you\'d & "more"');
  });
  it('leaves unknown entities and plain text alone', () => {
    expect(decodeHtmlEntities('A &bogus; B')).toBe('A &bogus; B');
    expect(decodeHtmlEntities('plain')).toBe('plain');
  });
});
