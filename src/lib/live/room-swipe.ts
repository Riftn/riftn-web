import type { LiveStream } from '@/lib/api/dehub/livestream';
import { hlsUrlFor } from '@/lib/live-ingest';
import { isStreamLive } from '@/lib/live-status';

type AccessFlags = {
  isPayPerView?: boolean;
  isPPV?: boolean;
  isLockContent?: boolean;
  isLocked?: boolean;
  plans?: unknown[];
  plansDetails?: unknown[];
  subscriberPlans?: unknown[];
  contentRating?: string;
};

type LiveRow = LiveStream & AccessFlags & {
  _id?: string;
  account?: { address?: string };
  streamInfo?: AccessFlags | string | null;
  settings?: { contentRating?: string };
  isPrivate?: boolean;
  isUnlisted?: boolean;
  visibility?: string;
};

function hasGate(flags?: AccessFlags | null) {
  return flags?.isPayPerView || flags?.isPPV || flags?.isLockContent || flags?.isLocked ||
    flags?.plans?.length || flags?.plansDetails?.length || flags?.subscriberPlans?.length;
}

/** IDs only. Loading a room still goes through the normal viewer and its access checks. */
export function liveSwipeRoomIds(rows: LiveStream[], blocked: ReadonlySet<string>) {
  const ids = new Set<string>();
  for (const row of rows as LiveRow[]) {
    if (!row) continue;
    const id = row._id ?? row.streamId;
    if (!id || !/^[a-f0-9]{24}$/i.test(id) || !isStreamLive(row)) continue;
    if ([row.address, row.account?.address].some(address => address && blocked.has(address.toLowerCase()))) continue;
    if (row.isPrivate || row.isUnlisted || (row.visibility && row.visibility !== 'public')) continue;
    let info = row.streamInfo;
    if (typeof info === 'string') {
      try { info = JSON.parse(info) as AccessFlags | null; } catch { continue; }
    }
    if (info != null && (typeof info !== 'object' || Array.isArray(info))) continue;
    const rating = row.contentRating || info?.contentRating || row.settings?.contentRating;
    if (hasGate(row) || hasGate(info) || (rating && rating !== 'safe')) continue;
    if (row.playbackUrl || hlsUrlFor(row)) ids.add(id);
  }
  return [...ids];
}

export function liveSwipeDirection(dx: number, dy: number): 1 | -1 | null {
  const distance = Math.abs(dy);
  return distance > 40 && distance > Math.abs(dx) ? (dy < 0 ? 1 : -1) : null;
}
