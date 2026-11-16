import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { extractMentionQuery, isDeletion, useMention } from '@/hooks/use-mention';

describe('extractMentionQuery', () => {
  it('finds a tag at the start of the text and after a space or new line', () => {
    expect(extractMentionQuery('@al', 3)).toEqual({ query: 'al', startIndex: 0 });
    expect(extractMentionQuery('hi @al', 6)).toEqual({ query: 'al', startIndex: 3 });
    expect(extractMentionQuery('hi\n@al', 6)).toEqual({ query: 'al', startIndex: 3 });
  });

  it('leaves an email address alone', () => {
    expect(extractMentionQuery('name@e', 6)).toBeNull();
    expect(extractMentionQuery('mail me at name@example.com', 27)).toBeNull();
  });

  it('needs a character after the @', () => {
    expect(extractMentionQuery('hi @', 4)).toBeNull();
  });
});

describe('isDeletion', () => {
  it('spots a backspace anywhere in the text', () => {
    expect(isDeletion('hi @al', 'hi @a')).toBe(true);
    expect(isDeletion('hi @al there', 'hi @a there')).toBe(true);
    expect(isDeletion('hi @al', '')).toBe(true);
  });

  it('does not mistake new text after a send for a backspace', () => {
    expect(isDeletion('see you tomorrow', '@a')).toBe(false);
    expect(isDeletion('hi @a', 'hi @al')).toBe(false);
  });
});

describe('useMention', () => {
  const setup = () => renderHook(() => useMention({ inputRef: { current: null } }));

  it('opens while typing a tag', () => {
    const { result } = setup();
    act(() => result.current.handleInput('hi @a', 5));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.query).toBe('a');
  });

  it('stays shut while typing an email address', () => {
    const { result } = setup();
    for (const text of ['name@', 'name@e', 'name@ex', 'name@example.com']) {
      act(() => result.current.handleInput(text, text.length));
      expect(result.current.isOpen).toBe(false);
    }
  });

  it('shuts while deleting and comes back with the next character', () => {
    const { result } = setup();
    act(() => result.current.handleInput('hi @alic', 8));
    expect(result.current.isOpen).toBe(true);

    for (const text of ['hi @ali', 'hi @al', 'hi @a', 'hi @']) {
      act(() => result.current.handleInput(text, text.length));
      expect(result.current.isOpen).toBe(false);
    }

    // The same text sent twice does not bring it back.
    act(() => result.current.handleInput('hi @', 4));
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.handleInput('hi @b', 5));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.query).toBe('b');
  });

  it('opens on the first tag typed after a longer message was sent', () => {
    const { result } = setup();
    act(() => result.current.handleInput('see you tomorrow', 16));
    // The composer empties on send without telling the hook.
    act(() => result.current.handleInput('@a', 2));
    expect(result.current.isOpen).toBe(true);
  });

  it('does not open when deleting back into an older tag', () => {
    const { result } = setup();
    act(() => result.current.handleInput('@alice ok', 9));
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.handleInput('@alice o', 8));
    act(() => result.current.handleInput('@alice ', 7));
    act(() => result.current.handleInput('@alice', 6));
    expect(result.current.isOpen).toBe(false);
    act(() => result.current.handleInput('@alicex', 7));
    expect(result.current.isOpen).toBe(true);
  });
});
