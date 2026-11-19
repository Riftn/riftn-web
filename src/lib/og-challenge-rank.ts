/**
 * Pure ranking for the OG holder challenge (lib/api/og-challenge-leaderboard):
 * who brought the most invited accounts that hold DHB.
 */

/** Dust is not a holder. */
const MIN_DHB = 1;

export interface OgReferral {
  owner_address: string | null;
  referred_address: string | null;
}

export interface OgHolding {
  account: string;
  total: number | null;
  hideBadgeAndBalance?: boolean;
}

/** Pure ranking step, kept apart so it can be tested without the network. */
export function rankOgHolders(referrals: OgReferral[], holdings: OgHolding[]) {
  const holders = new Map<string, number | null>();
  for (const row of holdings) {
    const account = row.account?.toLowerCase();
    if (!account) continue;
    const hidden = row.total === null || row.hideBadgeAndBalance === true;
    // A hidden balance is still on the holders board, so it still counts as
    // a holder; its amount just stays private.
    if (hidden) holders.set(account, null);
    else if ((row.total ?? 0) >= MIN_DHB) holders.set(account, row.total ?? 0);
  }

  const counted = new Set<string>();
  const byOwner = new Map<string, { count: number; dhb: number }>();
  for (const row of referrals) {
    const owner = row.owner_address?.toLowerCase();
    const referred = row.referred_address?.toLowerCase();
    if (!owner || !referred || owner === referred || !holders.has(referred)) continue;
    // One holder credits one inviter once, however many rows repeat them.
    if (counted.has(referred)) continue;
    counted.add(referred);
    const current = byOwner.get(owner) ?? { count: 0, dhb: 0 };
    current.count += 1;
    current.dhb += holders.get(referred) ?? 0;
    byOwner.set(owner, current);
  }

  return [...byOwner.entries()]
    .map(([account, { count, dhb }]) => ({ account, count, dhb }))
    .sort((a, b) => b.count - a.count || b.dhb - a.dhb);
}
