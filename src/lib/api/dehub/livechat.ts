import { apiCall, authedUpload } from './core';
import { voiceRecordingFilename } from '@/lib/voice-recording';

export interface LiveChatRoom {
  id: string;
  roomId?: string;
  name?: string;
  topic?: string;
  description?: string;
  roomType?: string;
  participantCount?: number;
  activeUsers?: number;
  messageCount?: number;
  createdAt?: string;
  settings?: Record<string, unknown>;
  moderators?: string[];
  /** Super moderators: the only ones who can ban, mute or kick another moderator. */
  superModerators?: string[];
  slowMode?: boolean;
  slowModeSeconds?: number;
  subscribersOnly?: boolean;
  minStakeRequired?: number;
  pinnedMessages?: string[];
}

export interface LiveChatMessage {
  id: string;
  roomId: string;
  content: string;
  type?: 'text' | 'image' | 'gif';
  messageType?: string;
  imageUrl?: string;
  sender: {
    address: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    avatarImageUrl?: string;
    isModerator?: boolean;
    isBanned?: boolean;
    followers?: number;
    followings?: number;
    badgeBalance?: number;
  };
  reactions?: Record<string, unknown>;
  isPinned?: boolean;
  audioUrl?: string;
  audioDuration?: number;
  createdAt: string;
}

export interface LiveChatUserProfile {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  isBanned?: boolean;
  isModerator?: boolean;
}

/**
 * The chat panel and the public-chat unread tracker both open on boot and
 * both ask for the room and its latest window within the same second. One
 * answer serves both: in-flight calls share a promise, and the result is kept
 * for a few seconds so a caller arriving just after reuses it.
 */
const SHARED_READ_MS = 5_000;
const sharedReads = new Map<string, { at: number; promise: Promise<unknown> }>();
function sharedRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = sharedReads.get(key);
  if (hit && Date.now() - hit.at < SHARED_READ_MS) return hit.promise as Promise<T>;
  const promise = load();
  sharedReads.set(key, { at: Date.now(), promise });
  promise.catch(() => sharedReads.delete(key));
  return promise;
}

/**
 * GET /api/livechat/room — single global chat room info
 */
export function getLiveChatRooms(): Promise<LiveChatRoom[]> {
  return sharedRead('rooms', loadLiveChatRooms).then((rooms) => rooms.map((room) => ({ ...room })));
}

async function loadLiveChatRooms(): Promise<LiveChatRoom[]> {
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/room', {
      requiresAuth: false,
    });

    // Normalize into a room object
    const raw = (response && typeof response === 'object' && 'result' in response)
      ? response.result as Record<string, unknown>
      : response;

    if (raw && typeof raw === 'object') {
      const room: LiveChatRoom = {
        id: (raw as any).id || (raw as any).roomId || (raw as any)._id || 'general',
        name: (raw as any).name || 'General',
        topic: (raw as any).topic || (raw as any).description || 'Riftn Community Chat',
        ...raw as any,
      };
      return [room];
    }
  } catch (error: any) {
    console.warn('[LiveChat API] /api/livechat/room failed:', error?.message);
  }

  // Fallback default room
  return [{ id: 'general', name: 'General', topic: 'Riftn Community Chat' }];
}

/**
 * GET /api/livechat/room — single global room
 */
export async function getLiveChatRoom(roomId: string): Promise<LiveChatRoom> {
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/room', {
      requiresAuth: false,
      params: { roomId },
    });
    const raw = (response && typeof response === 'object' && 'result' in response)
      ? response.result
      : response;
    if (raw && typeof raw === 'object') {
      return {
        id: (raw as any).id || (raw as any).roomId || roomId,
        name: (raw as any).name || 'General',
        ...raw as any,
      };
    }
  } catch (error: any) {
    console.warn('[LiveChat API] getLiveChatRoom failed:', error?.message);
  }
  return { id: roomId, name: 'Chat Room' };
}

/**
 * GET /api/livechat/messages — cursor-based pagination
 * Params: limit (max 100, default 50), before (message ID), after (message ID)
 */
export function getLiveChatMessages(
  roomId: string,
  params?: { page?: number; limit?: number; before?: string; after?: string }
): Promise<LiveChatMessage[]> {
  // Only the latest window is shared; paging and catch-up reads always go out.
  if (params?.before || params?.after) return loadLiveChatMessages(roomId, params);
  return sharedRead(`messages:${roomId}:${Math.min(params?.limit ?? 100, 100)}`, () => loadLiveChatMessages(roomId, params))
    .then((messages) => messages.slice());
}

