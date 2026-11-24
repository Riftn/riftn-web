/**
 * When you last read each group, channel and community chat, kept on this
 * device per account. The Messages list counts the lines that came after it
 * (unread number) and shows the newest one (preview), like a private chat.
 * Shared with the app (libs/room-chat-read.ts there).
 *
 * A chat seen for the first time starts as read up to its newest line, so
 * turning this on never lights every group up with old history.
 */
import { stripBold } from '@/lib/bold-markup';
export interface RoomReadStorage {
  read: (key: string) => string | null | undefined;
  write: (key: string, value: string) => void;
}

const keyFor = (account: string) => `riftn.roomReadAt:${account.toLowerCase()}`;

export function createRoomReadStore(storage: RoomReadStorage) {
  const cache = new Map<string, Record<string, number>>();
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => { version += 1; listeners.forEach((l) => l()); };

  function all(account: string): Record<string, number> {
    const key = account.toLowerCase();
    const hit = cache.get(key);
    if (hit) return hit;
    let map: Record<string, number> = {};
    try {
      const saved = JSON.parse(storage.read(keyFor(key)) || 'null');
      if (saved && typeof saved === 'object') map = saved;
    } catch { /* unreadable: start fresh */ }
    cache.set(key, map);
    return map;
  }

  function save(account: string, map: Record<string, number>) {
    try { storage.write(keyFor(account), JSON.stringify(map)); } catch { /* keep in memory */ }
    emit();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    version: () => version,
    /** Read-up-to time for one chat, or null when this device never saw it. */
    get(account: string, roomId: string): number | null {
      if (!account || !roomId) return null;
      const at = all(account)[roomId];
      return Number.isFinite(at) ? at : null;
    },
    /** Opened or reading it now. Never moves backwards. */
    markRead(account: string, roomId: string, at = Date.now()) {
      if (!account || !roomId) return;
      const map = all(account);
      if ((map[roomId] ?? 0) >= at) return;
      map[roomId] = at;
      save(account, map);
    },
    /** First sight of a chat: read up to its newest line, quietly. */
    seed(account: string, roomId: string, at: number) {
      if (!account || !roomId || !Number.isFinite(at)) return;
      const map = all(account);
      if (map[roomId] != null) return;
      map[roomId] = at;
      try { storage.write(keyFor(account), JSON.stringify(map)); } catch { /* keep in memory */ }
    },
    refresh() { cache.clear(); emit(); },
  };
}

export interface RoomLastLine {
  content?: string | null;
  message_type?: string | null;
  image_url?: string | null;
  wallet_address?: string | null;
  username?: string | null;
  display_name?: string | null;
  created_at: string;
}

/** "Ana: hi", "You: 📷 Photo", for the row under a group's name. */
export function roomPreviewLine(
  line: RoomLastLine,
  me: string,
  t: (key: string, options: { defaultValue: string }) => string,
): string {
  const type = (line.message_type || 'text').toLowerCase();
  const body = stripBold(line.content || '').replace(/\s+/g, ' ').trim()
    || (type === 'gif' ? t('copy.fd0ce9669a4e', { defaultValue: '🎞️ GIF' })
      : type === 'audio' || type === 'voice' ? t('roomPreview.voice', { defaultValue: '🎤 Voice message' })
        : line.image_url || type === 'image' ? t('copy.1b13ff986443', { defaultValue: '📷 Photo' })
          : '');
  if (!body) return '';
  const mine = !!me && (line.wallet_address || '').toLowerCase() === me.toLowerCase();
  const who = mine
    ? t('roomPreview.you', { defaultValue: 'You' })
    : (line.display_name || (line.username ? `@${line.username}` : ''));
  return who ? `${who}: ${body}` : body;
}
