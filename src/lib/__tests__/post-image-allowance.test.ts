import { describe, expect, it } from 'vitest';
import { getPostMediaAllowanceForAccount, getPostImageLimitForBadge } from '@/lib/post-image-allowance';

describe('getPostImageLimitForBadge', () => {
  it('keeps the four-image baseline for accounts without a badge', () => {
    expect(getPostImageLimitForBadge(0)).toBe(4);
  });

  it('gives every badge holder at least 30 and caps Megalodon at 40', () => {
    expect(getPostImageLimitForBadge(10_000)).toBe(30);
    expect(getPostImageLimitForBadge(5_000_000)).toBe(37);
    expect(getPostImageLimitForBadge(25_000_000)).toBe(39);
    expect(getPostImageLimitForBadge(50_000_000)).toBe(40);
  });

  it('honours a still-valid earned badge lock', () => {
    expect(getPostImageLimitForBadge(10_000, undefined, {
      tier: 'Megalodon',
      requirement: 10_000,
    })).toBe(40);
  });
});

describe('media allowance before the quota read arrives', () => {
  it('keeps a lent or display-only badge out of the allowance', () => {
    const account = { username: 'algiers', ownBadgeBalance: 0, badgeBalance: 250_000 };
    expect(getPostMediaAllowanceForAccount(account)).toEqual({ tier: null, bytes: 1024 ** 3 });
  });

  it('recognizes a full-rights grant and a valid earned lock', () => {
    expect(getPostMediaAllowanceForAccount({ username: '@Mal', badgeBalance: 0 }).tier).toBe('Megalodon');
    expect(getPostMediaAllowanceForAccount({
      badgeBalance: 10_000, badgeLock: { tier: 'King Cobra', requirement: 10_000 },
    }).bytes).toBe(1.5 * 1024 ** 3);
  });
});
