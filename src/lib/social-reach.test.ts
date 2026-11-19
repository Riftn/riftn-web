import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/ai-invoke', () => ({ dehubAuthHeaders: () => ({}) }));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: vi.fn() }));

import { computeSocialReach, hasSocialReach, type VerifiedSocialAccount } from './social-reach';

const account = (platform: string, followers: number | null): VerifiedSocialAccount => ({
  platform,
  username: 'creator',
  profileUrl: null,
  followers,
  followersUpdatedAt: null,
});

describe('computeSocialReach', () => {
  it('adds verified counts of connected accounts to Riftn followers, in display order', () => {
    const reach = computeSocialReach([account('youtube', 3400), account('twitter', 1200)], 50);
    expect(reach.dehub).toBe(50);
    expect(reach.socials.map((s) => s.platform)).toEqual(['twitter', 'youtube']);
    expect(reach.total).toBe(4650);
    expect(hasSocialReach(reach)).toBe(true);
  });

  it('ignores accounts with no reported count, zero, or an unsupported platform', () => {
    const reach = computeSocialReach(
      [account('twitter', null), account('instagram', 0), account('linkedin', 900), account('tiktok', -5)],
      10,
    );
    expect(reach.socials).toEqual([]);
    expect(reach.total).toBe(10);
    expect(hasSocialReach(reach)).toBe(false);
  });

  it('copes with no accounts and no Riftn count', () => {
    expect(computeSocialReach(undefined, null)).toEqual({ dehub: 0, socials: [], total: 0 });
  });

  it('marks verified counts as verified', () => {
    const reach = computeSocialReach([account('twitter', 1200)], 0);
    expect(reach.socials).toEqual([{ platform: 'twitter', label: 'X (Twitter)', count: 1200, verified: true }]);
  });

  it('reads the counts entered in the app from customs, like the app does', () => {
    const customs = {
      twitterLink: 'https://x.com/creator',
      twitterFollowers: 1000,
      telegramLink: 'https://t.me/creator',
      telegramFollowers: '2,500',
      instagramFollowers: 9000, // no link: ignored, as on the app
      youtubeLink: '',
      youtubeFollowers: 400,
    };
    const reach = computeSocialReach(undefined, 20, customs);
    expect(reach.socials).toEqual([
      { platform: 'twitter', label: 'X (Twitter)', count: 1000, verified: false },
      { platform: 'telegram', label: 'Telegram', count: 2500, verified: false },
    ]);
    expect(reach.total).toBe(3520);
  });

  it('prefers a verified count over the entered one for the same platform', () => {
    const reach = computeSocialReach([account('twitter', 1500)], 0, {
      twitterLink: 'https://x.com/creator',
      twitterFollowers: 99999,
      tiktokLink: 'https://tiktok.com/@creator',
      tiktokFollowers: 300,
    });
    expect(reach.socials.map((s) => [s.platform, s.count, s.verified])).toEqual([
      ['twitter', 1500, true],
      ['tiktok', 300, false],
    ]);
    expect(reach.total).toBe(1800);
  });

  it('rejects entered counts that are not whole numbers or are past the cap', () => {
    const reach = computeSocialReach(undefined, 0, {
      twitterLink: 'x', twitterFollowers: -3,
      instagramLink: 'x', instagramFollowers: 'lots',
      tiktokLink: 'x', tiktokFollowers: 1.5,
      youtubeLink: 'x', youtubeFollowers: 10_000_000_000,
    });
    expect(reach.socials).toEqual([]);
  });
});
