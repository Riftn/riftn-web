import { describe, expect, it } from 'vitest';
import { captionQuery } from './caption-query';

describe('captionQuery', () => {
  it('keeps the words a caption is about', () => {
    expect(captionQuery('Sunset over the Bosphorus tonight 🌅 #istanbul @araf https://riftn.com/x')).toBe('Sunset over the Bosphorus tonight');
  });
  it('caps the search at six words and skips short filler', () => {
    expect(captionQuery('a big red fox and a dog ran to the old mill by the sea')).toBe('big red fox and dog ran');
  });
  it('is empty for a caption with nothing to search', () => {
    expect(captionQuery('@someone #tag 123')).toBe('');
  });
});
