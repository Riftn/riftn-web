import { describe, expect, it } from 'vitest';
import { diffWords } from './post-edit-diff';

describe('diffWords', () => {
  it('marks nothing when the text is the same', () => {
    expect(diffWords('Legs are done.', 'Legs are done.')).toEqual([{ type: 'same', text: 'Legs are done.' }]);
    expect(diffWords('', '')).toEqual([]);
  });

  it('marks a swapped word and keeps the rest', () => {
    expect(diffWords('5 km before work.', '6 km before work.')).toEqual([
      { type: 'del', text: '5' },
      { type: 'add', text: '6' },
      { type: 'same', text: ' km before work.' },
    ]);
  });

  it('marks words added at the end', () => {
    const parts = diffWords('Legs are done.', 'Legs are done. Worth it.');
    expect(parts[0]).toEqual({ type: 'same', text: 'Legs are done.' });
    expect(parts.filter((p) => p.type === 'add').map((p) => p.text).join('')).toBe(' Worth it.');
    expect(parts.some((p) => p.type === 'del')).toBe(false);
  });

  it('handles text appearing from nothing and going away', () => {
    expect(diffWords('', 'Hello')).toEqual([{ type: 'add', text: 'Hello' }]);
    expect(diffWords('Hello', '')).toEqual([{ type: 'del', text: 'Hello' }]);
  });

  it('rebuilds both versions from its parts', () => {
    const before = 'Morning run by the river, 5 km.';
    const after = 'Sunrise run by the harbour, 6 km before work.';
    const parts = diffWords(before, after);
    expect(parts.filter((p) => p.type !== 'add').map((p) => p.text).join('')).toBe(before);
    expect(parts.filter((p) => p.type !== 'del').map((p) => p.text).join('')).toBe(after);
  });
});
