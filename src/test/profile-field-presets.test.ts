import { describe, expect, it } from 'vitest';
import { editableFieldValue, normalizeFieldValue, presetOf, splitProfileFields } from '@/lib/profile-field-presets';

describe('profile field presets', () => {
  it('reads old typed labels as their preset', () => {
    expect(presetOf('Website')).toBe('website');
    expect(presetOf(' homepage ')).toBe('website');
    expect(presetOf('Pronouns')).toBe('pronouns');
    expect(presetOf('Favourite DJ')).toBe('custom');
    expect(presetOf('')).toBe('custom');
  });

  it('turns a typed address into an https link for link presets only', () => {
    expect(normalizeFieldValue('website', 'mysite.com')).toBe('https://mysite.com');
    expect(normalizeFieldValue('website', 'http://mysite.com/a')).toBe('https://mysite.com/a');
    expect(normalizeFieldValue('website', 'https://mysite.com')).toBe('https://mysite.com');
    expect(normalizeFieldValue('website', '  ')).toBe('');
    expect(normalizeFieldValue('pronouns', 'they/them')).toBe('they/them');
    expect(normalizeFieldValue('location', 'St. Ives')).toBe('St. Ives');
  });

  it('moves website-type links to the links list and keeps the rest under the bio', () => {
    const { links, rest } = splitProfileFields([
      { name: 'Website', value: 'https://a.example' },
      { name: 'Website', value: 'not a link' },
      { name: 'Pronouns', value: 'she/her' },
      { name: 'Mastodon', value: 'https://mastodon.social/@a' },
    ]);
    expect(links.map((l) => [l.preset, l.url])).toEqual([['website', 'https://a.example/']]);
    expect(rest.map((r) => r.name)).toEqual(['Website', 'Pronouns', 'Mastodon']);
  });

  it('saves a Cash App cashtag as a cash.app link and edits it as $cashtag', () => {
    expect(presetOf('Cash App')).toBe('cashapp');
    expect(presetOf('cashtag')).toBe('cashapp');
    for (const typed of ['$Mal_99', 'Mal_99', 'cash.app/$Mal_99', 'https://cash.app/$Mal_99/']) {
      expect(normalizeFieldValue('cashapp', typed)).toBe('https://cash.app/$Mal_99');
    }
    expect(normalizeFieldValue('cashapp', '$ not valid')).toBe('$ not valid');
    expect(editableFieldValue('cashapp', 'https://cash.app/$Mal_99')).toBe('$Mal_99');
    expect(editableFieldValue('website', 'https://a.example')).toBe('a.example');
    const { links } = splitProfileFields([{ name: 'Cash App', value: 'https://cash.app/$Mal_99' }]);
    expect(links.map((l) => [l.preset, l.url])).toEqual([['cashapp', 'https://cash.app/$Mal_99']]);
  });
});