async function loadLiveChatMessages(
  roomId: string,
  params?: { page?: number; limit?: number; before?: string; after?: string }
): Promise<LiveChatMessage[]> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: Math.min(params?.limit ?? 100, 100),
    // The room was named `_roomId` and thrown away, because the backend threw
    // it away too — history came from the platform room whatever was asked
    // for. Both ends honour it now; anything unrecognised still resolves to
    // `global` server-side, so old callers are unaffected.
    roomId,
  };
  if (params?.before) queryParams.before = params.before;
  if (params?.after) queryParams.after = params.after;

  const parse = (response: unknown): LiveChatMessage[] => {
    const r = response as any;
    if (r && typeof r === 'object') {
      if (Array.isArray(r.messages)) return r.messages as LiveChatMessage[];
      if (r.result && typeof r.result === 'object') {
        if (Array.isArray(r.result.messages)) return r.result.messages as LiveChatMessage[];
      }
      if (Array.isArray(r.data)) return r.data as LiveChatMessage[];
    }
    if (Array.isArray(response)) return response as LiveChatMessage[];
    return [];
  };

  // Prefer the currently deployed endpoint (many deployments still use this)
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/messages', {
      params: queryParams,
      requiresAuth: false,
    });
    const parsed = parse(response);
    if (parsed.length) return parsed;
  } catch (error: any) {
    // continue to fallback below
  }

  // Fallback: spec endpoint from `doc.md` (may be enabled in newer backends)
  try {
    const response = await apiCall<Record<string, unknown>>(
      `/api/livechat/rooms/${roomId}/messages`,
      { params: queryParams, requiresAuth: false }
    );
    return parse(response);
  } catch (error: any) {
    console.warn('[LiveChat API] getLiveChatMessages failed:', error?.message);
    return [];
  }
}

export interface LiveChatMessagePage {
  messages: LiveChatMessage[];
  /** Older lines exist past this page (reading forward with `after`: newer ones). */
  hasMore: boolean;
  /** Reading around one line: newer lines exist past this window. */
  hasNewer: boolean;
  /** Signed out and past the history a guest may read: show the sign-in wall. */
  signInRequired: boolean;
}

/**
 * One page of a room's history, newest first from the server, with whether
 * older lines exist and whether a signed-out reader has hit the wall.
 * `around` reads the window either side of one line; `after` reads forward.
 * Signed in, the session is refreshed first, so a lapsed token is not read as
 * a guest and walled.
 */
export async function getLiveChatMessagePage(
  roomId: string,
  params: { limit: number; before?: string; after?: string; around?: string; signedIn?: boolean },
): Promise<LiveChatMessagePage> {
  const queryParams: Record<string, string | number | undefined> = {
    limit: Math.min(params.limit, 100),
    roomId,
  };
  if (params.before) queryParams.before = params.before;
  if (params.after) queryParams.after = params.after;
  if (params.around) queryParams.around = params.around;
  const r = await apiCall<Record<string, unknown>>('/api/livechat/messages', {
    params: queryParams,
    requiresAuth: !!params.signedIn,
  });
  const body = (r && typeof r === 'object' && 'result' in r && r.result && typeof r.result === 'object' ? r.result : r) as Record<string, unknown>;
  const messages = Array.isArray(body?.messages) ? (body.messages as LiveChatMessage[]) : [];
  return {
    messages,
    hasMore: !!body?.hasMore && messages.length > 0,
    hasNewer: !!body?.hasNewer && messages.length > 0,
    signInRequired: !!body?.signInRequired,
  };
}

/** Someone who has spoken in a room, as the chat search lists them. */
export interface LiveChatSearchPerson {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  messageCount: number;
}

export interface LiveChatSearchPage {
  messages: LiveChatMessage[];
  people: LiveChatSearchPerson[];
  hasMore: boolean;
  /** How many lines match in all. Only the first page carries it. */
  total: number | null;
  signInRequired: boolean;
}

/**
 * Search a room's whole history by words (`q`), by who said it (`from`), or
 * both. Newest first; `before` reads the next page.
 */
