import { describe, expect, it } from 'vitest';
import { suggestEmailFix } from './email-typo';

describe('suggestEmailFix', () => {
  it('fixes common provider slips', () => {
    expect(suggestEmailFix('skyler@gmail.coms')).toBe('skyler@gmail.com');
    expect(suggestEmailFix('a@gmial.com')).toBe('a@gmail.com');
    expect(suggestEmailFix('a@gmail.con')).toBe('a@gmail.com');
    expect(suggestEmailFix('a@hotmial.com')).toBe('a@hotmail.com');
    expect(suggestEmailFix('a@outlok.com')).toBe('a@outlook.com');
    expect(suggestEmailFix(' a@yaho.com ')).toBe('a@yahoo.com');
    expect(suggestEmailFix('a@iclod.com')).toBe('a@icloud.com');
    expect(suggestEmailFix('a@gmail.co')).toBe('a@gmail.com');
    expect(suggestEmailFix('a@gmail.cm')).toBe('a@gmail.com');
  });

  it('keeps the local part as typed', () => {
    expect(suggestEmailFix('Mal.Erica+x@GMAIL.CON')).toBe('Mal.Erica+x@gmail.com');
  });

  it('leaves real addresses alone', () => {
    for (const ok of ['a@gmail.com', 'a@mail.com', 'a@me.com', 'a@mac.com', 'a@ymail.com', 'a@riftn.com', 'a@company.io', 'a@live.com', 'a@hotmail.es', 'a@yahoo.co.jp', 'a@yahoo.es', 'a@email.com', 'a@outlook.it']) {
      expect(suggestEmailFix(ok)).toBeNull();
    }
  });

  it('ignores input that is not an email yet', () => {
    expect(suggestEmailFix('')).toBeNull();
    expect(suggestEmailFix('gmail.com')).toBeNull();
    expect(suggestEmailFix('a@')).toBeNull();
  });
});
