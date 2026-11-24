import { apiCall } from './core';

export type CallModAction = 'mute' | 'unmute' | 'remove';

export interface GroupCallModeration {
  /** Wallets a moderator muted in this group's call. */
  muted: string[];
  /** Wallets a moderator removed, and until when they stay out. */
  removed: Array<{ wallet: string; until: string }>;
  /** You are one of this chat's moderators. */
  canModerate: boolean;
}

export const NO_CALL_MODERATION: GroupCallModeration = { muted: [], removed: [], canModerate: false };

/** Who is muted or kept out of a group's call, and whether you can moderate it. */
export async function readCallModeration(groupId: string): Promise<GroupCallModeration> {
  const data = await apiCall<Partial<GroupCallModeration> | null>(`/api/group-call/moderation?groupId=${encodeURIComponent(groupId)}`, { requiresAuth: true });
  return {
    muted: Array.isArray(data?.muted) ? data.muted : [],
    removed: Array.isArray(data?.removed) ? data.removed : [],
    canModerate: data?.canModerate === true,
  };
}

/** Mute, unmute or remove someone in a group's call (the chat's moderators only). */
export function moderateCall(groupId: string, target: string, action: CallModAction) {
  return apiCall<{ success: boolean }>('/api/group-call/moderate', { method: 'POST', body: { groupId, target, action }, requiresAuth: true });
}

/** Minutes left on a removal, rounded up; 0 once it has run out. */
export function removedMinutesLeft(moderation: GroupCallModeration, wallet: string, now = Date.now()): number {
  const row = moderation.removed.find(entry => entry.wallet === wallet.toLowerCase());
  const left = row ? new Date(row.until).getTime() - now : 0;
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}