export async function searchLiveChat(
  roomId: string,
  params: { q?: string; from?: string; before?: string; limit?: number },
): Promise<LiveChatSearchPage> {
  const queryParams: Record<string, string | number | undefined> = { roomId, limit: params.limit ?? 30 };
  if (params.q) queryParams.q = params.q;
  if (params.from) queryParams.from = params.from;
  if (params.before) queryParams.before = params.before;
  const r = await apiCall<Record<string, unknown>>('/api/livechat/search', { params: queryParams, requiresAuth: true });
  const body = (r && typeof r === 'object' && 'result' in r && r.result && typeof r.result === 'object' ? r.result : r) as Record<string, unknown>;
  const messages = Array.isArray(body?.messages) ? (body.messages as LiveChatMessage[]) : [];
  return {
    messages,
    people: Array.isArray(body?.people) ? (body.people as LiveChatSearchPerson[]) : [],
    hasMore: !!body?.hasMore && messages.length > 0,
    total: typeof body?.total === 'number' ? body.total : null,
    signInRequired: !!body?.signInRequired,
  };
}

/**
 * GET /api/livechat/user/{address}
 */
export async function getLiveChatUserProfile(address: string): Promise<LiveChatUserProfile> {
  const response = await apiCall<Record<string, unknown>>(
    `/api/livechat/user/${address}`,
    { requiresAuth: true }
  );
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result as LiveChatUserProfile;
  }
  return response as unknown as LiveChatUserProfile;
}

/**
 * GET /api/livechat/online — online user count
 */
export async function getLiveChatOnlineCount(): Promise<number> {
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/online', {
      requiresAuth: false,
    });
    if (response && typeof response === 'object') {
      return (response as any).count ?? (response as any).online ?? (response as any).result ?? 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * GET /api/livechat/status — your chat status
 */
export async function getLiveChatStatus(): Promise<Record<string, unknown>> {
  try {
    const response = await apiCall<Record<string, unknown>>('/api/livechat/status', {
      requiresAuth: true,
    });
    return (response && typeof response === 'object' && 'result' in response)
      ? response.result as Record<string, unknown>
      : response;
  } catch {
    return {};
  }
}

/**
 * Send a livechat message — socket-only (no REST POST endpoint exists).
 * This is a convenience wrapper; prefer using emitSendMessage from socket.ts directly.
 */
export async function sendLiveChatMessage(
  roomId: string,
  content: string,
  type: 'text' | 'image' | 'gif' | 'voice' = 'text',
  imageUrl?: string
): Promise<LiveChatMessage> {
  const { emitSendMessage, getSocket } = await import('./socket');
  const socket = getSocket(roomId);
  if (!socket.connected) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket not connected')), 5000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      if (socket.connected) { clearTimeout(timeout); resolve(); }
    });
  }
  const apiType = type === 'image' || type === 'voice' ? 'media' as const : type;
  emitSendMessage({ roomId, content, messageType: apiType, imageUrl });
  // Return optimistic message since socket is fire-and-forget
  return {
    id: `temp-${Date.now()}`,
    roomId,
    content,
    messageType: type,
    sender: { address: '' },
    createdAt: new Date().toISOString(),
  };
}

