import { useTranslation as _useCopy } from 'react-i18next';
import { useDraftState } from "@/hooks/use-draft-state";
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, useContext, Fragment } from 'react';
import { UnreadMarker, UnreadJumpButton } from './UnreadJump';
import type { UnreadAnchor } from '@/lib/chat-unread-anchor';
import { anchorFromReadSpot, newestLineOnScreen } from '@/lib/chat-read-position';
import { useChatReadPosition } from '@/hooks/use-chat-read-position';
import { glideToBottom } from '@/lib/chat-lines-below';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { MoreVertical, Loader2, ShieldBan, MessageSquarePlus, AlertCircle, RotateCcw, ChevronsDown } from "lucide-react";
import ShieldCheck from "@/components/ui/cut-icons/security";
import RefreshCw from "@/components/ui/cut-icons/refresh";
import Languages from "@/components/ui/cut-icons/language";

import ArrowLeft from "@/components/ui/cut-icons/back";
import Settings from "@/components/ui/cut-icons/settings";
import MessageCircle from "@/components/ui/cut-icons/messages";
import Search from "@/components/ui/cut-icons/search";

import { LiveChatOnlineCount } from './LiveChatOnlineCount';
import { ChatTextSizeButton } from './ChatTextSizeButton';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ChatMessage, Message } from './ChatMessage';
import { TranslatableText, SharedTranslationContext } from '../TranslatableText';
import { ChatInput, type ChatInputSendArgs } from './ChatInput';
import { CreateTopicRoomModal } from './CreateTopicRoomModal';
import { usePublicChatDelete } from './PublicChatDeleteDialog';
import { useHiddenLines } from '@/lib/public-chat-hidden';
import { RoomSettingsModal } from './RoomSettingsModal';
import { useLiveChatRooms, useLiveChatMessages, useLiveChatRoomDetails, useLiveChatPresence, type SupabaseLiveChatMessage } from '@/hooks/use-livechat';
import { getMediaUrl, banLiveChatUser, unbanLiveChatUser, uploadChatImage, uploadLiveChatVoice, pinLiveChatMessage, unpinLiveChatMessage, type LiveChatRoom } from '@/lib/api/dehub';
import { getNFTInfo } from '@/lib/api/dehub/feed';
import { canDraftPublicLivePost } from '@/lib/live-public-chat-share';
import { PUBLIC_CHAT_PAGE_SIZE } from '@/lib/api/dehub/livechat';
import { Pin, X as XIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { buildAvatarUrl } from '@/lib/media-url';
import { validatePublicChatMedia } from '@/lib/public-chat-media';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { wasShownToUser } from '@/lib/chat-refusal';
import { useBuyAlerts, type BuyAlertMessage } from '@/hooks/use-buy-alerts';
import { BuyAlertCard } from './BuyAlertCard';
import { AssistantReplyCard } from './AssistantReplyCard';
import { useBuyBotHidden } from '@/hooks/use-buy-bot-hidden';
import { isAssistantAddress } from '@/lib/assistant';
import { useAssistantReplies, useAssistantReplyEngine } from '@/hooks/use-assistant-replies';
import { dismissKeyboard } from '@/hooks/use-keyboard-open';
import { AppState } from '@/components/app/AppState';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useFocusChatMessage, chatMessageDomId } from '@/hooks/use-focus-chat-message';
import { bringIntoViewAndFlash } from '@/lib/focus-scroll';
import { canLinkMessage, copyChatMessageLink, peekPendingChatLink, useLinkedMessage } from '@/lib/chat-message-link';
import { useStickToBottom } from '@/hooks/use-stick-to-bottom';
import { GroupCallButtons } from './calls/GroupCallButtons';
import { PUBLIC_CHAT_CALL_ID } from '@/lib/group-call';
import { ChatSearchBar, ChatSearchPanel, ChatSearchPill, rememberChatSearch, useChatSearch, type ChatSearchPerson } from './ChatSearch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Phone } from 'lucide-react';
import Video from '@/components/ui/cut-icons/video';
import { CallContext } from '@/contexts/CallContext';
import Plus from '@/components/ui/cut-icons/add';
import { CHAT_MENU_CONTENT } from './ChatOptionsMenu';
import { cn } from '@/lib/utils';
import { formatCount } from '@/lib/format-count';
import { useLocation, useNavigate } from 'react-router-dom';
import { dehubLinkFor } from '@/lib/dehub-links';

/** A row in the phone + menu, same as the Messages list menu's rows. */
const PC_ROW = 'flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-[14px] text-zinc-100 outline-none focus:bg-white/10 data-[highlighted]:bg-white/10 data-[disabled]:opacity-40 [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:text-zinc-400';

interface PublicChatProps {
  onBack: () => void;
  /** Shown inside another page (the Riftn community's Chat tab): no back button. */
  embedded?: boolean;
  /** /app/messages on phones: "24 online" moves under the title, search and
   *  text size stay, and calls, translate and room settings move behind +. */
  phoneB?: boolean;
}

/**
 * Converted lines, kept per server row: the hook swaps a row object only when
 * that row changes, so an unchanged line keeps the same Message and its
 * memoised ChatMessage skips re-rendering.
 */
const localMessageCache = new WeakMap<SupabaseLiveChatMessage, Message>();
function toLocalMessageCached(msg: SupabaseLiveChatMessage): Message {
  let out = localMessageCache.get(msg);
  if (!out) {
    out = toLocalMessage(msg);
    localMessageCache.set(msg, out);
  }
  return out;
}

/** Map Supabase livechat message to local ChatMessage format */
function toLocalMessage(msg: SupabaseLiveChatMessage): Message {
  return {
    id: msg.id,
    userId: msg.sender_address || 'unknown',
    userName: msg.sender_display_name || msg.sender_username || msg.sender_address?.slice(0, 8) || _translateCopy("copy.90395d452a30", { defaultValue: "Anon" }),
    userHandle: msg.sender_username || undefined,
    userAvatar: buildAvatarUrl(msg.sender_address || '', msg.sender_avatar_url) || undefined,
    badgeBalance: msg.sender_badge_balance,
    badgeLock: msg.sender_badge_lock,
    content: msg.content || '',
    timestamp: new Date(msg.created_at),
    type: (msg.message_type as Message['type']) || 'text',
    imageUrl: msg.image_url ? getMediaUrl(msg.image_url) : (msg.message_type === 'gif' && msg.content ? getMediaUrl(msg.content) : undefined),
    audioUrl: msg.audio_url ? getMediaUrl(msg.audio_url) : undefined,
    audioDuration: msg.audio_duration || undefined,

    isEdited: msg.is_edited,
    isPinned: !!msg.is_pinned,
    clientKey: msg.client_key,
    sendState: msg.send_state,
    reactions: msg.reactions,
    replyTo: msg.reply_to ? {
      id: msg.reply_to.id,
      content: msg.reply_to.content,
      senderName: msg.reply_to.sender_name,
    } : undefined,
  };
}

