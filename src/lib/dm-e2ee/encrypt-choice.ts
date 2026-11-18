/**
 * Which DMs are encrypted. Off unless someone turns it on.
 *
 * Encrypting every DM by default meant anyone reading a reply on a device
 * without their key had to unlock their wallet first, which for most people
 * is a password they set once and forgot. Now a chat is encrypted only when
 * "Encrypt chat" is on in its menu. The setting is the sender's own, saved
 * with their other chat settings so it follows them between devices.
 *
 * Settings are stored by conversation id, but sending only knows the peer,
 * so a resolver maps one to the other (registered by the app, which holds
 * the conversations cache).
 */
import { getChatPrefs, type ChatPref } from '@/lib/api/dehub/chat-prefs';

let encrypted: Set<string> | null = null;
let loading: Promise<Set<string>> | null = null;
let resolvePeer: ((conversationId: string) => string | null) | null = null;

const norm = (a: string) => a.toLowerCase();

/** Fed from the chat settings query whenever it changes. */
export function setEncryptedChats(prefs: ChatPref[] | undefined | null): void {
  encrypted = new Set((prefs ?? []).filter((p) => !!p.encryptedAt).map((p) => p.conversationId));
}

export function registerConversationPeerResolver(fn: (conversationId: string) => string | null): void {
  resolvePeer = fn;
}

/** Sign-out: forget the last person's choices. */
export function clearEncryptedChats(): void {
  encrypted = null;
  loading = null;
}

export function isChatEncrypted(conversationId: string | null | undefined): boolean {
  return !!conversationId && !!encrypted?.has(conversationId);
}

async function load(): Promise<Set<string>> {
  if (encrypted) return encrypted;
  loading ??= getChatPrefs()
    .then((prefs) => { setEncryptedChats(prefs); return encrypted!; })
    .catch(() => { loading = null; return new Set<string>(); });
  return loading;
}

/** True when the chat with this person has "Encrypt chat" on. */
export async function wantsEncryptionTo(peerAddress: string | null | undefined): Promise<boolean> {
  if (!peerAddress) return false;
  const ids = await load();
  if (!ids.size) return false;
  const peer = norm(peerAddress);
  for (const id of ids) {
    if (norm(id) === peer || norm(id) === `new_${peer}`) return true;
    const p = resolvePeer?.(id);
    if (p && norm(p) === peer) return true;
  }
  return false;
}
