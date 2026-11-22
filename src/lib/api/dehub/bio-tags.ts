/**
 * Bio @tags: someone named in another account's bio is told once, and can take
 * themselves out with "Remove me". Their name stays as plain text.
 */
import { apiCall } from './core';

/** Same handle shape the bio links and the server reads. */
const TAG = /(^|[^\w@./])@([a-z0-9_]{2,30})(?![\w])/gi;

/** True when `bio` @tags `username` (any case). */
export function bioTagsUser(bio: string | null | undefined, username: string | null | undefined): boolean {
  const handle = String(username || '').replace(/^@/, '').toLowerCase();
  if (!bio || !handle) return false;
  for (const m of String(bio).matchAll(TAG)) if (m[2].toLowerCase() === handle) return true;
  return false;
}

/** Take the signed-in account's @tag out of `ownerAddress`'s bio. */
export async function removeBioTag(ownerAddress: string): Promise<{ aboutMe?: string; removed?: boolean }> {
  const response = await apiCall<any>('/api/bio_tag/remove', {
    method: 'POST',
    body: { address: ownerAddress.toLowerCase() },
    requiresAuth: true,
  });
  if (response?.result === false) throw new Error(response?.error || 'Could not remove the tag');
  return response ?? {};
}