/**
 * The room-management surface is switched off because its API does not exist.
 *
 * The header buttons this gates open CreateTopicRoomModal and
 * RoomSettingsModal, whose submits call POST /api/livechat/rooms/topic,
 * PATCH /api/livechat/settings and POST /api/livechat/moderators — all three
 * 404 in production (the livechat controller serves /room, /messages,
 * /online, /status and the /mod/* moderation routes, nothing else). #462
 * repointed ban/unban/pin at routes that exist and stopped there, so every
 * room moderator has been looking at two buttons that submit into nothing.
 *
 * Flip this to true the day the backend grows those routes — the modals and
 * their API bindings are kept, not deleted, because they are the spec for
 * that work.
 */
const ROOM_MANAGEMENT_ENABLED = false;

/**
 * The chat opens on the newest lines and reads further back a page at a time
 * as the reader scrolls up, until the start of the room. Signed out, one page
 * past the opening one, then the sign-in wall.
 */
/** How close to the top (px) the next older page is fetched. */
const LOAD_OLDER_AT = 240;

/** Older pages (20 lines each) the room may pull in at open to reach where you left off. */
const MAX_READ_SPOT_PAGES = 10;

export function PublicChat({ onBack, embedded = false, phoneB = false }: PublicChatProps) {
  // A mention notification names the line that tagged the reader.
  useFocusChatMessage();
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const shareTokenId = location.state?.shareLiveTokenId;
  const pendingShareId = !embedded && isAuthenticated && typeof shareTokenId === 'string' && /^[1-9]\d*$/.test(shareTokenId)
    ? shareTokenId : undefined;
  const [confirmedShare, setConfirmedShare] = useState<{ key: string; account: string | null | undefined; url: string } | null>(null);
  const sharedLiveUrl = pendingShareId && confirmedShare?.key === location.key && confirmedShare.account === walletAddress
    ? confirmedShare.url : undefined;
  const clearSharedLive = useCallback(() => {
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, preventScrollReset: true, state: null });
  }, [location.pathname, location.search, navigate]);
  useEffect(() => {
    if (!pendingShareId) return;
    let cancelled = false;
    const unavailable = () => {
      if (cancelled) return;
      toast.error(t('profile.replyThread.postUnavailable'));
      clearSharedLive();
    };
    void getNFTInfo(pendingShareId).then(post => {
      if (cancelled) return;
      if (!canDraftPublicLivePost(post, pendingShareId)) { unavailable(); return; }
      setConfirmedShare({ key: location.key, account: walletAddress, url: dehubLinkFor.post(pendingShareId) });
    }, unavailable);
    return () => { cancelled = true; };
  }, [pendingShareId, location.key, walletAddress, clearSharedLive, t]);

  // Signed out, the room reads but does not write. Anything that would write
  // opens the sign-in sheet, and signing in lands back here in this room.
  const promptSignIn = useCallback(() => {
    openLoginModal({ path: '/chat?chat=public' });
  }, [openLoginModal]);

  // Search: one box for words and people. `list` shows what it found, `chat`
  // shows the room on the result that was opened.
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const call = useContext(CallContext);
  const [searchText, setSearchText] = useState('');
  const [searchPerson, setSearchPerson] = useState<ChatSearchPerson | null>(null);
  const [searchView, setSearchView] = useState<'list' | 'chat'>('list');
  const [activeHit, setActiveHit] = useState(-1);
  const [jumping, setJumping] = useState(false);

  // Reply state

  // Translation state
  const [translateSignal, setTranslateSignal] = useState(0);
  const [originalSignal, setOriginalSignal] = useState(0);
  // Stable value: a fresh object here re-rendered every line on each render.
  const translationShare = useMemo(() => ({
    translateSignal,
    originalSignal,
    requestTranslate: () => setTranslateSignal((n) => n + 1),
    requestOriginal: () => setOriginalSignal((n) => n + 1),
  }), [translateSignal, originalSignal]);
  const [isAllTranslated, setIsAllTranslated] = useState(false);

  // Fetch rooms, use the first available room
  const { rooms, isLoading: roomsLoading, error: roomsError, refetch: refetchRooms } = useLiveChatRooms();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useDraftState<Message | null>(selectedRoomId ? `room:${selectedRoomId}:reply` : null, null);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auto-select the first room once loaded, or the room a copied message
  // link names.
  useEffect(() => {
    if (!rooms.length) return;
    if (pendingShareId) {
      setSelectedRoomId(rooms[0].id);
      return;
    }
    const linked = peekPendingChatLink('public')?.target;
    const linkedRoom = linked?.kind === 'public' && linked.roomId && rooms.some((r) => r.id === linked.roomId) ? linked.roomId : null;
    if (linkedRoom && linkedRoom !== selectedRoomId) setSelectedRoomId(linkedRoom);
    else if (!selectedRoomId) setSelectedRoomId(rooms[0].id);
  }, [rooms, selectedRoomId, pendingShareId]);

  const {
    messages: apiMessages, isLoading: messagesLoading, isBanned,
    send, retrySend, discardSend, addReaction, removeReaction, editMessage, deleteMessage, refetch,
    hasOlder, loadingOlder, loadOlder, signInWall,
    hasNewer, jumpTo, loadNewer, backToLatest,
  } = useLiveChatMessages(selectedRoomId, { pageSize: PUBLIC_CHAT_PAGE_SIZE });
  const search = useChatSearch(selectedRoomId, isSearchOpen && isAuthenticated, searchText, searchPerson?.address ?? null);

  // Fetch full room details
  const { room: roomDetails } = useLiveChatRoomDetails(selectedRoomId);

  // Online presence
  const { onlineCount } = useLiveChatPresence(selectedRoomId);

  // Buy alerts
  const buyAlerts = useBuyAlerts();
  const { isHidden: buyBotHidden, hide: hideBuyBot } = useBuyBotHidden();

  // selectedRoom must be declared before isModerator useMemo (which uses it)
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;

  // Determine moderation rights. Room moderators come from the room's list.
  // Room moderators only. There used to be a second path here: anyone holding a
  // Riftn admin token in this browser got full moderation, routed through
  // /api/admin/livechat/*. That is why a token with god-mode over the whole
  // platform lived in localStorage on the public site, reachable by any XSS on
  // dehub.io — for a convenience that the admin panel already does better, and
  // now audits.
  //
  // Admins moderate chat from godmode.dehub.io → Global Chat. Room moderators
  // are unaffected.
  // Fallback to selectedRoom.moderators when roomDetails hasn't loaded yet.
  const isRoomModerator = useMemo(() => {
    if (!walletAddress) return false;
    const mods = roomDetails?.moderators || selectedRoom?.moderators || [];
    return mods.some(
      (mod: string) => mod.toLowerCase() === walletAddress.toLowerCase()
    );
  }, [walletAddress, roomDetails, selectedRoom]);
  const isModerator = isRoomModerator;
  // Moderators can't ban each other: only a super moderator can.
  const canBanSender = useCallback((address?: string) => {
    const mods = (roomDetails?.moderators || []).map((m: string) => m.toLowerCase());
    const supers = (roomDetails?.superModerators || []).map((m: string) => m.toLowerCase());
    if (!address || !mods.includes(address.toLowerCase())) return true;
    return !!walletAddress && supers.includes(walletAddress.toLowerCase());
  }, [roomDetails, walletAddress]);

  // Convert API messages to local format
  const messages: Message[] = useMemo(() => apiMessages.map(toLocalMessageCached), [apiMessages]);

  // Assistant replies are ordinary chat messages now — they arrive over the
  // socket like everyone else's and only differ in how they are rendered. The
  // local engine below is a fallback for deployments where the API side is not
  // live yet; it stands itself down as soon as a real one arrives.
  useAssistantReplyEngine(apiMessages);
  const localAssistantReplies = useAssistantReplies();

  // Lines you deleted for yourself only (lib/public-chat-hidden).
  const hiddenLines = useHiddenLines(walletAddress);

  // The room's lines with buy alerts and local assistant replies folded in
  const filteredMessages = useMemo(() => {
    // Buy alerts sit beside the history that is loaded, never further back:
    // a trade from months ago must not stack up above the first page.
    const oldestLoaded = messages.length ? messages[0].timestamp.getTime() : Date.now();
    // Reading old history (a search result): nothing newer than the window either.
    const newestLoaded = hasNewer && messages.length ? messages[messages.length - 1].timestamp.getTime() : Infinity;
    const buyAlertMessages: Message[] = buyAlerts
      .filter((alert) => {
        const at = new Date(alert.created_at).getTime();
        return at >= oldestLoaded && at <= newestLoaded;
      })
      .map((alert) => ({
      id: `buy-alert-${alert.id}`,
      userId: 'buy-bot',
      userName: 'Buy Bot',
      content: alert.content,
      timestamp: new Date(alert.created_at),
      type: 'buy_alert' as Message['type'],
    }));

    const localAssistantMessages: Message[] = localAssistantReplies.map((r) => ({
      id: `assistant-reply-${r.id}`,
      userId: 'assistant',
      userName: 'assistant',
      content: r.content,
      timestamp: r.timestamp,
      type: 'assistant_reply' as Message['type'],
      replyTo: r.replyToName ? { id: '', content: '', senderName: r.replyToName } : undefined,
    }));

    return [...messages, ...buyAlertMessages, ...(hasNewer ? [] : localAssistantMessages)]
      .filter((m) => !hiddenLines.has(m.id))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [messages, buyAlerts, localAssistantReplies, hasNewer, hiddenLines]);

  // ─── Where you left off ───────────────────────────────────────────────────
  // Signed in, the room opens on the first line you haven't seen (saved on
  // the server, same on every device) under an "Unread messages" line.
  const readSpot = useChatReadPosition(isAuthenticated && selectedRoomId && /^[a-z0-9_-]{1,40}$/i.test(selectedRoomId) ? `live:${selectedRoomId}` : null);
  const [unreadAnchor, setUnreadAnchor] = useState<UnreadAnchor | null>(null);
  const [unreadMarkerSeen, setUnreadMarkerSeen] = useState(false);
  const [unreadMarkerAbove, setUnreadMarkerAbove] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const [scrolledUp, setScrolledUp] = useState(false);
  const readDecidedRoom = useRef<string | null>(null);
  const unreadPlacedRef = useRef(false);
  const readSpotPagesRef = useRef(0);
  const readTrackingRef = useRef(false);
  const ownAddress = walletAddress?.toLowerCase() ?? null;
  const readLines = useMemo(() => messages.map((m) => ({
    id: m.id,
    own: !!ownAddress && m.userId?.toLowerCase() === ownAddress,
    at: m.timestamp.getTime(),
    skip: !!m.sendState || isAssistantAddress(m.userId),
  })), [messages, ownAddress]);

  const openSearch = useCallback((person?: ChatSearchPerson) => {
    setSearchPerson(person ?? null);
    setSearchText('');
    setSearchView('list');
    setActiveHit(-1);
    setIsSearchOpen(true);
    // With a person already chosen their messages are the answer; otherwise
    // the box is waiting to be typed in.
    if (!person) setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchText('');
    setSearchPerson(null);
    setSearchView('list');
    setActiveHit(-1);
  }, []);
  const showSearchList = isSearchOpen && searchView === 'list';

  /** Bring a line into view once it is on the page, and flash it. */
  const stopFocus = useRef<(() => void) | undefined>(undefined);
  const focusRow = useCallback((id: string) => {
    stopFocus.current?.();
    const started = Date.now();
    const timer = window.setInterval(() => {
      const el = document.getElementById(chatMessageDomId(id));
      if (el) {
        window.clearInterval(timer);
        stopFocus.current = bringIntoViewAndFlash(el);
      } else if (Date.now() - started > 4000) {
        window.clearInterval(timer);
      }
    }, 80);
    stopFocus.current = () => window.clearInterval(timer);
  }, []);
  useEffect(() => () => stopFocus.current?.(), []);

  /** Open the chat on one search result, reading the next page of results if it is not loaded yet. */
  const openResult = useCallback(async (index: number) => {
    if (index < 0 || jumping) return;
    let hit = search.results[index];
    if (!hit && search.hasMore) {
      setJumping(true);
      const more = await search.loadMore();
      hit = more[index - search.results.length];
    }
    if (!hit) { setJumping(false); return; }
    rememberChatSearch(searchText);
    searchInputRef.current?.blur();
    followLatest.current = false;
    setActiveHit(index);
    setSearchView('chat');
    setJumping(true);
    const found = await jumpTo(hit.id);
    setJumping(false);
    if (found) focusRow(hit.id);
    else toast.error(_copy('chatSearch.gone', { defaultValue: 'That message is no longer here' }));
  }, [jumping, search, searchText, jumpTo, focusRow, _copy]);

  // A copied message link: open the room on that line and light it up.
  const linkedTarget = peekPendingChatLink('public')?.target;
  const linkedRoomId = linkedTarget?.kind === 'public' ? linkedTarget.roomId : null;
  const linkRoomReady = !!selectedRoomId && (!linkedRoomId || linkedRoomId === selectedRoomId || !rooms.some((r) => r.id === linkedRoomId));
  useLinkedMessage(
    'public',
    linkRoomReady && !messagesLoading && messages.length > 0,
    async (id) => {
      followLatest.current = false;
      if (selectedRoomId) readDecidedRoom.current = selectedRoomId;
      readTrackingRef.current = true;
      setUnreadAnchor(null);
      const found = await jumpTo(id);
      // Signed out past the guest window: the chat shows its sign-in wall.
      return found || isAuthenticated ? found : null;
    },
    (id) => document.getElementById(chatMessageDomId(id)),
  );
  const handleCopyLink = useCallback((message: Message) => {
    copyChatMessageLink({ kind: 'public', roomId: selectedRoomId }, message.id);
  }, [selectedRoomId]);

  /** Back to the newest lines after reading old history. */
  const goToLatest = useCallback(async () => {
    followLatest.current = true;
    await backToLatest();
  }, [backToLatest]);

  const handleSeeMessages = useCallback((message: Message) => {
    if (!isAuthenticated) { promptSignIn(); return; }
    openSearch({ address: message.userId, name: message.userName, username: message.userHandle, avatarUrl: message.userAvatar });
  }, [isAuthenticated, promptSignIn, openSearch]);

  const handleTranslateAll = useCallback(() => {
    if (isAllTranslated) {
      setOriginalSignal(s => s + 1);
      setIsAllTranslated(false);
    } else {
      setTranslateSignal(s => s + 1);
      setIsAllTranslated(true);
    }
  }, [isAllTranslated]);

  /**
   * Where the reader was when an older page was asked for, so the page lands
   * above them without moving what they were reading.
   */
  const olderAnchor = useRef<{ height: number; top: number } | null>(null);
  const requestOlder = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !hasOlder || loadingOlder || signInWall) return;
    olderAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
    void loadOlder();
  }, [hasOlder, loadingOlder, signInWall, loadOlder]);
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const anchor = olderAnchor.current;
    if (!el || !anchor || loadingOlder) return;
    olderAnchor.current = null;
    el.scrollTop = el.scrollHeight - anchor.height + anchor.top;
  }, [filteredMessages.length, loadingOlder, signInWall]);
  // A first page too short to scroll can never be scrolled up from: keep
  // reading back until the list fills the panel or the history runs out.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || messagesLoading || !filteredMessages.length) return;
    if (el.scrollHeight <= el.clientHeight + 8) requestOlder();
  }, [filteredMessages.length, messagesLoading, requestOlder]);

  const followedRoom = useRef<string | null>(null);
  const followLatest = useRef(true);
  // Position initial history immediately, and follow new rows only while the
  // reader is at the tail. Scroll this list without moving its ancestors.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && filteredMessages.length > 0) {
      if (followedRoom.current !== selectedRoomId) followLatest.current = true;
      if (followLatest.current) container.scrollTop = container.scrollHeight;
      followedRoom.current = selectedRoomId;
    }
  }, [filteredMessages.length, selectedRoomId]);
  // Rows keep growing after they land (images, replies, reactions), so stay
  // pinned to the very bottom through those too, not just on new rows.
  useStickToBottom(scrollContainerRef, () => followLatest.current && !olderAnchor.current);

  // Decide once per room where it opens: on the "Unread messages" line, or at
  // the newest line as before.
  useEffect(() => {
    if (!selectedRoomId || readDecidedRoom.current === selectedRoomId) return;
    if (messagesLoading || !messages.length || !readSpot.ready) return;
    const decide = (anchor: UnreadAnchor | null) => {
      readDecidedRoom.current = selectedRoomId;
      readSpotPagesRef.current = 0;
      unreadPlacedRef.current = false;
      setUnreadMarkerSeen(false);
      setUnreadAnchor(anchor);
      if (anchor) {
        followLatest.current = false;
        window.setTimeout(() => { readTrackingRef.current = true; }, 1500);
      } else {
        readTrackingRef.current = true;
      }
    };
    if (!readSpot.opening || hasNewer || isSearchOpen) { decide(null); return; }
    const found = anchorFromReadSpot(readLines, readSpot.opening, hasOlder && !signInWall);
    if (found.kind === 'older') {
      if (readSpotPagesRef.current < MAX_READ_SPOT_PAGES) {
        if (!loadingOlder) {
          readSpotPagesRef.current += 1;
          requestOlder();
        }
        return;
      }
      const theirs = readLines.filter((l) => !l.own && !l.skip);
      decide(theirs.length ? { id: theirs[0].id, ids: theirs.map((l) => l.id), count: theirs.length } : null);
      return;
    }
    decide(found.kind === 'anchor' ? found.anchor : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, messages.length, messagesLoading, readSpot.ready, hasOlder, loadingOlder, signInWall]);

  /** Every line below the fold (the scroll-down count), not just the unread ones. */

  /** How many unread lines sit below the fold, and whether the marker is above it. */
  const refreshUnreadJump = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !unreadAnchor) return;
    const box = container.getBoundingClientRect();
    let below = 0;
    for (const id of unreadAnchor.ids) {
      const el = document.getElementById(chatMessageDomId(id));
      if (el && el.getBoundingClientRect().top > box.bottom - 4) below++;
    }
    setUnreadBelow(below);
    const marker = container.querySelector<HTMLElement>('[data-chat-unread-marker]');
    if (!marker) { setUnreadMarkerAbove(false); return; }
    const r = marker.getBoundingClientRect();
    const above = r.bottom < box.top;
    setUnreadMarkerAbove(above);
    if (!above && r.top < box.bottom) setUnreadMarkerSeen(true);
  }, [unreadAnchor]);

  /** Saves the newest line on screen as where you left off. */
  const reportReadSpot = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !readTrackingRef.current || readDecidedRoom.current !== selectedRoomId) return;
    const ids: string[] = [];
    for (let i = messages.length - 1; i >= 0; i--) if (!messages[i].sendState) ids.push(messages[i].id);
    const id = newestLineOnScreen(container, ids, (x) => document.getElementById(chatMessageDomId(x)));
    if (!id) return;
    const line = messages.find((m) => m.id === id);
    if (line) readSpot.report(line.id, line.timestamp.toISOString());
  }, [messages, selectedRoomId, readSpot.report]);

  const scrollFrame = useRef(0);
  const scheduleScrollWork = useCallback(() => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      refreshUnreadJump();
      reportReadSpot();
    });
  }, [refreshUnreadJump, reportReadSpot]);
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);
  useEffect(() => {
    const timer = window.setTimeout(scheduleScrollWork, 400);
    return () => window.clearTimeout(timer);
  }, [messages, scheduleScrollWork]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleScrollWork(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [scheduleScrollWork]);

  // Land on the marker: just under the top edge, the unread lines below it.
  useLayoutEffect(() => {
    if (!unreadAnchor || unreadPlacedRef.current) return;
    const container = scrollContainerRef.current;
    const marker = container?.querySelector<HTMLElement>('[data-chat-unread-marker]');
    if (!container || !marker) return;
    unreadPlacedRef.current = true;
    followLatest.current = false;
    const offset = marker.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop = Math.max(0, container.scrollTop + offset - 8);
    const fromEnd = container.scrollHeight - container.clientHeight - container.scrollTop;
    // Few enough unread lines to fit: the clamp left us at the bottom, so follow it.
    followLatest.current = fromEnd < 120;
    readTrackingRef.current = true;
    scheduleScrollWork();
  }, [unreadAnchor, filteredMessages.length, scheduleScrollWork]);

  const jumpToUnreadMarker = useCallback(() => {
    const container = scrollContainerRef.current;
    const marker = container?.querySelector<HTMLElement>('[data-chat-unread-marker]');
    if (!container || !marker) return;
    const offset = marker.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: Math.max(0, container.scrollTop + offset - 8), behavior: 'smooth' });
    setUnreadMarkerSeen(true);
  }, []);
  const jumpToNewest = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    followLatest.current = true;
    glideToBottom(container);
  }, []);

  const handleReply = useCallback((message: Message) => {
    setReplyTo(message);
  }, [setReplyTo]);

  const handleCancelReply = useCallback(() => {
    setReplyTo.complete(replyTo, null);
  }, [replyTo, setReplyTo]);

  // Runs before the composer lets go of anything, so a refused attachment
  // leaves the text and the file in place with the reason on screen instead
  // of failing after the upload and losing what was typed.
  const canSendPublic = useCallback(({ type, mediaFile }: Pick<ChatInputSendArgs, 'type' | 'mediaFile'>): boolean => {
    if (type !== 'media' || !mediaFile) return true;
    const check = validatePublicChatMedia(mediaFile);
    if (!check.ok) {
      toast.error(check.error);
      return false;
    }
    return true;
  }, []);

  const handleSendMessage = async (args: { content: string; type: string; gifUrl?: string; mediaFile?: File; duration?: number }) => {
    // Signed out: the typed line stays in the box while they sign in.
    if (!isAuthenticated) { promptSignIn(); return false; }
    if (!selectedRoomId) return false;
    // Reading old history: a new line belongs at the end, so go there first.
    if (hasNewer) await goToLatest();
    const replyToId = replyTo?.id;
    try {
      if (args.type === 'media' && args.mediaFile) {
        const { url: imageUrl } = await uploadChatImage(args.mediaFile);
        await send(args.content || '', 'image', imageUrl, replyToId);
      } else if (args.type === 'gif' && args.gifUrl) {
        // The picture goes in the attachment, never in the body. A GIF posted
        // with its URL as the message text reads as a picture here — every
        // other client that renders the text renders a stray link instead.
        await send('', 'gif', args.gifUrl, replyToId);
      } else if (args.type === 'voice' && args.mediaFile) {
        const { url: audioUrl, duration } = await uploadLiveChatVoice(args.mediaFile);
        await send('', 'audio', undefined, replyToId, audioUrl, duration);
      } else {
        await send(args.content || '', 'text', undefined, replyToId);
      }
      setReplyTo(current => current?.id === replyToId ? null : current);
      return true;
    } catch (err) {
      console.error('[PublicChat] Send failed:', err);
      if (!wasShownToUser(err)) toast.error(_copy("copy.66b8e077d85f", { defaultValue: "Failed to send message" }));
      return false;
    }
  };

  const handleBanUser = useCallback(async (userId: string, userName: string) => {
    if (!isAuthenticated) {
      toast.error(_copy("copy.7a523e7dc8a3", { defaultValue: "Sign in to moderate" }));
      return;
    }
    try {
      if (!selectedRoomId) throw new Error(_copy("copy.4f3f0775de93", { defaultValue: "No room selected" }));
      await banLiveChatUser(selectedRoomId, userId);
      toast.success(_copy("copy.40d34517b8a0", { defaultValue: "{{value1}} has been banned", value1: userName }));
      refetch();
    } catch (err) {
      console.error('[PublicChat] Ban failed:', err);
      toast.error(err instanceof Error ? err.message : _copy("copy.d0cae9640dc7", { defaultValue: "Failed to ban user" }));
    }
  }, [selectedRoomId, isAuthenticated, refetch, _copy]);

  const handleUnbanUser = useCallback(async (userId: string, userName: string) => {
    if (!isAuthenticated) {
      toast.error(_copy("copy.7a523e7dc8a3", { defaultValue: "Sign in to moderate" }));
      return;
    }
    try {
      if (!selectedRoomId) throw new Error(_copy("copy.4f3f0775de93", { defaultValue: "No room selected" }));
      await unbanLiveChatUser(selectedRoomId, userId);
      toast.success(_copy("copy.4715f5cd4252", { defaultValue: "{{value1}} has been unbanned", value1: userName }));
      refetch();
    } catch (err) {
      console.error('[PublicChat] Unban failed:', err);
      toast.error(err instanceof Error ? err.message : _copy("copy.29166786d637", { defaultValue: "Failed to unban user" }));
    }
  }, [selectedRoomId, isAuthenticated, refetch, _copy]);

  /**
   * Remove a message.
   *
   * Over the socket rather than the moderator REST route: the gateway accepts
   * a delete from the message's own author as well as from a moderator, which
   * is what lets anyone clear their own line here, and it tells the room
   * straight away instead of waiting on a refetch.
   */
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const { requestDelete, dialog: deleteDialog } = usePublicChatDelete({
    account: walletAddress,
    canDeleteAny: isModerator,
    deleteForEveryone: deleteMessage,
  });
  // Asks "for everyone" or "for me", like DMs and community chats.
  const handleDeleteMessage = useCallback((messageId: string) => {
    const line = messagesRef.current.find((m) => m.id === messageId);
    const mine = !!line && !!walletAddress && line.userId?.toLowerCase() === walletAddress.toLowerCase();
    requestDelete(messageId, mine);
  }, [requestDelete, walletAddress]);

  const handleEditMessage = useCallback((messageId: string, content: string) => editMessage(messageId, content), [editMessage]);

  /*
   * Pinned line, Telegram style: a bar over the list, moderators pin and
   * unpin from the message menu. The room details carry the server's pins;
   * a pin made here shows straight away and the details are read again.
   */
  const [pinOverride, setPinOverride] = useState<{ id: string | null; message?: Message } | null>(null);
  useEffect(() => { setPinOverride(null); }, [selectedRoomId]);
  const serverPinned = useMemo(() => {
    const list = (roomDetails?.pinnedMessages ?? []) as unknown[];
    const last = list[list.length - 1] as { id?: string; _id?: string; content?: string } | string | undefined;
    if (!last) return messages.find((m) => m.isPinned) ?? null;
    const id = typeof last === 'string' ? last : (last.id || last._id || '');
    return messages.find((m) => m.id === id) ?? (typeof last === 'string' ? null : { id, content: last.content || '' } as Message);
  }, [roomDetails, messages]);
  const pinnedMessage: Message | null = pinOverride
    ? (pinOverride.id ? (messages.find((m) => m.id === pinOverride.id) ?? pinOverride.message ?? null) : null)
    : serverPinned;
  const handleTogglePin = useCallback(async (message: Message) => {
    if (!selectedRoomId) return;
    const unpin = pinnedMessage?.id === message.id;
    try {
      if (unpin) await unpinLiveChatMessage(selectedRoomId, message.id);
      else await pinLiveChatMessage(selectedRoomId, message.id);
      setPinOverride(unpin ? { id: null } : { id: message.id, message });
      toast.success(unpin ? _copy('msgMenu.unpinned', { defaultValue: 'Message unpinned' }) : _copy('msgMenu.pinned', { defaultValue: 'Message pinned' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : _copy('msgMenu.pinFailed', { defaultValue: 'Could not pin the message' }));
    }
  }, [selectedRoomId, pinnedMessage, _copy]);

  // Merge list-level room data with the richer single-room details
  const enrichedRoom = roomDetails || selectedRoom;
  const isLoading = roomsLoading || (messagesLoading && apiMessages.length === 0);
  const roomName = t('publicChat.title');
  const roomDescription = t('publicChat.allThingsDeHub');

  const handleRoomCreated = useCallback((room: LiveChatRoom) => {
    refetchRooms();
    setSelectedRoomId(room.id);
  }, [refetchRooms]);

  // The rows only change when a line, the reply target, the pin or the
  // unread marker does. Kept as one memoised list so scroll-driven state
  // (the jump button, unread counts) re-renders the frame, not every line.
  const messageRows = useMemo(() => filteredMessages.map((message) => {
      const row = (
      message.id.startsWith('buy-alert-') ? (
        buyBotHidden ? null : (
          <BuyAlertCard
            key={message.id}
            content={message.content}
            timestamp={message.timestamp.toISOString()}
            onHide={hideBuyBot}
          />
        )
      ) : isAssistantAddress(message.userId) || message.id.startsWith('assistant-reply-') ? (
        <AssistantReplyCard
          key={message.id}
          content={message.content}
          timestamp={message.timestamp}
          replyToName={message.replyTo?.senderName}
        />
      ) : (
      <ChatMessage
        key={message.clientKey ?? message.id}
        message={message}
        showActions={isModerator}
        moderators={roomDetails?.moderators}
        currentUserAddress={walletAddress || undefined}
        onBan={canBanSender(message.userId) ? handleBanUser : undefined}
        onUnban={handleUnbanUser}
        onDelete={handleDeleteMessage}
        onEdit={handleEditMessage}
        onReact={isAuthenticated ? addReaction : promptSignIn}
        onRemoveReaction={removeReaction}
        onReply={isAuthenticated ? handleReply : undefined}
        onRetrySend={retrySend}
        onDiscardSend={discardSend}
        onSeeMessages={handleSeeMessages}
        onCopyLink={canLinkMessage(message.id) ? handleCopyLink : undefined}
        holdFrame
        replying={!!replyTo && replyTo.id === message.id}
        onTogglePin={isModerator ? handleTogglePin : undefined}
        isPinned={pinnedMessage?.id === message.id}
      />
      )
      );
      return (
        <Fragment key={message.clientKey ?? message.id}>
          {unreadAnchor?.id === message.id && readDecidedRoom.current === selectedRoomId && (
            <UnreadMarker count={unreadAnchor.count} />
          )}
          {row}
        </Fragment>
      );
    }), [filteredMessages, buyBotHidden, hideBuyBot, isModerator, roomDetails?.moderators, walletAddress, handleBanUser, canBanSender, handleUnbanUser, handleDeleteMessage, handleEditMessage, isAuthenticated, addReaction, promptSignIn, removeReaction, handleReply, retrySend, discardSend, handleSeeMessages, handleCopyLink, replyTo, handleTogglePin, pinnedMessage?.id, unreadAnchor, selectedRoomId]);

  return (
    <div data-page-bento data-bento-flat className="flex flex-col h-full overflow-hidden overflow-x-hidden">
      {/* Header */}
      {isSearchOpen ? (
        <ChatSearchBar
          inputRef={searchInputRef}
          text={searchText}
          person={searchPerson}
          onText={(value) => { setSearchText(value); setSearchView('list'); setActiveHit(-1); }}
          onClearPerson={() => { setSearchPerson(null); setSearchView('list'); setActiveHit(-1); searchInputRef.current?.focus(); }}
          onFocusList={() => setSearchView('list')}
          onClose={closeSearch}
        />
      ) : (
      <div data-chat-header className="flex items-center justify-between gap-2 p-4 border-b border-white/[0.07]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {!embedded && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
            onClick={onBack}
            data-swipe-back
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          )}
          
          <div className="min-w-0">
            <h2 className="font-bold text-white truncate">{roomName}</h2>
            {phoneB ? (
              selectedRoomId ? (
                <p data-live-chat-online role="status" aria-label={t('publicChat.onlineHint', { count: onlineCount, defaultValue: '{{count}} people are in this chat right now' })}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 tabular-nums">
                  <span aria-hidden="true" className="live-chat-lens" />
                  <span aria-hidden="true">{t('publicChat.online', { count: formatCount(onlineCount) as unknown as number, defaultValue: '{{count}} online' })}</span>
                </p>
              ) : null
            ) : roomDescription ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-zinc-500 text-xs truncate max-w-[180px]">
                    {roomDescription}
                  </p>
                </TooltipTrigger>
                <TooltipContent>{roomDescription}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
        
        {phoneB ? (
        <div data-live-chat-toolbar className="flex shrink-0 items-center gap-1">
          {!isBanned && (
            <GroupCallButtons groupId={PUBLIC_CHAT_CALL_ID} groupName={t('publicChat.title')} joinOnly />
          )}
          {/* Search and text size on the bar; calls, translate and room
              settings behind + so the top isn't crowded on phones. "24 online"
              sits under the title (2026-11-24). */}
          <button type="button" className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-white" data-chat-search-open
            aria-label={t('publicChat.searchMessages')} onClick={() => openSearch()}>
            <Search className="w-4 h-4" />
          </button>
          <ChatTextSizeButton />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" data-public-chat-plus aria-label={_copy('chatTabs.menu', { defaultValue: 'Chat options' })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:text-white [&_svg]:h-5 [&_svg]:w-5">
                <Plus />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} data-chat-options-menu className={cn(CHAT_MENU_CONTENT, 'text-white')}>
              {call && walletAddress && !isBanned && (
                <>
                  <DropdownMenuItem className={PC_ROW} disabled={!!call.currentCall}
                    onSelect={() => { void call.joinGroupCall({ id: PUBLIC_CHAT_CALL_ID, name: t('publicChat.title') }, 'audio'); }}>
                    <Phone />{t('calls.groupVoiceCall', 'Group voice call')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className={PC_ROW} disabled={!!call.currentCall}
                    onSelect={() => { void call.joinGroupCall({ id: PUBLIC_CHAT_CALL_ID, name: t('publicChat.title') }, 'video'); }}>
                    <Video />{t('calls.groupVideoCall', 'Group video call')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 h-px bg-white/10" />
                </>
              )}
              <DropdownMenuItem className={PC_ROW} onSelect={handleTranslateAll}>
                {isAllTranslated ? <RotateCcw /> : <Languages />}
                {isAllTranslated ? _copy("copy.16194a69c43d", { defaultValue: "Show original" }) : _copy("copy.29a7e1c24c92", { defaultValue: "Translate all" })}
              </DropdownMenuItem>
              {ROOM_MANAGEMENT_ENABLED && isRoomModerator && (
                <>
                  <DropdownMenuItem className={PC_ROW} onSelect={() => setCreateRoomOpen(true)}>
                    <MessageSquarePlus />{_copy("copy.af8be239071a", { defaultValue: "Create new room" })}
                  </DropdownMenuItem>
                  <DropdownMenuItem className={PC_ROW} onSelect={() => setSettingsOpen(true)}>
                    <Settings />{_copy("copy.eb8482c5ca05", { defaultValue: "Room settings" })}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        ) : (
        <div data-live-chat-toolbar data-public-chat-wide-tools className="flex shrink-0 items-center gap-1">
          {/* Online count first, so the call buttons sit with the other
              buttons instead of being split from them by the number. */}
          {selectedRoomId && <LiveChatOnlineCount count={onlineCount} />}
          <ChatTextSizeButton />
          {/* Translate all toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isAllTranslated ? 'text-white bg-zinc-700' : 'text-zinc-400 hover:text-white'}`}
                onClick={handleTranslateAll}
              >
                {isAllTranslated ? <RotateCcw className="w-4 h-4" /> : <Languages className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isAllTranslated ? _copy("copy.16194a69c43d", { defaultValue: "Show original" }) : _copy("copy.29a7e1c24c92", { defaultValue: "Translate all" })}</TooltipContent>
          </Tooltip>
          {!embedded && !isBanned && (
            <GroupCallButtons groupId={PUBLIC_CHAT_CALL_ID} groupName={t('publicChat.title')} />
          )}
          {/* Search toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white"
                data-chat-search-open
                onClick={() => openSearch()}
              >
                <Search className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('publicChat.searchMessages')}</TooltipContent>
          </Tooltip>
          {ROOM_MANAGEMENT_ENABLED && isRoomModerator && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white"
                  onClick={() => setCreateRoomOpen(true)}
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{_copy("copy.af8be239071a", { defaultValue: "Create new room" })}</TooltipContent>
            </Tooltip>
          )}
          {ROOM_MANAGEMENT_ENABLED && isRoomModerator && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{_copy("copy.eb8482c5ca05", { defaultValue: "Room settings" })}</TooltipContent>
            </Tooltip>
          )}
        </div>
        )}
      </div>
      )}

      {pinnedMessage && !showSearchList && (
        <div data-chat-pinned-bar className="mx-3 mt-2 flex items-center gap-2.5 rounded-2xl px-3 py-2">
          <button
            type="button"
            onClick={() => { void jumpTo(pinnedMessage.id).then((found) => { if (found) focusRow(pinnedMessage.id); }); }}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <span data-chat-pinned-accent className="h-8 w-[3px] shrink-0 rounded-full" />
            <span className="min-w-0 flex-1">
              <span data-chat-pinned-label className="block text-[11px] font-semibold leading-tight">{_copy('copy.2aa60e3c77ee', { defaultValue: 'Pinned Message' })}</span>
              <span className="block truncate text-[13px] leading-snug opacity-80">
                {pinnedMessage.userName ? <span className="font-semibold">{pinnedMessage.userName}: </span> : null}
                {pinnedMessage.content || _copy('copy.2bc85f36b3e4', { defaultValue: '📎 Media' })}
              </span>
            </span>
            <Pin className="h-4 w-4 shrink-0 opacity-60" />
          </button>
          {isModerator && (
            <button
              type="button"
              onClick={() => void handleTogglePin(pinnedMessage)}
              aria-label={_copy('copy.ee3c71613054', { defaultValue: 'Unpin' })}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full opacity-60 transition-opacity hover:opacity-100"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Messages Area */}
      <SharedTranslationContext.Provider value={translationShare}>
      <div className="relative flex-1">
        <div
          ref={scrollContainerRef}
          data-public-chat-ready={isAuthenticated || roomsError || (!roomsLoading && (!rooms.length || apiMessages.length > 0))
            ? '' : undefined}
          onScroll={(event) => {
            const el = event.currentTarget;
            const fromEnd = el.scrollHeight - el.clientHeight - el.scrollTop;
            // In old history the end of the list is not the newest line yet.
            followLatest.current = !hasNewer && fromEnd < 120;
            setScrolledUp(fromEnd > 160);
            scheduleScrollWork();
            if (el.scrollTop < LOAD_OLDER_AT) requestOlder();
            if (hasNewer && fromEnd < LOAD_OLDER_AT) void loadNewer();
          }}
          onPointerDown={dismissKeyboard}
          className={`absolute inset-0 chat-text-zone overflow-y-auto py-2 ${showSearchList ? 'invisible' : ''}`}
        >
          {roomsError ? (
            <AppState
              icon="messages"
              title={_copy("copy.a802859daeb1", { defaultValue: "Chat could not load" })}
              description={roomsError}
              kind="error"
              size="section"
              className="h-full"
              primaryAction={{ label: _copy("copy.d8b8392e2c54", { defaultValue: "Try again" }), onClick: () => refetchRooms(), icon: <RefreshCw /> }}
            />
          ) : !roomsLoading && rooms.length === 0 ? (
            <AppState icon="messages" title={_copy("copy.979975195132", { defaultValue: "No chat rooms available" })} description={_copy("copy.4449e5c90870", { defaultValue: "Check back later or create a room." })} size="section" className="h-full" />
          ) : isLoading ? (
            <>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-3 py-2 px-4">
                  <Skeleton className="w-8 h-8 rounded-full bg-zinc-800 flex-shrink-0" />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <Skeleton className="h-3 w-24 bg-zinc-800" />
                    <Skeleton className="h-4 w-48 bg-zinc-800" />
                  </div>
                </div>
              ))}
            </>
          ) : messages.length === 0 ? (
            <AppState icon="messages" title={_copy("copy.f42e0f66017d", { defaultValue: "No messages yet" })} description={_copy("copy.39e31bf6b245", { defaultValue: "Be the first to say something." })} size="section" className="h-full" />
          ) : (
            <>
            {signInWall ? (
              <div data-chat-sign-in-wall className="mx-4 my-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-4 text-center">
                <p className="text-sm font-semibold text-white">{_copy("copy.27c26a5a38b3", { defaultValue: "Sign in to see older messages" })}</p>
                <p className="mt-1 text-xs text-zinc-400">{_copy("copy.674e70bcd915", { defaultValue: "The full chat history is open to everyone with an account." })}</p>
                <Button size="sm" className="mt-3 rounded-full px-5" onClick={promptSignIn}>
                  {_copy("copy.bfd402b2f6f3", { defaultValue: "Sign in" })}
                </Button>
              </div>
            ) : !hasOlder && !messagesLoading && messages.length > 0 ? (
              <p data-chat-history-start className="py-3 text-center text-[11px] text-zinc-500">
                {_copy("copy.feaf753f6557", { defaultValue: "Start of the chat" })}
              </p>
            ) : null}
            {messageRows}
            </>
          )}
          <div ref={bottomRef} />
        </div>
        {isSearchOpen && searchView === 'chat' && search.results[activeHit] ? (
          // The opened result stays marked after its arrival flash fades.
          <style>{`#${chatMessageDomId(search.results[activeHit].id)}{background:rgba(255,213,74,0.14);box-shadow:inset 3px 0 0 rgba(255,213,74,0.9)}`}</style>
        ) : null}
        {showSearchList && (
          <ChatSearchPanel
            text={searchText}
            person={searchPerson}
            search={search}
            signedIn={isAuthenticated}
            activeId={search.results[activeHit]?.id ?? null}
            onSignIn={promptSignIn}
            onPickPerson={(person) => { setSearchPerson(person); setSearchText(''); setActiveHit(-1); }}
            onPickText={(value) => { setSearchText(value); searchInputRef.current?.focus(); }}
            onOpenResult={openResult}
          />
        )}
        {isSearchOpen && searchView === 'chat' && activeHit >= 0 && (
          <ChatSearchPill
            position={activeHit + 1}
            total={Math.max(search.total ?? 0, search.results.length)}
            busy={jumping}
            canOlder={activeHit + 1 < search.results.length || search.hasMore}
            canNewer={activeHit > 0}
            onList={() => setSearchView('list')}
            onOlder={() => void openResult(activeHit + 1)}
            onNewer={() => void openResult(activeHit - 1)}
          />
        )}
        {!hasNewer && !showSearchList && !isSearchOpen && (() => {
          // Same control as DMs: up to the unread line until it has been seen,
          // then down to the newest, counting every line still below you.
          const up = !!unreadAnchor && !unreadMarkerSeen && unreadMarkerAbove;
          const below = unreadBelow;
          return (
            <UnreadJumpButton
              show={up || scrolledUp || below > 0}
              up={up}
              count={below}
              onClick={up ? jumpToUnreadMarker : jumpToNewest}
              className="absolute bottom-3 right-3 z-10"
            />
          );
        })()}
        {hasNewer && !showSearchList && (
          <button
            type="button"
            data-chat-latest
            onClick={() => void goToLatest()}
            className="absolute right-3 z-10 flex h-9 items-center gap-1.5 rounded-full bg-white pl-3 pr-2.5 text-xs font-semibold text-black shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            style={{ bottom: isSearchOpen ? '3.75rem' : '0.75rem' }}
          >
            {_copy('chatSearch.latest', { defaultValue: 'Latest' })}
            <ChevronsDown className="h-4 w-4" />
          </button>
        )}
        {loadingOlder && !showSearchList && (
          <div data-chat-loading-older className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 backdrop-blur">
              <Loader2 className="h-4 w-4 animate-spin text-white/80" />
            </span>
          </div>
        )}
      </div>
      </SharedTranslationContext.Provider>
      
      {/* Input Area */}
      <div className={isSearchOpen ? 'hidden' : 'relative'}>
        {pendingShareId && (!sharedLiveUrl || !selectedRoomId) && (
          <p role="status" className="px-4 py-2 text-sm text-zinc-400">{t('common.loading')}</p>
        )}
        <ChatInput
        voiceMaxDuration={29}
          onSendMessage={handleSendMessage}
          canSend={canSendPublic}
          allowDocuments={false}
          replyTo={replyTo}
          onCancelReply={handleCancelReply}
          draftKey={selectedRoomId ? `room:${selectedRoomId}` : null}
          incomingLink={selectedRoomId && selectedRoomId === rooms[0]?.id ? sharedLiveUrl : undefined}
          onIncomingLinkApplied={clearSharedLive}
        />
      </div>

      {/* Modals */}
      {deleteDialog}
      <CreateTopicRoomModal
        open={createRoomOpen}
        onOpenChange={setCreateRoomOpen}
        onCreated={handleRoomCreated}
      />
      <RoomSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        room={selectedRoom}
        onUpdated={refetchRooms}
      />
    </div>
  );
}
