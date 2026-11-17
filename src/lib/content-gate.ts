import { DHB_PRELISTING_USD } from './subscription-pricing';

/**
 * Hold-gate resolution.
 * =====================
 * `streamInfo.isLockContent` on its own means nothing. The gate it describes is
 * "you must be holding N of token X to read this", so without a positive N there
 * is no condition to satisfy and no condition to fail — the post is simply open.
 *
 * Posts in exactly that state exist in prod because the composer's old
 * "Subscribers" switch set isLockContent with no amount — it was a hold gate
 * pretending to be a subscriber gate, and it carried no amount because there was
 * no amount to carry. Those posts rendered a lock badge over a drawer with no
 * button in it, and an amount line reading "Must be holding NaN DHB", while the
 * API served the body in full anyway. The real subscriber gate is below.
 *
 * Every surface that gates on holdings resolves it through here so the answer is
 * the same everywhere.
 */
export function isHoldGated(
  isLocked: boolean | undefined,
  lockedAmount: number | string | null | undefined,
): boolean {
  return !!isLocked && Number(lockedAmount) > 0;
}

/** One chain a plan is sold on. The price and the on-chain state live here. */
export interface SubscriberPlanChain {
  chainId?: number;
  token?: string;
  price?: number;
  /** "USDT" on plans priced in dollars; absent or "DHB" on token-priced ones. */
  currency?: string;
  isPublished?: boolean;
  status?: boolean;
}

/**
 * One of the creator's subscription plans, as the feed returns it.
 *
 * This shape was previously declared as `{ id, title, price }`, and the server
 * sends none of those three: the label is `name`, the id is a string, and there
 * is no top-level `price` at all — it sits on each chain entry. Reading
 * `plan.price` therefore produced NaN everywhere, which the feed cards' own
 * `formatCompact` turns into the string "0". That is where "Subscribe from
 * 0 DHB" came from. Resolve both through the helpers below, never by hand.
 */
export interface SubscriberPlan {
  id?: string | number;
  _id?: string;
  name?: string;
  /** Never sent by the API; kept so older callers still type-check. */
  title?: string;
  price?: number;
  duration?: number;
  chains?: SubscriberPlanChain[];
  isPublished?: boolean;
  alreadySubscribed?: boolean;
}

/**
 * The chain a purchase should target — one the creator has actually published
 * on, because buying an unpublished one reverts in the buyer's wallet.
 */
export function primarySubscriberPlanChain(
  plan: SubscriberPlan,
): SubscriberPlanChain | undefined {
  const chains = plan.chains || [];
  return chains.find((c) => c.isPublished) || chains[0];
}

/** Can anyone actually buy this plan right now? */
export function isSubscriberPlanBuyable(plan: SubscriberPlan): boolean {
  if (typeof plan.isPublished === 'boolean') return plan.isPublished;
  return (plan.chains || []).some((c) => c.isPublished);
}

/** Headline price, from whichever source the server gave us. */
export function subscriberPlanPrice(
  plan: SubscriberPlan | undefined,
): number | undefined {
  if (!plan) return undefined;
  if (typeof plan.price === 'number') return plan.price;
  const price = primarySubscriberPlanChain(plan)?.price;
  return typeof price === 'number' ? price : undefined;
}

/**
 * A plan price for the gate buttons ("Subscribe from N"). Whole amounts read
 * compact, as the rest of the feed does. A price under one token reads "<1":
 * rounding it gave "0", which told readers a paid plan was free.
 */
export function formatSubscriberPrice(price: number | undefined): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1) return '<1';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n * 100) / 100);
}

/**
 * What a plan costs, in both units the gate shows: tokens on the first line and
 * dollars under it.
 *
 * Plans made since the USD switch are priced in USDT ("$0.01") and paid in DHB
 * at the fixed pre-listing rate, so the token figure is the dollar price over
 * that rate (0.01 / 0.001 = 10). Older plans are priced in DHB directly. The
 * gate used to print the raw dollar figure through a whole-number formatter
 * next to the DHB coin, which turned "$0.01" into "Subscribe from 0".
 */
export interface SubscriberPlanQuote {
  tokens: number;
  usd: number;
}

const USD_CURRENCIES = new Set(['USD', 'USDT', 'USDC']);

export function subscriberPlanQuote(
  plan: SubscriberPlan | undefined,
): SubscriberPlanQuote | undefined {
  const price = subscriberPlanPrice(plan);
  if (price === undefined || !Number.isFinite(price) || price <= 0) return undefined;
  const currency = (primarySubscriberPlanChain(plan as SubscriberPlan)?.currency || 'DHB').toUpperCase();
  if (USD_CURRENCIES.has(currency)) {
    return { tokens: price / DHB_PRELISTING_USD, usd: price };
  }
  return { tokens: price, usd: price * DHB_PRELISTING_USD };
}

/** Dollar line under the token price. Anything under a cent reads "<$0.01". */
export function formatSubscriberUsd(usd: number | undefined): string {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 0.01) return '<$0.01';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * The cheapest plan a reader could actually buy to get in. Unbuyable plans are
 * skipped because naming their price is an invitation to a disabled button.
 * Compared in dollars, so a USDT plan and a DHB plan rank correctly.
 */
export function cheapestSubscriberPlan(
  plans: SubscriberPlan[] | undefined | null,
): SubscriberPlan | undefined {
  const priced = (plans || [])
    .filter(isSubscriberPlanBuyable)
    .filter((p) => subscriberPlanQuote(p) !== undefined);
  if (!priced.length) return undefined;
  return priced.reduce((a, b) =>
    (subscriberPlanQuote(b) as SubscriberPlanQuote).usd < (subscriberPlanQuote(a) as SubscriberPlanQuote).usd ? b : a,
  );
}

/** The quote for the cheapest buyable plan, or undefined when none has a price. */
export function cheapestSubscriberQuote(
  plans: SubscriberPlan[] | undefined | null,
): SubscriberPlanQuote | undefined {
  return subscriberPlanQuote(cheapestSubscriberPlan(plans));
}

/**
 * Subscriber gate resolution.
 * ==========================
 * Distinct from the hold gate above, and not interchangeable with it: a hold
 * gate asks "do you own N of this token", which any stranger can satisfy by
 * buying some. A subscriber gate asks "do you subscribe to THIS creator", which
 * only they can grant.
 *
 * The backend has carried this all along — a post stores the plan ids that
 * unlock it in `plans`, and the feed pipeline joins the viewer's subscriptions
 * to stamp `alreadySubscribed` on each one. Both clients ignored it and faked
 * a "Subscribers" switch with an amount-less DHB lock instead, which is the bug
 * this pairs with. Empty plans is not a gate, for the same reason a hold gate
 * with no amount is not one.
 *
 * Neither is a set of plans nobody can buy. The composer attaches every plan
 * the creator owns the moment the Subscribers switch is on, and it counted
 * unpublished drafts as plans — so a post could be gated behind a plan whose
 * Subscribe button is permanently disabled. That is not a gate, it is a post
 * nobody will ever read, so it resolves to open here on the same principle.
 */
export function isSubscriberGated(
  plans: SubscriberPlan[] | undefined | null,
  canBypass: boolean,
): boolean {
  if (canBypass || !plans?.length) return false;
  if (plans.some((p) => p.alreadySubscribed)) return false;
  return plans.some(isSubscriberPlanBuyable);
}
