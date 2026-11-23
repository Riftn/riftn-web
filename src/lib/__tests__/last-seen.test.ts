import { describe, expect, it } from 'vitest';
import { getShowLastSeen, lastSeenWhen, mergeShowLastSeen } from '../last-seen';

describe('last seen', () => {
  it('is off unless turned on', () => {
    expect(getShowLastSeen(undefined)).toBe(false);
    expect(getShowLastSeen({ showLastSeen: 'off' })).toBe(false);
    expect(getShowLastSeen({ showLastSeen: 'on' })).toBe(true);
    expect(mergeShowLastSeen({ a: '1' }, true)).toEqual({ a: '1', showLastSeen: 'on' });
  });

  it('reads short and relative', () => {
    const now = Date.UTC(2026, 10, 22, 18, 0);
    expect(lastSeenWhen(now - 20_000, 'en', now)).toBeNull();
    expect(lastSeenWhen(now - 5 * 60_000, 'en', now)).toBe('5 min. ago');
    expect(lastSeenWhen(now - 3 * 3600_000, 'en', now)).toBe('3 hr. ago');
    expect(lastSeenWhen(now - 3 * 86400_000, 'en', now)).toMatch(/Nov/);
  });
});
