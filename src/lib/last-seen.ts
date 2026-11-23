/**
 * Last seen — "Last seen 5 min ago" under a name in chat
 * ======================================================
 * Off by default, like "Show when I'm online". Only someone who turned on
 * Settings > Privacy > "Show when I was last seen" has their time handed out
 * (`customs.showLastSeen`, the same key on the mobile app); the API checks
 * the switch and blocks again before it answers, and rounds to the minute.
 *
 * While the switch is on, the open app tells the API "I'm here" every few
 * minutes and when the tab goes to the background (OnlinePresenceHost).
 *
 * @module lib/last-seen
 */
import { useQuery } from '@tanstack/react-query';
import { apiCall } from '@/lib/api/dehub/core';

export const SHOW_LAST_SEEN_CUSTOMS_KEY = 'showLastSeen';

/** How often an open, opted-in app says "I'm here". */
export const SEEN_PING_MS = 4 * 60 * 1000;

export function getShowLastSeen(customs: Record<string, unknown> | null | undefined): boolean {
  const v = customs?.[SHOW_LAST_SEEN_CUSTOMS_KEY];
  return v === 'on' || v === true;
}

/** Read-merge-resend: the API does not merge customs, see lib/ai-scraping. */
export function mergeShowLastSeen(
  customs: Record<string, string> | undefined | null,
  on: boolean,
): Record<string, string> {
  return { ...(customs ?? {}), [SHOW_LAST_SEEN_CUSTOMS_KEY]: on ? 'on' : 'off' };
}

export async function pingSeen(): Promise<void> {
  await apiCall('/api/users/seen', { method: 'POST', requiresAuth: true, timeoutMs: 8000 }).catch(() => undefined);
}

export async function fetchLastSeen(address: string): Promise<string | null> {
  const res = await apiCall<{ result?: { lastSeenAt?: string | null } }>(
    `/api/users/last_seen/${encodeURIComponent(address.toLowerCase())}`,
  );
  return res?.result?.lastSeenAt ?? null;
}

/** When an opted-in person was last on Riftn; null when they keep it private. */
export function useLastSeen(address: string | null | undefined, enabled: boolean): string | null {
  const { data } = useQuery({
    queryKey: ['last-seen', address?.toLowerCase()],
    queryFn: () => fetchLastSeen(address as string),
    enabled: enabled && !!address,
    staleTime: 60_000,
    refetchInterval: enabled ? 120_000 : false,
  });
  return data ?? null;
}

/**
 * "just now" under a minute, then "5 min ago" / "3 hr ago" up to a day, then
 * a short date. Returns null for "just now" so callers pick their own words.
 */
export function lastSeenWhen(at: string | number | Date, language: string | undefined, now = Date.now()): string | null {
  const ms = new Date(at).getTime();
  if (!Number.isFinite(ms)) return null;
  const diff = Math.max(0, now - ms);
  if (diff < 60_000) return null;
  const lang = language || undefined;
  try {
    if (diff < 24 * 3600_000) {
      const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'always', style: 'short' });
      return diff < 3600_000
        ? rtf.format(-Math.floor(diff / 60_000), 'minute')
        : rtf.format(-Math.floor(diff / 3600_000), 'hour');
    }
    const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
    return new Intl.DateTimeFormat(lang, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}
