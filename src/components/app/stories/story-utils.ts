import type { ShelfEntry, StoryItem } from '@/lib/api/dehub/stories';

/** "now", "12m", "5h": how long ago a moment went up. */
export function ageLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

/** The moment to start on: the first one not watched yet, else the first. */
export function startIndex(entry: ShelfEntry): number {
  const i = entry.items.findIndex(it => !it.viewed);
  return i < 0 ? 0 : i;
}

/** The picture a tile shows: the next unwatched moment's poster, else the newest. */
export function coverOf(entry: ShelfEntry): string | null {
  const next = entry.items.find(it => !it.viewed && it.status === 'ready') ?? entry.items[entry.items.length - 1];
  return next?.posterUrl || next?.mediaUrl || null;
}

export function playable(items: StoryItem[]): StoryItem[] {
  return items.filter(it => it.status === 'ready' && (it.mediaUrl || it.posterUrl));
}

export const handleOf = (a: { username: string | null; address: string }) => a.username || a.address.slice(0, 6);
export const nameOf = (a: { displayName: string | null; username: string | null; address: string }) => a.displayName || handleOf(a);
