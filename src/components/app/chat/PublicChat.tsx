import { useTranslation as _useCopy } from 'react-i18next';
import { useDraftState } from "@/hooks/use-draft-state";
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
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
import { RoomSettingsModal } from './RoomSettingsModal';
import { useLiveChatRooms, useLiveChatMessages, useLiveChatRoomDetails, useLiveChatPresence, type SupabaseLiveChatMessage } from '@/hooks/use-livechat';
import { getMediaUrl, banLiveChatUser, unbanLiveChatUser, uploadChatImage, uploadLiveChatVoice, type LiveChatRoom } from '@/lib/api/dehub';
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
import { useStickToBottom } from '@/hooks/use-stick-to-bottom';
import { ChatSearchBar, ChatSearchPanel, ChatSearchPill, rememberChatSearch, useChatSearch, type ChatSearchPerson } from './ChatSearch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PublicChatProps {
  onBack: () => void;
  /** Shown inside another page (the Riftn community's Chat tab): no back button. */
  embedded?: boolean;
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
const CHAT_PAGE_SIZE = 20;
/** How close to the top (px) the next older page is fetched. */
const LOAD_OLDER_AT = 240;

export function PublicChat({ onBack, embedded = false }: PublicChatProps) {
  // A mention notification names the line that tagged the reader.
  useFocusChatMessage();
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();

  // Signed out, the room reads but does not write. Anything that would write
  // opens the sign-in sheet, and signing in lands back here in this room.
  const promptSignIn = useCallback(() => {
    openLoginModal({ path: '/chat?chat=public' });
  }, [openLoginModal]);

  // Search: one box for words and people. `list` shows what it found, `chat`
  // shows the room on the result that was opened.
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchPerson, setSearchPerson] = useState<ChatSearchPerson | null>(null);
  const [searchView, setSearchView] = useState<'list' | 'chat'>('list');
  const [activeHit, setActiveHit] = useState(-1);
  const [jumping, setJumping] = useState(false);

  // Reply state

  // Translation state
  const [translateSignal, setTranslateSignal] = useState(0);
  const [originalSignal, setOriginalSignal] = useState(0);
  const [isAllTranslated, setIsAllTranslated] = useState(false);

  // Fetch rooms, use the first available room
  const { rooms, isLoading: roomsLoading, error: roomsError, refetch: refetchRooms } = useLiveChatRooms();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useDraftState<Message | null>(selectedRoomId ? `room:${selectedRoomId}:reply` : null, null);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auto-select the first room once loaded
  useEffect(() => {
    if (rooms.length > 0 && !selectedRoomId) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  const {
    messages: apiMessages, isLoading: messagesLoading, isBanned,
    send, retrySend, discardSend, addReaction, removeReaction, editMessage, deleteMessage, refetch,
    hasOlder, loadingOlder, loadOlder, signInWall,
    hasNewer, jumpTo, loadNewer, backToLatest,
  } = useLiveChatMessages(selectedRoomId, { pageSize: CHAT_PAGE_SIZE });
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

  // Convert API messages to local format
  const messages: Message[] = apiMessages.map(toLocalMessage);

  // Assistant replies are ordinary chat messages now — they arrive over the
  // socket like everyone else's and only differ in how they are rendered. The
  // local engine below is a fallback for deployments where the API side is not
  // live yet; it stands itself down as soon as a real one arrives.
  useAssistantReplyEngine(apiMessages);
  const localAssistantReplies = useAssistantReplies();

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

    return [...messages, ...buyAlertMessages, ...(hasNewer ? [] : localAssistantMessages)].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }, [messages, buyAlerts, localAssistantReplies, hasNewer]);

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
  const handleDeleteMessage = useCallback((messageId: string) => {
    void deleteMessage(messageId);
  }, [deleteMessage]);

  const handleEditMessage = useCallback((messageId: string, content: string) => {
    void editMessage(messageId, content);
  }, [editMessage]);

  // Merge list-level room data with the richer single-room details
  const enrichedRoom = roomDetails || selectedRoom;
  const isLoading = roomsLoading || (messagesLoading && apiMessages.length === 0);
  const roomName = t('publicChat.title');
  const roomDescription = t('publicChat.allThingsDeHub');

  const handleRoomCreated = useCallback((room: LiveChatRoom) => {
    refetchRooms();
    setSelectedRoomId(room.id);
  }, [refetchRooms]);

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
            {roomDescription ? (
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
        
        <div className="flex shrink-0 items-center gap-2">
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
      </div>
      )}

      {/* Messages Area */}
      <SharedTranslationContext.Provider value={{ translateSignal, originalSignal, requestTranslate: () => setTranslateSignal(s => s + 1), requestOriginal: () => setOriginalSignal(s => s + 1) }}>
      <div className="relative flex-1">
        <div
          ref={scrollContainerRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            const fromEnd = el.scrollHeight - el.clientHeight - el.scrollTop;
            // In old history the end of the list is not the newest line yet.
            followLatest.current = !hasNewer && fromEnd < 120;
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
            {filteredMessages.map((message) => (
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
                onBan={handleBanUser}
                onUnban={handleUnbanUser}
                onDelete={handleDeleteMessage}
                onEdit={handleEditMessage}
                onReact={isAuthenticated ? addReaction : promptSignIn}
                onRemoveReaction={removeReaction}
                onReply={isAuthenticated ? handleReply : undefined}
                onRetrySend={retrySend}
                onDiscardSend={discardSend}
                onSeeMessages={handleSeeMessages}
                holdFrame
                replying={!!replyTo && replyTo.id === message.id}
              />
              )
            ))}
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
        <ChatInput
        voiceMaxDuration={29}
          onSendMessage={handleSendMessage}
          canSend={canSendPublic}
          allowDocuments={false}
          replyTo={replyTo}
          onCancelReply={handleCancelReply}
          draftKey={selectedRoomId ? `room:${selectedRoomId}` : null}
        />
      </div>

      {/* Modals */}
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
