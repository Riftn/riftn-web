import { describe, expect, it } from 'vitest';
import { hasOAuthSessionCallback } from '../oauth-return';

describe('social OAuth redirect', () => {
  it.each([
    ['', ''],
    ['?error=access_denied', ''],
    ['', '#error=access_denied&error_code=access_denied'],
    ['', '#access_token=only-one-token'],
  ])('ignores a return without a session (%s%s)', (search, hash) => {
    expect(hasOAuthSessionCallback(search, hash)).toBe(false);
  });

  it('recognizes a session returned in the fragment', () => {
    expect(hasOAuthSessionCallback('', '#access_token=access&refresh_token=refresh')).toBe(true);
  });
});
