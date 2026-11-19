/**
 * OG Holder Challenge
 * ===================
 * Ranks accounts by how many original DHB holders they brought to Riftn.
 *
 * An "OG holder" is someone who joined with your invite link (a row in
 * `affiliate_referrals`) and whose Riftn wallet holds DHB, read from the
 * holdings board's cache (on-chain balances, rebuilt on a schedule). So the
 * challenge counts what it says: old holders onboarded, with their tokens
 * now in the app.
 *
 * Rows come out in the affiliate board's shape (`directReferrals` = OG
 * holders brought), so the page's row markup, search and sort work as is.
 * Ties break on the DHB those holders brought in.
 */

import { supabase } from '@/integrations/supabase/client';
import { getAccountSummaries, getLeaderboard, type AccountSummary, type LeaderboardPeriod } from '@/lib/api/dehub';
import type { AffiliateLeaderboardEntry } from '@/lib/api/affiliate-leaderboard';
import { rankOgHolders } from '@/lib/og-challenge-rank';

const MAX_REFERRAL_ROWS = 10_000;
const MAX_PROFILE_LOOKUPS = 50;
const PERIOD_DAYS: Record<Exclude<LeaderboardPeriod, 'all'>, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export interface OgChallengeEntry extends AffiliateLeaderboardEntry {
  /** DHB the OG holders this account brought hold now (hidden balances left out). */
  ogDhb: number;
}

export async function getOgChallengeLeaderboard(period: LeaderboardPeriod = 'all'): Promise<OgChallengeEntry[]> {
  let query = supabase
    .from('affiliate_referrals')
    .select('owner_address, referred_address, created_at')
    .order('created_at', { ascending: true })
    .limit(MAX_REFERRAL_ROWS);
  if (period !== 'all') {
    query = query.gte('created_at', new Date(Date.now() - PERIOD_DAYS[period] * 86_400_000).toISOString());
  }

  const [{ data, error }, holdings] = await Promise.all([query, getLeaderboard('holdings', 'all')]);
  if (error) throw error;

  const ranked = rankOgHolders(data ?? [], holdings?.result?.byWalletBalance ?? []);

  const profiles: AccountSummary[] = await getAccountSummaries(
    ranked.slice(0, MAX_PROFILE_LOOKUPS).map((row) => row.account),
  ).catch(() => []);
  const profileByAddress = new Map(profiles.map((profile) => [profile.address.toLowerCase(), profile] as const));

  return ranked
    .map((row) => {
      const profile = profileByAddress.get(row.account);
      return {
        account: row.account,
        total: row.count,
        username: profile?.username ?? undefined,
        userDisplayName: profile?.displayName ?? undefined,
        avatarUrl: profile?.avatarImageUrl ?? undefined,
        sentTips: 0,
        receivedTips: 0,
        directReferrals: row.count,
        secondaryReferrals: 0,
        ogDhb: row.dhb,
        isBanned: profile?.isBanned === true,
      };
    })
    .filter((entry) => !entry.isBanned)
    .map(({ isBanned: _isBanned, ...entry }) => entry);
}