// Mod endpoints — the signed-in user must be on the room's moderator list.
export async function pinLiveChatMessage(_roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/mod/pin/${messageId}`, {
    method: 'POST',
    requiresAuth: true,
  });
}

export async function unpinLiveChatMessage(_roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/mod/pin/${messageId}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function banLiveChatUser(_roomId: string, userAddress: string): Promise<void> {
  await apiCall('/api/livechat/mod/ban', {
    method: 'POST',
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export async function unbanLiveChatUser(_roomId: string, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/mod/ban/${userAddress.toLowerCase()}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function deleteLiveChatMessage(messageId: string): Promise<void> {
  await apiCall(`/api/livechat/mod/message/${messageId}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function addLiveChatModerator(_roomId: string, userAddress: string): Promise<void> {
  await apiCall('/api/livechat/moderators', {
    method: 'POST',
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export async function createTopicRoom(params: {
  topic: string;
  description?: string;
}): Promise<LiveChatRoom> {
  const response = await apiCall<Record<string, unknown>>('/api/livechat/rooms/topic', {
    method: 'POST',
    body: params as Record<string, unknown>,
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result as LiveChatRoom;
  }
  return response as unknown as LiveChatRoom;
}

export async function updateLiveChatRoomSettings(
  _roomId: string,
  settings: Record<string, unknown>
): Promise<LiveChatRoom> {
  const response = await apiCall<Record<string, unknown>>(
    '/api/livechat/settings',
    {
      method: 'PATCH',
      body: settings,
      requiresAuth: true,
    }
  );
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result as LiveChatRoom;
  }
  return response as unknown as LiveChatRoom;
}

/**
 * POST /api/livechat/upload-voice — upload a voice message to the CDN
 */
export async function uploadLiveChatVoice(audioBlob: Blob, filename = voiceRecordingFilename(audioBlob.type)): Promise<{ url: string; duration: number }> {
  const formData = new FormData();
  formData.append('audio', audioBlob, filename);

  return authedUpload<{ url: string; duration: number }>(
    '/api/livechat/upload-voice',
    formData,
  );
}


/**
 * The chat room belonging to a live post.
 *
 * Namespaced to match the backend's allow-list: it accepts `global` or
 * `stream:<tokenId>` and quietly resolves anything else to `global`. A bare
 * tokenId therefore lands everyone in the platform room, which is exactly the
 * bug this replaces — so the prefix is not decoration.
 */
export function streamChatRoomId(tokenId: string | number): string {
  return `stream:${tokenId}`;
}

// ─── A creator's moderation of their own stream chats ─────────────────────────

/** Time someone out of this creator's stream chats. The creator, their moderators and staff only. */
export async function timeOutInStream(tokenId: string | number, userAddress: string, seconds: number): Promise<void> {
  await apiCall(`/api/livechat/stream/${encodeURIComponent(String(tokenId))}/timeout`, {
    method: 'POST',
    body: { address: userAddress.toLowerCase(), seconds },
    requiresAuth: true,
  });
}

/** Ban someone from every stream chat of this creator. Never from the platform's chat. */
export async function banFromStreams(tokenId: string | number, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/stream/${encodeURIComponent(String(tokenId))}/ban`, {
    method: 'POST',
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

export interface StreamModerationSettings {
  slowModeSeconds: number;
  followersOnly: boolean;
  subscribersOnly: boolean;
  bannedWords: string[];
  wordAction: 'block' | 'timeout';
}

export interface StreamModerationPerson {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export interface StreamModerationLogEntry {
  actor: string;
  target: string;
  action: 'timeout' | 'ban' | 'unban' | 'moderator-added' | 'moderator-removed' | 'word-blocked' | 'word-timeout';
  seconds?: number;
  word?: string;
  at: string;
}

export interface DelegatedStreamBans {
  bans: { creator: StreamModerationPerson; banned: StreamModerationPerson[] }[];
}

export async function getDelegatedStreamBans(): Promise<DelegatedStreamBans> {
  return apiCall<DelegatedStreamBans>('/api/livechat/moderation/delegated/bans', { requiresAuth: true });
}

export async function unbanFromModeratedStreams(creator: string, address: string): Promise<void> {
  await apiCall('/api/livechat/moderation/delegated/' + encodeURIComponent(creator) + '/bans/' + encodeURIComponent(address), {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export interface MyStreamModeration {
  settings: StreamModerationSettings;
  moderators: StreamModerationPerson[];
  banned: StreamModerationPerson[];
  log: StreamModerationLogEntry[];
}

const unwrapModeration = (res: any): MyStreamModeration => {
  const body = res?.result ?? res;
  return {
    settings: {
      slowModeSeconds: Number(body?.settings?.slowModeSeconds) || 0,
      followersOnly: !!body?.settings?.followersOnly,
      subscribersOnly: !!body?.settings?.subscribersOnly,
      bannedWords: Array.isArray(body?.settings?.bannedWords) ? body.settings.bannedWords : [],
      wordAction: body?.settings?.wordAction === 'timeout' ? 'timeout' : 'block',
    },
    moderators: Array.isArray(body?.moderators) ? body.moderators : [],
    banned: Array.isArray(body?.banned) ? body.banned : [],
    log: Array.isArray(body?.log) ? body.log : [],
  };
};

export async function getMyStreamModeration(): Promise<MyStreamModeration> {
  return unwrapModeration(await apiCall('/api/livechat/moderation/mine', { requiresAuth: true }));
}

export async function saveMyStreamModeration(settings: StreamModerationSettings): Promise<MyStreamModeration> {
  return unwrapModeration(await apiCall('/api/livechat/moderation/mine', { method: 'PUT', body: { ...settings }, requiresAuth: true }));
}

export async function addStreamModerator(userAddress: string): Promise<MyStreamModeration> {
  return unwrapModeration(
    await apiCall('/api/livechat/moderation/mine/moderators', {
      method: 'POST',
      body: { address: userAddress.toLowerCase() },
      requiresAuth: true,
    }),
  );
}

export async function removeStreamModerator(userAddress: string): Promise<MyStreamModeration> {
  return unwrapModeration(
    await apiCall(`/api/livechat/moderation/mine/moderators/${userAddress.toLowerCase()}`, { method: 'DELETE', requiresAuth: true }),
  );
}

export async function unbanFromStreams(userAddress: string): Promise<MyStreamModeration> {
  return unwrapModeration(
    await apiCall(`/api/livechat/moderation/mine/bans/${userAddress.toLowerCase()}`, { method: 'DELETE', requiresAuth: true }),
  );
}

export interface ChatReactor {
  address: string;
  username?: string | null;
  displayName?: string | null;
  avatarImageUrl?: string | null;
  badgeBalance?: number;
  /** Every reaction this person left on the line. */
  emojis: string[];
}

export interface ChatReactorsResponse {
  result: boolean;
  /** False for everyone but the person who wrote the line; `data` is then empty by design. */
  canViewLikers: boolean;
  data: ChatReactor[];
  /** People per reaction, across the whole line. */
  reactionCounts?: Record<string, number>;
  /** Everyone who reacted, whatever the emoji filter. */
  peopleCount?: number;
  pagination: { page: number; limit: number; totalCount: number; hasMore: boolean };
}

/** Who reacted to one of your own chat lines, newest first. */
export async function getChatReactors(
  messageId: string,
  params: { emoji?: string; page?: number; limit?: number } = {},
): Promise<ChatReactorsResponse> {
  return apiCall<ChatReactorsResponse>(`/api/livechat/reactors/${encodeURIComponent(messageId)}`, {
    params: { emoji: params.emoji, page: params.page ?? 0, limit: params.limit ?? 50 },
  });
}

// ── Stream chat bot (a creator's co-host in their own stream chat) ─────────

export type StreamBotPersonality = 'chill' | 'hype' | 'funny' | 'formal';
export type StreamBotChattiness = 'quiet' | 'normal' | 'lots';

export interface StreamBotSettings {
  enabled: boolean;
  about: string;
  personality: StreamBotPersonality;
  chattiness: StreamBotChattiness;
  greet: boolean;
  answer: boolean;
  catchUp: boolean;
  wakeQuiet: boolean;
  commandButtons: boolean;
}

export interface StreamBotPublic {
  enabled: boolean;
  commandButtons: boolean;
  commands: Array<{ command: string; name: string }>;
}

export const STREAM_BOT_ABOUT_MAX = 600;

const unwrapBot = (res: any): StreamBotSettings => {
  const s = (res?.result ?? res)?.settings ?? {};
  const one = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  return {
    enabled: !!s.enabled,
    about: typeof s.about === 'string' ? s.about : '',
    personality: one(s.personality, ['chill', 'hype', 'funny', 'formal'] as const, 'chill'),
    chattiness: one(s.chattiness, ['quiet', 'normal', 'lots'] as const, 'normal'),
    greet: s.greet !== false,
    answer: s.answer !== false,
    catchUp: s.catchUp !== false,
    wakeQuiet: s.wakeQuiet !== false,
    commandButtons: s.commandButtons !== false,
  };
};

export async function getMyStreamBot(): Promise<StreamBotSettings> {
  return unwrapBot(await apiCall('/api/livechat/stream-bot/mine', { requiresAuth: true }));
}

export async function saveMyStreamBot(settings: StreamBotSettings): Promise<StreamBotSettings> {
  return unwrapBot(await apiCall('/api/livechat/stream-bot/mine', { method: 'PUT', body: { settings }, requiresAuth: true }));
}

/** Public: is this stream's bot on, and the creator's !commands for tap buttons above chat. */
export async function getStreamBot(tokenId: string | number): Promise<StreamBotPublic> {
  const res: any = await apiCall(`/api/livechat/stream-bot/stream/${encodeURIComponent(String(tokenId))}`);
  const body = res?.result ?? res;
  return {
    enabled: !!body?.enabled,
    commandButtons: !!body?.commandButtons,
    commands: Array.isArray(body?.commands)
      ? body.commands
          .filter((c: any) => typeof c?.command === 'string' && c.command.startsWith('!'))
          .map((c: any) => ({ command: c.command.slice(0, 32), name: String(c.name || '') }))
      : [],
  };
}
