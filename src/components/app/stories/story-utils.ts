import type { ShelfEntry, StoryItem } from '@/lib/api/dehub/stories';
import { formatRelativeTime } from '@/i18n/date-locale';

/** "now", "12m", "5h": how long ago a moment went up. */
export function ageLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

/**
 * The same age in the reader's language ("şimdi", "9 sa. önce"). English keeps
 * its short "now", "12m", "5h".
 */
export function localAge(iso: string | null | undefined, language: string | undefined): string {
  if (!iso) return '';
  if (language && !language.startsWith('en')) return formatRelativeTime(iso, language, 'narrow');
  return ageLabel(iso);
}

/** The moment to start on: the first one not watched yet, else the first. */
export function startIndex(entry: ShelfEntry): number {
  const i = entry.items.findIndex(it => !it.viewed);
  return i < 0 ? 0 : i;
}

/** Use the opening item's still image, including when the viewer replays a watched day. */
export function coverOf(entry: ShelfEntry): string | null {
  const item = entry.items[startIndex(entry)];
  return item?.posterUrl || (item?.type === 'photo' ? item.mediaUrl : null);
}

export function playable(items: StoryItem[]): StoryItem[] {
  return items.filter(it => it.status === 'ready' && (it.mediaUrl || it.posterUrl));
}

export const handleOf = (a: { username: string | null; address: string }) => a.username || a.address.slice(0, 6);
export const nameOf = (a: { displayName: string | null; username: string | null; address: string }) => a.displayName || handleOf(a);
