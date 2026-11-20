/**
 * The light half of lib/chat-message-link: reading a copied message link out
 * of a URL and holding it until its chat opens. No imports, because the
 * catcher that uses it sits on every page (see the boot path report).
 */
export const MESSAGE_LINK_PARAM = 'msg';

export type ChatLinkTarget =
  | { kind: 'public'; roomId?: string | null }
  | { kind: 'stream'; tokenId: string | number }
  | { kind: 'community'; slug: string }
  | { kind: 'dm'; conversationId: string };

export const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** The chat a link points at, as the key each chat asks for its own by. */
export function chatLinkKey(target: ChatLinkTarget): string {
  switch (target.kind) {
    case 'public': return 'public';
    case 'stream': return `stream:${target.tokenId}`;
    case 'community': return `community:${target.slug.toLowerCase()}`;
    case 'dm': return `dm:${target.conversationId}`;
  }
}

/** Reads a link's chat and message out of a path and query; null for any other URL. */
export function parseChatMessageLink(pathname: string, search: string): { key: string; target: ChatLinkTarget; messageId: string } | null {
  const params = new URLSearchParams(search);
  const messageId = params.get(MESSAGE_LINK_PARAM);
  if (!messageId || !ID_RE.test(messageId)) return null;
  const path = pathname.replace(/\/+$/, '');
  let target: ChatLinkTarget | null = null;
  if (/^\/(?:app\/messages|chat)$/.test(path)) {
    const conversation = params.get('conversation');
    if (conversation && ID_RE.test(conversation)) target = { kind: 'dm', conversationId: conversation };
    else if (params.get('chat') === 'public') {
      const room = params.get('room');
      target = { kind: 'public', roomId: room && ID_RE.test(room) ? room : null };
    }
  } else {
    const post = path.match(/^\/(?:app\/)?post\/([A-Za-z0-9_-]{1,120})$/);
    const community = path.match(/^\/(?:app\/)?communities\/([^/]+)$/);
    if (post) target = { kind: 'stream', tokenId: post[1] };
    else if (community && community[1] !== 'join') target = { kind: 'community', slug: decodeURIComponent(community[1]) };
  }
  return target ? { key: chatLinkKey(target), target, messageId } : null;
}

// ---------------------------------------------------------------------------
// The link waiting to be opened.

type Pending = { key: string; target: ChatLinkTarget; messageId: string; at: number; nonce: number };
let pending: Pending | null = null;
let nonce = 0;
export const chatLinkListeners = new Set<() => void>();
/** A link not taken in this long was for a chat that never opened. */
const PENDING_TTL_MS = 60_000;

export function setPendingChatLink(target: ChatLinkTarget, messageId: string) {
  nonce += 1;
  pending = { key: chatLinkKey(target), target, messageId, at: Date.now(), nonce };
  chatLinkListeners.forEach((fn) => fn());
}

export function peekPendingChatLink(key?: string): Pending | null {
  if (!pending || Date.now() - pending.at > PENDING_TTL_MS) return null;
  if (key && pending.key !== key) return null;
  return pending;
}

export function clearPendingChatLink(n?: number) {
  if (!pending || (n != null && pending.nonce !== n)) return;
  pending = null;
}
