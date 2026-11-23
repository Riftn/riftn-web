import { describe, expect, it } from 'vitest';
import { momentTextLooksForeign } from './story-translate';

describe('momentTextLooksForeign', () => {
  it('offers English captions to a Turkish reader', () => {
    expect(momentTextLooksForeign('Good morning everyone, what a day', 'tr')).toBe(true);
  });

  it('leaves a caption in the reader\'s own language alone', () => {
    expect(momentTextLooksForeign('Good morning everyone, what a day', 'en')).toBe(false);
    expect(momentTextLooksForeign('Günaydın herkese, harika bir gün', 'tr')).toBe(false);
    expect(momentTextLooksForeign('مرحبا بالجميع', 'ar')).toBe(false);
  });

  it('settles different scripts on sight', () => {
    expect(momentTextLooksForeign('مرحبا بالجميع', 'en')).toBe(true);
    expect(momentTextLooksForeign('Hello there', 'ar')).toBe(true);
    expect(momentTextLooksForeign('こんにちは 東京', 'zh')).toBe(true);
    expect(momentTextLooksForeign('东京 很好', 'zh-TW')).toBe(false);
  });

  it('uses letters the reader does not write when the words say nothing', () => {
    expect(momentTextLooksForeign('Harika gün', 'en')).toBe(true);
    expect(momentTextLooksForeign('Sunset vibes', 'tr')).toBe(false);
    expect(momentTextLooksForeign('Sunset vibes', 'en')).toBe(false);
  });

  it('ignores links, handles, tags and emoji-only captions', () => {
    expect(momentTextLooksForeign('🔥🔥🔥', 'en')).toBe(false);
    expect(momentTextLooksForeign('@günay #istanbul', 'en')).toBe(false);
    expect(momentTextLooksForeign('', 'en')).toBe(false);
    expect(momentTextLooksForeign(null, 'en')).toBe(false);
  });
});
