import { describe, expect, it } from 'vitest';
import { postTextRuns, stripPostTextStyles, togglePostTextStyle } from './post-text-format';

describe('post text formatting', () => {
  it('keeps nested styles, line breaks and literal HTML', () => {
    expect(postTextRuns('[b]hello [i]there[/i][/b]\n[u]<img>[/u]')).toEqual([
      { text: 'hello ', styles: ['b'] },
      { text: 'there', styles: ['b', 'i'] },
      { text: '\n', styles: [] },
      { text: '<img>', styles: ['u'] },
    ]);
  });

  it('round-trips the same selection and respects the API length limit', () => {
    const selection = { start: 2, end: 5 };
    expect(togglePostTextStyle('abc def', selection, 'i', 13)).toBeNull();
    const result = togglePostTextStyle('abc def', selection, 'i', 14)!;
    expect(result.text).toBe('ab[i]c d[/i]ef');
    expect(togglePostTextStyle(result.text, result.selection, 'i', 14)).toEqual({ text: 'abc def', selection });
  });

  it('keeps unmatched markers and unsupported styles literal', () => {
    const text = '[i]unclosed [style]red[/style]';
    expect(stripPostTextStyles(text)).toBe(text);
  });
});
