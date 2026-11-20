import { apiCall } from './core';

/**
 * Channel points on the stream API: a creator's rewards, a viewer's balance
 * with that creator, redeeming, and the creator's queue. Points come from
 * watching (a point a minute) and paid gifts; they have no money value and
 * cannot be bought, moved or cashed out.
 */

function unwrap<T>(res: T | { result: T }): T {
  return res && typeof res === 'object' && 'result' in (res as object) ? (res as { result: T }).result : (res as T);
}

export const MAX_REWARDS = 12;
export const REWARD_TITLE_MAX = 60;
export const REWARD_TEXT_MAX = 200;
export const REWARD_COST_MAX = 1_000_000;

export interface LiveReward {
  id: string;
  title: string;
  cost: number;
  needsText: boolean;
  enabled: boolean;
}

export interface PointsBalance {
  creator: string;
  live: boolean;
  earned: number;
  spent: number;
  balance: number;
}

export interface Redemption {
  id: string;
  rewardId: string;
  title: string;
  cost: number;
  text: string;
  status: 'pending' | 'done' | 'refunded';
  createdAt: string;
  viewer: { address: string; username?: string; displayName?: string; avatarImageUrl?: string };
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function parseReward(raw: any): LiveReward | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  return { id: raw.id, title: raw.title, cost: Math.max(0, Math.round(num(raw.cost))), needsText: !!raw.needsText, enabled: raw.enabled !== false };
}

const rewardList = (raw: any): LiveReward[] =>
  (Array.isArray(raw?.rewards) ? raw.rewards : []).map(parseReward).filter(Boolean) as LiveReward[];

export function parseRedemption(raw: any): Redemption | null {
  if (!raw || typeof raw.id !== 'string') return null;
  const status = raw.status === 'done' || raw.status === 'refunded' ? raw.status : 'pending';
  return {
    id: raw.id,
    rewardId: String(raw.rewardId || ''),
    title: String(raw.title || ''),
    cost: num(raw.cost),
    text: String(raw.text || ''),
    status,
    createdAt: String(raw.createdAt || new Date().toISOString()),
    viewer: {
      address: String(raw.viewer?.address || ''),
      username: raw.viewer?.username || undefined,
      displayName: raw.viewer?.displayName || undefined,
      avatarImageUrl: raw.viewer?.avatarImageUrl || undefined,
    },
  };
}

const streamPath = (streamId: string) => `/api/live-overlay/stream/${encodeURIComponent(streamId)}`;

/** What this stream's creator offers, and whether it is on air (rewards open only then). */
export async function getStreamRewards(streamId: string): Promise<{ creator: string; live: boolean; rewards: LiveReward[] }> {
  const res: any = unwrap(await apiCall(`${streamPath(streamId)}/rewards`));
  return { creator: String(res?.creator || ''), live: !!res?.live, rewards: rewardList(res) };
}

export async function getMyStreamPoints(streamId: string): Promise<PointsBalance> {
  const res: any = unwrap(await apiCall(`${streamPath(streamId)}/points/me`, { requiresAuth: true }));
  return { creator: String(res?.creator || ''), live: !!res?.live, earned: num(res?.earned), spent: num(res?.spent), balance: num(res?.balance) };
}

export async function redeemReward(streamId: string, rewardId: string, text?: string): Promise<{ redemption: Redemption | null; balance: number }> {
  const res: any = unwrap(
    await apiCall(`${streamPath(streamId)}/rewards/redeem`, {
      method: 'POST',
      body: { rewardId, ...(text ? { text } : {}) },
      requiresAuth: true,
    }),
  );
  return { redemption: parseRedemption(res?.redemption), balance: num(res?.balance) };
}

export async function getMyRewards(): Promise<LiveReward[]> {
  return rewardList(unwrap(await apiCall('/api/live-overlay/mine/rewards', { requiresAuth: true })));
}

export async function saveMyRewards(rewards: LiveReward[]): Promise<LiveReward[]> {
  return rewardList(
    unwrap(await apiCall('/api/live-overlay/mine/rewards', { method: 'PUT', body: { rewards }, requiresAuth: true })),
  );
}

export async function getMyRedemptions(): Promise<Redemption[]> {
  const res: any = unwrap(await apiCall('/api/live-overlay/mine/redemptions', { requiresAuth: true }));
  return (Array.isArray(res?.redemptions) ? res.redemptions : []).map(parseRedemption).filter(Boolean) as Redemption[];
}

export async function settleRedemption(id: string, action: 'done' | 'refund'): Promise<Redemption | null> {
  const res: any = unwrap(
    await apiCall(`/api/live-overlay/mine/redemptions/${encodeURIComponent(id)}/${action}`, { method: 'POST', requiresAuth: true }),
  );
  return parseRedemption(res?.redemption);
}

/** The server's reason for a refused redeem, as a copy key. */
export function redeemErrorKey(err: unknown): string {
  const message = String((err as Error)?.message || '');
  if (/not enough points/i.test(message)) return 'livePoints.notEnough';
  if (/while the stream is live/i.test(message)) return 'livePoints.notLive';
  if (/few seconds/i.test(message)) return 'livePoints.tooFast';
  if (/no longer available/i.test(message)) return 'livePoints.gone';
  if (/add a message/i.test(message)) return 'livePoints.needsText';
  return 'livePoints.redeemFailed';
}

/** 1,240 → "1.2K" for the small button; the sheet shows the full number. */
export function compactPoints(n: number, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(n);
  }
}
