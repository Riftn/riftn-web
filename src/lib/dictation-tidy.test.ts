import { describe, expect, it } from 'vitest';
import { keepsMeaning, tidyDictationLocally } from './dictation-tidy';

describe('tidyDictationLocally', () => {
  it('drops filler sounds and restarts', () => {
    expect(tidyDictationLocally('Um, so I I want the the mic, uh, in the box. hmm, thanks.'))
      .toBe('So I want the mic, in the box. Thanks.');
    expect(tidyDictationLocally('I want it, um.')).toBe('I want it.');
  });
  it('keeps real words and other languages alone', () => {
    expect(tidyDictationLocally('Yavaş yavaş açılıyor, umut ediyorum')).toBe('Yavaş yavaş açılıyor, umut ediyorum');
    expect(tidyDictationLocally('Ahmed says the album is great')).toBe('Ahmed says the album is great');
  });
  it('returns nothing for silence', () => {
    expect(tidyDictationLocally('  uh  ')).toBe('');
  });
});

describe('keepsMeaning', () => {
  it('accepts a cleaned-up version and rejects a rewrite', () => {
    const said = 'please add a mic in the request box so we can talk';
    expect(keepsMeaning(said, 'Please add a mic in the request box so we can talk.')).toBe(true);
    expect(keepsMeaning(said, 'Lütfen istek kutusuna bir mikrofon ekleyin ki konuşabilelim.')).toBe(false);
    expect(keepsMeaning(said, 'Sure!')).toBe(false);
  });
});
