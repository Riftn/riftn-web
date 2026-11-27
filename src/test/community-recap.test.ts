import { describe, expect, it } from 'vitest';
import { isCatchUpCommand } from '@/lib/community-recap';

describe('catch me up command', () => {
  it('only takes a short line that starts with it', () => {
    expect(isCatchUpCommand('catch me up')).toBe(true);
    expect(isCatchUpCommand('Catch me up on the last 3 days')).toBe(true);
    expect(isCatchUpCommand('/catchmeup')).toBe(true);
    expect(isCatchUpCommand('can you catch me up')).toBe(false);
    expect(isCatchUpCommand('catch me upstairs')).toBe(false);
    expect(isCatchUpCommand(`catch me up ${'x'.repeat(90)}`)).toBe(false);
  });
});
