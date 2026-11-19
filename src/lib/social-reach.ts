/**
 * Total reach: Riftn followers plus the follower counts of the creator's
 * linked socials.
 *
 * A platform's count comes from one of two places, best first:
 * 1. The connected account (Zernio, the same connection multi-posting uses),
 *    read by the `social-reach` edge function. These are verified.
 * 2. The count the creator entered in the app's settings, stored in the
 *    profile's `customs` blob as `<platform>Followers` beside its link. This is
 *    what the app's profile shows, so a profile reads the same on web and app.
 *    It only counts while its link is set.
 */

import { supabase } from '@/integrations/supabase/client';
import { dehubAuthHeaders } from '@/lib/ai-invoke';
import { ensureFreshToken } from '@/lib/api/dehub/core';

export type SocialPlatform =
  | 'twitter'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'discord'
  | 'facebook';

export interface SocialReachPlatform {
  platform: SocialPlatform;
  /** Top-level account field that holds the profile link. */
  linkKey: `${SocialPlatform}Link`;
  /** Platform name as people know it — never translated. */
  label: string;
}

/** Platforms that can be connected for a verified count, in display order. */
export const SOCIAL_REACH_PLATFORMS: readonly SocialReachPlatform[] = [
  { platform: 'twitter', linkKey: 'twitterLink', label: 'X (Twitter)' },
  { platform: 'instagram', linkKey: 'instagramLink', label: 'Instagram' },
  { platform: 'tiktok', linkKey: 'tiktokLink', label: 'TikTok' },
  { platform: 'youtube', linkKey: 'youtubeLink', label: 'YouTube' },
  { platform: 'discord', linkKey: 'discordLink', label: 'Discord' },
  { platform: 'facebook', linkKey: 'facebookLink', label: 'Facebook' },
];

export const isReachPlatform = (value: string): value is SocialPlatform =>
  SOCIAL_REACH_PLATFORMS.some((p) => p.platform === value);

/** One connected account, as the edge function reports it. */
export interface VerifiedSocialAccount {
  platform: string;
  username: string;
  profileUrl: string | null;
  /** Null until the platform has reported a count for this account. */
  followers: number | null;
  followersUpdatedAt: string | null;
}

/** Every platform a creator can link, including ones that cannot be connected. */
export type ReachPlatform = SocialPlatform | 'telegram';

/** Platforms whose entered count is read from `customs`, in display order (same as the app). */
const ENTERED_PLATFORMS: readonly { platform: ReachPlatform; label: string }[] = [
  { platform: 'twitter', label: 'X (Twitter)' },
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'discord', label: 'Discord' },
  { platform: 'telegram', label: 'Telegram' },
  { platform: 'facebook', label: 'Facebook' },
];

/** Same cap the app puts on an entered count; anything past it is a typo. */
const MAX_ENTERED_FOLLOWERS = 9_999_999_999;

export interface SocialReachEntry {
  platform: ReachPlatform;
  label: string;
  count: number;
  /** True when the count came from a connected account, false when the creator entered it. */
  verified: boolean;
}

export interface SocialReach {
  /** Riftn followers, as counted by Riftn. */
  dehub: number;
  /** Linked platforms with a positive count, in display order. */
  socials: SocialReachEntry[];
  /** `dehub` plus every social count. */
  total: number;
}

const toCount = (raw: unknown): number | null => {
  const value = typeof raw === 'number' ? raw : Number.NaN;
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** An entered count as the API stores it (number, or digits in a string), or null. */
const toEnteredCount = (raw: unknown): number | null => {
  let value: number;
  if (typeof raw === 'number') value = raw;
  else if (typeof raw === 'string') {
    const digits = raw.replace(/[\s,_.']/g, '');
    if (!/^\d+$/.test(digits)) return null;
    value = Number(digits);
  } else return null;
  if (!Number.isInteger(value) || value < 0 || value > MAX_ENTERED_FOLLOWERS) return null;
  return value;
};

/**
 * Work out a profile's reach.
 *
 * `customs` is the profile's customs blob with its social links merged in (as
 * `useDehubProfile` returns it). For each platform a verified count wins; the
 * entered count fills in where there is none, as long as the link is set.
 */
export function computeSocialReach(
  accounts: readonly VerifiedSocialAccount[] | null | undefined,
  dehubFollowers: number | null | undefined,
  customs?: Record<string, unknown> | null,
): SocialReach {
  const dehub = toCount(dehubFollowers) ?? 0;
  const blob = isRecord(customs) ? customs : {};
  const socials: SocialReachEntry[] = [];
  for (const { platform, label } of ENTERED_PLATFORMS) {
    const account = accounts?.find((a) => a.platform === platform);
    const verified = toCount(account?.followers);
    if (verified !== null && verified > 0) {
      socials.push({ platform, label, count: verified, verified: true });
      continue;
    }
    const link = blob[`${platform}Link`];
    if (typeof link !== 'string' || !link.trim()) continue;
    const entered = toEnteredCount(blob[`${platform}Followers`]);
    if (entered === null || entered <= 0) continue;
    socials.push({ platform, label, count: entered, verified: false });
  }
  return {
    dehub,
    socials,
    total: socials.reduce((sum, entry) => sum + entry.count, dehub),
  };
}

/** True when there is a social count to show on top of Riftn followers. */
export function hasSocialReach(reach: SocialReach): boolean {
  return reach.socials.length > 0;
}

const asAccounts = (data: unknown): VerifiedSocialAccount[] => {
  const list = (data as { accounts?: unknown })?.accounts;
  return Array.isArray(list) ? (list as VerifiedSocialAccount[]) : [];
};

/** Anyone's connected accounts — public, cached server-side. */
export async function fetchSocialReach(wallet: string): Promise<VerifiedSocialAccount[]> {
  const { data, error } = await supabase.functions.invoke('social-reach', { body: { action: 'get', wallet } });
  if (error) throw error;
  return asAccounts(data);
}

/** Re-read the signed-in creator's own accounts now, skipping the cache. */
export async function syncSocialReach(): Promise<VerifiedSocialAccount[]> {
  await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke('social-reach', {
    body: { action: 'sync' },
    headers: dehubAuthHeaders(),
  });
  if (error) throw error;
  return asAccounts(data);
}
