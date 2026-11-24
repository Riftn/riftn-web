import { outsideImage } from '@/lib/outside-image';
import { FullscreenImageViewerLazy } from '@/components/app/cards/FullscreenImageViewerLazy';
import { useTranslation as _useCopy } from 'react-i18next';
import { formatCount } from '@/lib/format-count';
import { InPlaceEditField, editOnClick } from '@/components/app/chat/InPlaceEdit';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Live Post Chat Component
 * ========================
 * Displays a live chat feed below the stream on the single post page.
 * Uses the livechat_messages table with realtime subscriptions.
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { Loader2, RotateCcw, Pin, CornerDownRight, ArrowUp } from "lucide-react";
import { MessageMenu, type MessageMenuAction } from '@/components/app/chat/MessageMenu';
import { menuIcons, messageMenuMeta, keepBrowserMenu, useMenuPoint, MessageMoreButton, copyMediaWithToast } from '@/components/app/chat/message-menu-kit';
import { ReactionGlyph, RollingCount, useReactionHost } from '@/components/app/chat/ReactionArrival';
import { copyableMediaUrl } from '@/lib/copy-media';
import { ChatReactorsDrawer } from '@/components/app/chat/ChatReactorsDrawer';
import Eye from "@/components/ui/cut-icons/visibility";
import Languages from "@/components/ui/cut-icons/language";
import Pencil from "@/components/ui/cut-icons/edit";
import Trash2 from "@/components/ui/cut-icons/delete";
import Clock from "@/components/ui/cut-icons/clock";
import Ban from "@/components/ui/cut-icons/blocked";
import ShieldCheck from "@/components/ui/cut-icons/security";

import MessageSquare from "@/components/ui/cut-icons/messages";
import Mic from "@/components/ui/cut-icons/mic";
import X from "@/components/ui/cut-icons/close";

import { Textarea } from '@/components/ui/textarea';
import { StreamBotCommands } from './StreamBotCommands';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { useDraft } from '@/hooks/use-draft';
import { useLiveViewerActions } from '@/components/app/live/live-viewer-actions';
import { PointsIcon } from '@/components/app/live/points/PointsIcon';
import { GivePointsSheet, type GiveTarget } from '@/components/app/live/points/GivePointsSheet';
import { useQuery as useGivingQuery } from '@tanstack/react-query';
import { getStreamRewards } from '@/lib/api/dehub/live-rewards';
import { PointsButton } from '@/components/app/live/points/PointsButton';
import { StreamChatRewards } from '@/components/app/live/points/StreamChatRewards';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { replaceLinksWithEmoji, renderTextWithLinks } from '@/components/app/TranslatableText';
import { DehubLinkEmbeds, useDehubLinks } from '@/components/app/cards/DehubLinkEmbedsLazy';
import { stripDehubLinkMatches } from '@/lib/dehub-links';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';
import { useTranslation as useTextTranslation } from '@/components/app/TranslatableText';
import { useLiveChatMessages } from '@/hooks/use-livechat';
import { useStreamAudience } from '@/hooks/use-stream-audience';
import { useLiveAudience } from '@/hooks/use-live-audience';
import { LiveAudienceSheet } from '@/components/app/live/LiveAudienceSheet';
import { useAuth } from '@/contexts/AuthContext';
import { SendStatus } from '@/components/app/chat/SendStatus';
import '@/styles/tip-wall.css';
import '@/styles/live-chat-send.css';
import { flyChatLine, prefersReducedMotion, type FlyFrom } from '@/lib/live-chat-fly';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { getMediaUrl, getAuthToken, uploadLiveChatVoice } from '@/lib/api/dehub';
import { addStreamModerator, banFromStreams, pinLiveChatMessage, timeOutInStream, unpinLiveChatMessage, streamChatRoomId } from '@/lib/api/dehub/livechat';
import { VoiceRecorder } from '@/components/app/chat/VoiceRecorder';
import { VoiceWaveformPlayer } from '@/components/app/chat/VoiceWaveformPlayer';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseLiveChatMessage } from '@/hooks/use-livechat';
import { useStreamChatJoins } from '@/hooks/use-stream-chat-joins';
import { DhbAmount } from '@/components/app/DhbAmount';
import { useTranslation as useI18n } from 'react-i18next';
import { useHoldMenu } from '@/hooks/use-hold-menu';
import { ChatHoldSheet, isTouchHold, type ChatHoldAction } from '@/components/app/chat/ChatHoldSheet';
import { QUICK_CHAT_REACTIONS } from '@/components/app/chat/reaction-options';
import Reply from '@/components/ui/cut-icons/reply';
import Copy from '@/components/ui/cut-icons/copy';
import type { ChatCreatorBadge } from '@/lib/live/chat-badges';
import type { BadgeLock } from '@/lib/staking-badges';
import { useFocusChatMessage, chatMessageDomId } from '@/hooks/use-focus-chat-message';
import { canLinkMessage, copyChatMessageLink, copyLinkLabel, useLinkedMessage } from '@/lib/chat-message-link';
import { Link2 } from 'lucide-react';
import { dblClickReply } from '@/lib/dblclick-reply';

/** Avatar with cascading fallback: primary → CDN → initials */
function LiveChatAvatar({ src, address, name }: { src?: string | null; address?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);
  const cdnUrl = address ? buildAvatarCdnFallbackUrl(address, src ?? undefined) : undefined;
  const activeSrc = failed ? cdnUrl : (src ?? undefined);
  return (
    <Avatar className="w-6 h-6 rounded-md flex-shrink-0 mt-0.5">
      {activeSrc && !cdnFailed && (
        <AvatarImage
          src={activeSrc}
          className="rounded-md"
          onError={() => failed ? setCdnFailed(true) : setFailed(true)}
        />
      )}
      <AvatarFallback className="bg-zinc-700 text-white text-[10px] rounded-md">
        {name[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Badges earned from this stream's creator: their limited-time badges and the hype train badge. */
function CreatorBadges({ badges }: { badges?: ChatCreatorBadge[] }) {
  if (!badges?.length) return null;
  return (
    <span className="inline-flex shrink-0 items-baseline gap-0.5">
      {badges.map((b) => (
        <span key={b.id} title={b.name} aria-label={b.name} role="img" className="text-[0.9em] leading-none">
          {b.emoji}
        </span>
      ))}
    </span>
  );
}

/** Live chat badge */
function LiveChatBadge({ badgeBalance, badgeLock, username }: { badgeBalance?: number | null; badgeLock?: BadgeLock | null; username?: string | null }) {
  return <BadgeIcon badgeBalance={badgeBalance} badgeLock={badgeLock} username={username} className="w-[1em] h-[1em]" />;
}

/** What the hold menu needs to offer Translate / Show original for one line. */
interface TranslateHandle {
  isTranslated: boolean;
  toggle: () => void;
}

/**
 * A text line. No Translate button on it: Translate lives in the line's hold /
 * right-click menu, so the line only says what happened — translating, or
 * translated with the way back.
 */
function TranslatableChatMsg({ content, onHandle, onEditAt }: { content: string; onHandle: (handle: TranslateHandle | null) => void; onEditAt?: (caret: number | null) => void }) {
  const { t } = useI18n();
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslateLoading,
    error: translateError,
    isTooShort,
    handleTranslate,
    handleShowOriginal,
  } = useTextTranslation(content, 'chat');

  useEffect(() => {
    onHandle(isTooShort ? null : { isTranslated, toggle: isTranslated ? handleShowOriginal : handleTranslate });
  }, [onHandle, isTooShort, isTranslated, handleTranslate, handleShowOriginal]);
  useEffect(() => () => onHandle(null), [onHandle]);

  // Links to our own things (a community, a request, a page) show as cards
  // under the line, and the text drops the URL the card stands for.
  const { links, displayText } = useDehubLinks(content);
  const shownText = isTranslated ? stripDehubLinkMatches(translatedText, links) : displayText;

  return (
    <div>
      {shownText.trim() && (
        // Your own words edit in place: click into them and type.
        <p
          className={cn("text-sm text-zinc-300 break-words whitespace-pre-wrap", onEditAt && !isTranslated && "cursor-text")}
          onClick={onEditAt && !isTranslated ? editOnClick((caret) => onEditAt(shownText === content ? caret : null)) : undefined}
        >
          {renderTextWithLinks(shownText)}
        </p>
      )}
      {links.length > 0 && (
        <div data-live-chat-cards className="max-w-[320px]">
          <DehubLinkEmbeds links={links} compact />
        </div>
      )}
      {!isTooShort && (isTranslateLoading || isTranslated || translateError) && (
        <div className="flex items-center gap-1 mt-0.5">
          {isTranslateLoading ? (
            <Loader2 className="w-2.5 h-2.5 text-zinc-500 animate-spin" />
          ) : isTranslated ? (
            <button type="button" onClick={handleShowOriginal} className="flex min-h-8 items-center gap-1 text-xs text-zinc-300 hover:text-white transition-colors">
              <RotateCcw className="w-3 h-3" />
              {t('common.showOriginal')}
            </button>
          ) : null}
          {translateError && (
            <span className="text-zinc-500 text-[10px]">{translateError}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface LivePostChatProps {
  /**
   * The post's tokenId — what the stream's chat room is keyed on.
   *
   * It used to be whatever each caller happened to have: the post page passed
   * the tokenId, the broadcaster passed the stream's Mongo ObjectId, and the
   * two never matched. Nobody noticed, because the backend discarded the room
   * id and put every message in the platform's global room — so host and
   * viewers were in the same conversation by accident, along with everyone
   * else on Riftn. Now that rooms are real, both ends have to name the same
   * one, and the tokenId is the only id both callers have.
   */
  tokenId: string;
  /**
   * The stream's Mongo ObjectId — the id every /api/live/{id}/* route takes,
   * NOT the numeric tokenId above. Only used to resolve the audience figure in
   * the header; the chat itself is keyed by tokenId. Omit it and the header
   * simply carries no number.
   */
  streamId?: string;
  isOffline?: boolean;
  /** Whether the current user is the stream host (can pin messages) */
  isHost?: boolean;
  /**
   * Render over the video instead of inside a card.
   *
   * The broadcaster's phone layout is full-bleed — the camera IS the screen —
   * so a bordered slab with its own header sat on the picture like a sticker,
   * and its viewer count repeated the one already in the corner. Overlay mode
   * drops the chrome: no panel, no header, messages ride the shade that
   * darkens the foot of the screen, and the list masks out as it climbs so
   * old lines dissolve into the frame instead of meeting a hard edge.
   */
  overlay?: boolean;
}

/** The timeouts a creator or moderator can hand out from a chat line. */
const TIMEOUTS = [
  { seconds: 60, key: 'timeout1m' },
  { seconds: 600, key: 'timeout10m' },
  { seconds: 3600, key: 'timeout1h' },
] as const;

export function LivePostChat({ tokenId, streamId: liveStreamId, isOffline = false, isHost = false, overlay = false }: LivePostChatProps) {
  // A mention notification names the line that tagged the reader.
  useFocusChatMessage();
  const { t: _copy } = _useCopy();
  // A tapped photo opens full screen, with Download.
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  // Gift, share and the reaction thumb, when a full-bleed viewer is around
  // this chat. They share the composer's row — see live-viewer-actions.
  const viewerActions = useLiveViewerActions();
  const { t } = useI18n();
  const streamId = tokenId ? streamChatRoomId(tokenId) : '';
  // The card unmounts every time the post scrolls out of the feed, so without
  // this a line typed under a stream is gone the moment you look away.
  const [newMessage, setNewMessage] = useDraft(streamId ? `live:${streamId}` : null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The box grows with the message (up to 128px, like the other chat boxes)
  // so everything typed stays in view, and it eases to each new height
  // instead of jumping a line at a time. The words stay put while it grows:
  // the box is held at its old height scrolled to the caret, then eased up,
  // so its top edge glides over the lines above.
  const [replyTo, setReplyTo] = useState<SupabaseLiveChatMessage | null>(null);
  const boxHeightRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const before = el.offsetHeight;
    const keepScroll = el.scrollTop;
    const atEnd = el.selectionStart === el.value.length;
    el.style.transition = 'none';
    el.style.height = 'auto';
    const target = Math.min(el.scrollHeight + (el.offsetHeight - el.clientHeight), 128);
    if (boxHeightRef.current === null || Math.abs(before - target) < 1) {
      el.style.height = `${target}px`;
      el.scrollTop = atEnd ? el.scrollHeight : keepScroll;
      el.style.transition = '';
      boxHeightRef.current = target;
      return;
    }
    el.style.height = `${before}px`;
    el.scrollTop = atEnd ? el.scrollHeight : keepScroll;
    void el.offsetHeight;
    el.style.transition = '';
    el.style.height = `${target}px`;
    boxHeightRef.current = target;
  }, [newMessage, overlay, replyTo]);
  // While you type, the whole row is the message box: the viewer's buttons
  // slide away and the box widens into their space, then they slide back
  // when the keyboard goes. Focus counts, so the first letter moves nothing.
  const [boxFocused, setBoxFocused] = useState(false);
  const typing = boxFocused || newMessage.trim().length > 0;
  // The send key stays mounted while it folds away.
  const [keyLeaving, setKeyLeaving] = useState(false);
  const wasTypingRef = useRef(typing);
  useEffect(() => {
    if (wasTypingRef.current && !typing) {
      setKeyLeaving(true);
      const id = window.setTimeout(() => setKeyLeaving(false), 180);
      wasTypingRef.current = typing;
      return () => window.clearTimeout(id);
    }
    wasTypingRef.current = typing;
    setKeyLeaving(false);
    return undefined;
  }, [typing]);
  // The viewer's buttons' own width, so folding them eases from exactly there.
  const actionsRef = useRef<HTMLDivElement>(null);
  const [actionsWidth, setActionsWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = actionsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (el.offsetWidth > 0) setActionsWidth(el.offsetWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [overlay]);
  // Sending: your words fly from the box into their line in the chat.
  const rootRef = useRef<HTMLDivElement>(null);
  const pendingFlightRef = useRef<{ text: string; from: FlyFrom } | null>(null);
  const flownKeysRef = useRef<Set<string>>(new Set());
  const startedFlightsRef = useRef<Set<string>>(new Set());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();

  // Pinned message state — prefer server-side is_pinned, fallback to local
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [isPinning, setIsPinning] = useState(false);
  const [contextMenuMsg, setContextMenuMsg] = useState<SupabaseLiveChatMessage | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  // Same as a Requests comment: the words become the field, a pause saves.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaret, setEditCaret] = useState<number | null>(null);
  const stopEditing = useCallback(() => setEditingId(null), []);


  const mention = useMention({
    inputRef: textareaRef,
    onMentionInsert: (_user, newText) => setNewMessage(newText),
  });

  const { messages: chatMessages, isLoading, send, retrySend, discardSend, editMessage, deleteMessage, addReaction, removeReaction, isModerator, isBanned: bannedHere, mutedUntil, staff, isSuperModerator } = useLiveChatMessages(streamId);
  // The stream's creator and the moderators they appointed act on other people's lines.
  const canModerate = isHost || isModerator;
  // Platform moderators can only be timed out or banned by a super moderator.
  const canModerateSender = (address?: string | null) =>
    canModerate && !!address && (isSuperModerator || !staff.includes(address.toLowerCase()));
  // A stream timeout quiets this viewer here until it runs out, then lets go.
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const left = mutedUntil ? mutedUntil - Date.now() : 0;
    setMuted(left > 0);
    if (left <= 0) return;
    const id = setTimeout(() => setMuted(false), left);
    return () => clearTimeout(id);
  }, [mutedUntil]);
  // Joins and gifts, as the app's chat has always drawn them: a row with the
  // viewer's face and name, then what they did. They used to be a bare grey
  // line with no avatar, and gifts were not in the chat at all.
  const moments = useStreamChatJoins(liveStreamId, isOffline);
  const momentById = new Map(moments.map((m) => [`system:${m.id}`, m]));
  const messages: SupabaseLiveChatMessage[] = [
    ...chatMessages,
    ...moments.map((moment): SupabaseLiveChatMessage => ({
      id: `system:${moment.id}`, room_id: streamId, sender_address: moment.address || '',
      sender_username: moment.username || null, sender_display_name: null,
      sender_avatar_url: moment.avatarUrl || null,
      content: moment.type === 'gift'
        ? (moment.message || '')
        : moment.type === 'giftSub'
          ? t('liveHype.chat.giftedSubs', { count: moment.giftCount ?? 1 })
          : moment.type === 'reward'
            ? t('livePoints.chatRedeemed', { title: moment.rewardTitle || '' }) + (moment.message ? `: ${moment.message}` : '')
          : moment.type === 'pointsGift'
            ? t('livePoints.give.chatLine', { amount: formatCount(moment.pointsAmount ?? 0), name: moment.recipientName || '' })
          : t('live.chatJoined'),
      message_type: 'system', image_url: null, is_pinned: false, created_at: moment.timestamp,
    })),
  ].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  // The stream's real audience, shared with the host's broadcast console. This
  // slot used to hold `useLiveChatPresence`, which ignores the room it is given
  // and returns the number of people connected to the ONE global platform chat
  // — so a stream with nobody watching read "3" here beside a truthful "0" on
  // the host's own overlay. Null when the caller has no stream ObjectId to
  // resolve, and then nothing is drawn: no number beats a wrong one.
  const watching = useStreamAudience(liveStreamId, !isOffline);
  // Channel points giving: when the creator has it on, a viewer's name in the
  // chat is a button that opens the give sheet with that person filled in.
  const givingInfo = useGivingQuery({
    queryKey: ['live-rewards', liveStreamId],
    queryFn: () => getStreamRewards(liveStreamId!),
    enabled: !!liveStreamId && !isOffline && isAuthenticated,
    staleTime: 60_000,
  });
  const giving = givingInfo.data?.live && givingInfo.data.giving?.enabled ? givingInfo.data.giving : null;
  const givingCreator = givingInfo.data?.creator?.toLowerCase() || '';
  const [giveTarget, setGiveTarget] = useState<GiveTarget | null>(null);
  const canGiveTo = (address?: string | null) => {
    const a = (address || '').toLowerCase();
    return !!giving && !isHost && !!a && a !== (walletAddress || '').toLowerCase() && a !== givingCreator;
  };
  const showInlinePoints = overlay && !isHost && !isOffline && isAuthenticated && !!liveStreamId && !typing;
  // Lines already in the chat when it loaded sit still; anything after glides
  // in, and your own line or gift lands with its text softly glowing (no ring).
  const settledIdsRef = useRef<Set<string> | null>(null);
  if (settledIdsRef.current === null && !isLoading) settledIdsRef.current = new Set(messages.map((m) => m.id));
  const landClass = (msg: SupabaseLiveChatMessage) => {
    // Your line that is flying in from the box lands by the flight, not this.
    const key = msg.client_key;
    if (key && flownKeysRef.current.has(key)) return '';
    const flight = pendingFlightRef.current;
    if (key && flight && msg.send_state === 'sending' && isMine(msg) && (msg.content || '').trim() === flight.text) {
      flownKeysRef.current.add(key);
      return '';
    }
    const settled = settledIdsRef.current;
    if (!settled || settled.has(msg.id)) return '';
    return isMine(msg) ? ' dh-chat-land dh-sent-text-glow' : ' dh-chat-land';
  };
  // A line of yours marked to fly (landClass) takes off once it is drawn.
  useLayoutEffect(() => {
    const host = rootRef.current;
    const flight = pendingFlightRef.current;
    if (!host || !flight) return;
    const msg = chatMessages.find((m) => m.client_key && flownKeysRef.current.has(m.client_key) && !startedFlightsRef.current.has(m.client_key));
    if (!msg?.client_key) return;
    const row = messageRefs.current.get(msg.id);
    if (!row) return;
    startedFlightsRef.current.add(msg.client_key);
    pendingFlightRef.current = null;
    const words = row.querySelector(':scope > div > .flex-1 > .flex.items-baseline')?.nextElementSibling as HTMLElement | null;
    flyChatLine({ row, host, list: messagesContainerRef.current, from: flight.from, words, styleFrom: messagesContainerRef.current });
  }, [chatMessages]);
  // Tapping the count opens Who's here, the same sheet the phone live page
  // and the app open from their "N here" pill. Fetched only while open.
  const [audienceOpen, setAudienceOpen] = useState(false);
  const { data: audience, isLoading: audienceLoading } = useLiveAudience(liveStreamId, {
    open: audienceOpen,
    enabled: audienceOpen,
  });

  // Sync pinned message from server data
  useEffect(() => {
    const serverPinned = messages.find(m => m.is_pinned);
    if (serverPinned) setPinnedMessageId(serverPinned.id);
  }, [messages]);

  const pinnedMessage = messages.find(m => m.id === pinnedMessageId) ?? null;

  // Auto-scroll on new messages, except while a line is held: the busy room
  // kept scrolling the held line out from under the finger.
  const heldRef = useRef(false);
  useEffect(() => {
    if (heldRef.current) return;
    if (bottomRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Only the message list moves. scrollIntoView also scrolls every
          // box around the chat, clipped ones included: in the Shorts viewer
          // that slid the whole player up by most of a screen, and on the
          // live page it dragged the page down to the chat.
          const list = messagesContainerRef.current;
          list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
        });
      });
    }
  }, [messages.length]);

  // The right-click menu opens at the pointer, flipped left or up when it
  // would run past the window's edge.
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenuPlace, setContextMenuPlace] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = contextMenuRef.current;
    if (!contextMenuMsg || !el) { setContextMenuPlace(null); return; }
    const EDGE = 10;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = contextMenuPos.x + w + EDGE > vw ? contextMenuPos.x - w : contextMenuPos.x;
    let top = contextMenuPos.y + h + EDGE > vh && contextMenuPos.y - h - EDGE > 0 ? contextMenuPos.y - h : contextMenuPos.y;
    left = Math.max(EDGE, Math.min(left, vw - w - EDGE));
    top = Math.max(EDGE, Math.min(top, vh - h - EDGE));
    setContextMenuPlace({ left, top });
  }, [contextMenuMsg, contextMenuPos]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuMsg) return;
    const close = () => setContextMenuMsg(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenuMsg]);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = messageRefs.current.get(messageId);
    const list = messagesContainerRef.current;
    if (el && list) {
      // Centre the line inside the list without moving anything around it.
      const offset = el.getBoundingClientRect().top - list.getBoundingClientRect().top;
      list.scrollTo({ top: list.scrollTop + offset - (list.clientHeight - el.offsetHeight) / 2, behavior: 'smooth' });
      el.classList.add('bg-white/10');
      setTimeout(() => el.classList.remove('bg-white/10'), 1200);
    }
  }, []);

  // A copied message link to this stream's chat: light the line up. The chat
  // holds the newest 200 lines, so an older one says it is too far back.
  useLinkedMessage(
    tokenId ? `stream:${tokenId}` : null,
    !isLoading,
    (id) => chatMessages.some((m) => m.id === id),
    (id) => messageRefs.current.get(id) ?? null,
  );

  const handlePinMessage = useCallback(async (msg: SupabaseLiveChatMessage) => {
    setContextMenuMsg(null);
    setIsPinning(true);
    try {
      await pinLiveChatMessage(streamId, msg.id);
      setPinnedMessageId(msg.id);
    } catch {
      toast.error(_copy("copy.675c5fe95089", { defaultValue: "Failed to pin message" }));
    } finally {
      setIsPinning(false);
    }
  }, [streamId, _copy]);

  const handleUnpinMessage = useCallback(async () => {
    if (!pinnedMessageId) return;
    setIsPinning(true);
    try {
      await unpinLiveChatMessage(streamId, pinnedMessageId);
      setPinnedMessageId(null);
    } catch {
      toast.error(_copy("copy.3b69de078742", { defaultValue: "Failed to unpin message" }));
    } finally {
      setIsPinning(false);
    }
  }, [streamId, pinnedMessageId, _copy]);

  /** Your own line, whoever is hosting — the test the edit and delete controls hang off. */
  const isMine = useCallback(
    (msg: SupabaseLiveChatMessage) =>
      !!walletAddress && msg.sender_address?.toLowerCase() === walletAddress.toLowerCase(),
    [walletAddress]
  );

  const startEditing = useCallback((msg: SupabaseLiveChatMessage, caret: number | null = null) => {
    setContextMenuMsg(null);
    setEditCaret(caret);
    setEditingId(msg.id);
  }, []);

  const handleDeleteMessage = useCallback((msg: SupabaseLiveChatMessage) => {
    setContextMenuMsg(null);
    void deleteMessage(msg.id);
  }, [deleteMessage]);

  const moderate = useCallback(async (msg: SupabaseLiveChatMessage, act: () => Promise<unknown>, done: string) => {
    setContextMenuMsg(null);
    try {
      await act();
      toast.success(done);
    } catch {
      toast.error(t('liveChatModeration.failed'));
    }
  }, [t]);

  // Each text line's Translate / Show original, for its menu.
  const translateHandles = useRef(new Map<string, TranslateHandle>());
  const translateHandleFor = useMemo(() => {
    const cache = new Map<string, (handle: TranslateHandle | null) => void>();
    return (id: string) => {
      let fn = cache.get(id);
      if (!fn) {
        fn = (handle) => { if (handle) translateHandles.current.set(id, handle); else translateHandles.current.delete(id); };
        cache.set(id, fn);
      }
      return fn;
    };
  }, []);

  // Hold a line on a phone, or right-click it on desktop. Opens for anyone
  // when the line can be translated, for the host (pinning, moderation) and
  // for whoever wrote it (edit, delete). Otherwise the browser keeps its own.
  // On a phone a hold opens the hold sheet for ANY line, so anyone can react
  // and reply: it used to open only for the host, your own lines or a line in
  // another language, so for everyone else holding did nothing at all.
  const [held, setHeld] = useState<{ msg: SupabaseLiveChatMessage; el: HTMLElement } | null>(null);
  heldRef.current = !!held;
  // Right-click (or the "..." on hover) on a computer.
  const menuPoint = useMenuPoint();
  const [menuMsg, setMenuMsg] = useState<SupabaseLiveChatMessage | null>(null);
  useEffect(() => { setReplyTo(null); }, [streamId]);
  const messageHold = useHoldMenu((point, target) => {
    const row = target.closest<HTMLElement>('[data-live-msg]');
    const id = row?.getAttribute('data-live-msg');
    const msg = id ? messages.find((m) => m.id === id) : undefined;
    if (!msg || msg.message_type === 'system') return false;
    if (isTouchHold()) {
      if (editingId === msg.id || !row) return false;
      setHeld({ msg, el: row });
      return;
    }
    // A computer: the same message menu as Public Chat. Links and selected
    // text keep the browser's own menu.
    if (msg.client_key && msg.send_state === 'failed') return false;
    if (row && keepBrowserMenu(target, row)) return false;
    setContextMenuMsg(null);
    setMenuMsg(msg);
    menuPoint.openAt(point);
  });

  const handleVoiceRecordingComplete = useCallback(async (blob: Blob, _duration: number) => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    const toastId = 'livechat-voice-upload';
    toast.loading(_copy("copy.97a0afff525e", { defaultValue: "Uploading voice note..." }), { id: toastId });
    try {
      const { url, duration } = await uploadLiveChatVoice(blob);
      await send('', 'audio', undefined, undefined, url, duration);
      toast.success(_copy("copy.690c816e9745", { defaultValue: "Voice note sent!" }), { id: toastId });
    } catch (err: any) {
      console.error('[LiveChat] Voice upload failed:', err);
      toast.error(err?.message || _copy("copy.615d555f779c", { defaultValue: "Failed to send voice note" }), { id: toastId });
    }
  }, [isAuthenticated, openLoginModal, send, _copy]);

  const handleSend = async () => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    // Empty the box the moment the line goes into the chat. Waiting for the
    // server's echo left the sent words sitting in the box for as long as the
    // round trip took, which reads as a send that did nothing.
    const sent = newMessage;
    const answering = replyTo;
    const box = textareaRef.current;
    if (box && sent.trim() && !prefersReducedMotion()) {
      const r = box.getBoundingClientRect();
      const cs = getComputedStyle(box);
      pendingFlightRef.current = {
        text: sent.trim(),
        from: { x: r.left + parseFloat(cs.paddingLeft || '0'), y: Math.max(r.top, r.top + parseFloat(cs.paddingTop || '0') - box.scrollTop) },
      };
    }
    setNewMessage('');
    setReplyTo(null);
    try {
      await send(sent.trim(), 'text', undefined, answering?.id);
    } catch {
      // The line stays in the chat marked "Not sent" with Retry on it, and the
      // send has already said why — nothing goes back in the box.
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mention.isOpen) {
      const handled = mention.handleKeyDown(e);
      if (handled) {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const liveResults = (window as any).__mentionResults || [];
          if (liveResults[mention.selectedIndex]) {
            mention.handleSelect(liveResults[mention.selectedIndex]);
          }
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Your own line whose "who reacted" list is open.
  const [reactorsFor, setReactorsFor] = useState<string | null>(null);
  const canReply = isAuthenticated && !isOffline && !bannedHere && !muted;
  const heldMsg = held?.msg;
  const heldTranslate = heldMsg ? translateHandles.current.get(heldMsg.id) : undefined;
  const holdActions: ChatHoldAction[] = [];
  if (heldMsg) {
    if (canReply) holdActions.push({
      key: 'reply', prime: true, icon: <Reply />, label: _copy('copy.c253f451bdd5', { defaultValue: 'Reply' }),
      // Inside the tap, so the phone raises the keyboard.
      onSelect: () => { setReplyTo(heldMsg); textareaRef.current?.focus(); },
    });
    if (heldMsg.content?.trim() && (!heldMsg.message_type || heldMsg.message_type === 'text')) holdActions.push({
      key: 'copy', icon: <Copy />, label: _copy('chatHold.copy', { defaultValue: 'Copy' }),
      onSelect: () => {
        void navigator.clipboard?.writeText(heldMsg.content).then(
          () => toast.success(_copy('chatHold.copied', { defaultValue: 'Copied' })),
          () => undefined,
        );
      },
    });
    if (canLinkMessage(heldMsg.id)) holdActions.push({
      key: 'copy-link', icon: <Link2 />, label: copyLinkLabel(),
      onSelect: () => copyChatMessageLink({ kind: 'stream', tokenId }, heldMsg.id),
    });
    if (heldTranslate) holdActions.push(heldTranslate.isTranslated
      ? { key: 'original', icon: <RotateCcw />, label: _copy('chatHold.showOriginal', { defaultValue: 'Original' }), onSelect: () => heldTranslate.toggle() }
      : { key: 'translate', icon: <Languages />, label: _copy('chatHold.translate', { defaultValue: 'Translate' }), onSelect: () => heldTranslate.toggle() });
    if (isMine(heldMsg) && (!heldMsg.message_type || heldMsg.message_type === 'text')) holdActions.push({
      key: 'edit', icon: <Pencil />, label: _copy('copy.464c4ffd019e', { defaultValue: 'Edit' }), onSelect: () => startEditing(heldMsg),
    });
    if (isHost) holdActions.push({
      key: 'pin', icon: <Pin />,
      label: heldMsg.id === pinnedMessageId ? _copy('copy.ee3c71613054', { defaultValue: 'Unpin' }) : _copy('chatHold.pin', { defaultValue: 'Pin' }),
      onSelect: () => { if (heldMsg.id === pinnedMessageId) void handleUnpinMessage(); else void handlePinMessage(heldMsg); },
    });
    if (canModerateSender(heldMsg.sender_address) && !isMine(heldMsg)) holdActions.push({
      key: 'moderate', icon: <ShieldCheck />, label: t('liveChatModeration.title', 'Moderate'),
      // The full list (timeouts, ban, make moderator) is the existing menu,
      // opened where the line is once the sheet has gone.
      onSelect: () => {
        const box = held!.el.getBoundingClientRect();
        window.setTimeout(() => {
          setContextMenuPos({ x: Math.max(8, Math.min(box.left + 16, window.innerWidth - 220)), y: Math.max(8, Math.min(box.top, window.innerHeight - 320)) });
          setContextMenuMsg(heldMsg);
        }, 0);
      },
    });
    if (isMine(heldMsg) || canModerate) holdActions.push({
      key: 'delete', destructive: true, secondary: true, icon: <Trash2 />, label: _copy('copy.e2d0a54968ea', { defaultValue: 'Delete' }), onSelect: () => handleDeleteMessage(heldMsg),
    });
  }
  const viewer = walletAddress?.toLowerCase();
  const reactedBy = (msg: SupabaseLiveChatMessage) => viewer
    ? Object.entries(msg.reactions ?? {})
        .filter(([, addrs]) => addrs?.some((a) => a.toLowerCase() === viewer))
        .map(([emoji]) => emoji)
    : [];
  const toggleReaction = (msg: SupabaseLiveChatMessage, emoji: string) => {
    if (!isAuthenticated) return;
    if (reactedBy(msg).includes(emoji)) removeReaction(msg.id, emoji);
    else addReaction(msg.id, emoji);
  };

  // The right-click menu: quick reactions, who reacted, then the actions,
  // in the same order as Public Chat's.
  const menuActions: MessageMenuAction[] = [];
  if (menuMsg) {
    const textLine = !menuMsg.message_type || menuMsg.message_type === 'text';
    const mineLine = isMine(menuMsg);
    const menuTranslate = translateHandles.current.get(menuMsg.id);
    if (canReply) menuActions.push({ key: 'reply', icon: menuIcons.reply, label: _copy('copy.c253f451bdd5', { defaultValue: 'Reply' }), hint: 'R', onSelect: () => { setReplyTo(menuMsg); textareaRef.current?.focus(); } });
    if (mineLine && textLine && !menuMsg.send_state) menuActions.push({ key: 'edit', icon: menuIcons.edit, label: _copy('copy.464c4ffd019e', { defaultValue: 'Edit' }), hint: 'E', onSelect: () => startEditing(menuMsg) });
    if (isHost) menuActions.push({
      key: 'pin', hint: 'P',
      icon: menuMsg.id === pinnedMessageId ? menuIcons.unpin : menuIcons.pin,
      label: menuMsg.id === pinnedMessageId ? _copy('copy.ee3c71613054', { defaultValue: 'Unpin' }) : _copy('chatHold.pin', { defaultValue: 'Pin' }),
      onSelect: () => { if (menuMsg.id === pinnedMessageId) void handleUnpinMessage(); else void handlePinMessage(menuMsg); },
    });
    if (textLine && menuMsg.content?.trim()) menuActions.push({
      key: 'copy', icon: menuIcons.copy, label: _copy('msgMenu.copyText', { defaultValue: 'Copy Text' }), hint: 'C',
      onSelect: () => { void navigator.clipboard?.writeText(menuMsg.content).then(() => toast.success(_copy('chatHold.copied', { defaultValue: 'Copied' })), () => undefined); },
    });
    if (canLinkMessage(menuMsg.id)) menuActions.push({ key: 'copy-link', icon: menuIcons.link, label: copyLinkLabel(), hint: 'L', onSelect: () => copyChatMessageLink({ kind: 'stream', tokenId }, menuMsg.id) });
    const menuMedia = menuMsg.message_type === 'image' && menuMsg.image_url ? copyableMediaUrl(getMediaUrl(menuMsg.image_url) || menuMsg.image_url)
      : menuMsg.message_type === 'gif' && (menuMsg.image_url || menuMsg.content) ? copyableMediaUrl(outsideImage(menuMsg.image_url || menuMsg.content)) : null;
    if (menuMedia) menuActions.push({ key: 'copy-media', icon: menuIcons.copyMedia, label: _copy('msgMenu.copyMedia', { defaultValue: 'Copy Media' }), onSelect: () => copyMediaWithToast(menuMedia, menuMsg.message_type === 'gif' ? 'gif' : 'image', _copy) });
    if (menuTranslate) menuActions.push(menuTranslate.isTranslated
      ? { key: 'original', icon: menuIcons.translate, label: _copy('chatHold.showOriginal', { defaultValue: 'Original' }), onSelect: () => menuTranslate.toggle() }
      : { key: 'translate', icon: menuIcons.translate, label: _copy('chatHold.translate', { defaultValue: 'Translate' }), hint: 'T', onSelect: () => menuTranslate.toggle() });
    if (canModerateSender(menuMsg.sender_address) && !mineLine) menuActions.push({
      key: 'moderate', icon: menuIcons.ban, label: t('liveChatModeration.title', 'Moderate'),
      // Timeouts, ban and make moderator: the moderation list, where the menu was.
      onSelect: () => {
        const at = menuPoint.point;
        const msg = menuMsg;
        window.setTimeout(() => {
          setContextMenuPos(at ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 });
          setContextMenuMsg(msg);
        }, 0);
      },
    });
    if (mineLine || canModerate) menuActions.push({ key: 'delete', divided: true, destructive: true, icon: menuIcons.delete, label: _copy('copy.e2d0a54968ea', { defaultValue: 'Delete' }), onSelect: () => handleDeleteMessage(menuMsg) });
  }
  const lineMenu = menuPoint.mounted && menuMsg ? (
    <MessageMenu
      point={menuPoint.point}
      onClose={menuPoint.close}
      quickReactions={isAuthenticated ? QUICK_CHAT_REACTIONS : null}
      mine={reactedBy(menuMsg)}
      onReact={(emoji) => toggleReaction(menuMsg, emoji)}
      actions={menuActions}
      reactors={menuMsg.reactions ? { reactions: menuMsg.reactions, remoteMessageId: menuMsg.id } : null}
      meta={messageMenuMeta(menuMsg.created_at, menuMsg.is_edited)}
    />
  ) : null;

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative',
        overlay
          ? 'flex min-h-0 flex-1 flex-col justify-end'
          // mt-3 and the 2xl radius match the post page's bento rhythm: without
          // the margin this card butts straight onto the post above it and the
          // two glass surfaces read as one slab with a seam through them.
          : 'mt-3 rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3'
      )}
    >
      {/* Header — the overlay has none. The host already has the room's
          numbers over the picture, and a title bar is the panel this layout
          is trying not to be. */}
      <div className={cn('flex items-center justify-between mb-3', overlay && 'hidden')}>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-zinc-400" />
          <h3 className="font-semibold text-white text-sm">{_copy("copy.c4ea7311107b", { defaultValue: "Live Chat" })}</h3>
          {isOffline && (
            <span className="text-xs text-zinc-500 px-2 py-0.5 rounded-full bg-zinc-800">{_copy("copy.a1794783aab7", { defaultValue: "Offline" })}</span>
          )}
        </div>
        {/* The audience, not the platform. A bare people-icon-plus-number is
            exactly what the old global count looked like, so this one says
            what it is counting. */}
        <div className="flex items-center gap-2">
        {!isHost && !isOffline && <PointsButton streamId={liveStreamId} variant="chip" />}
        {watching !== null && (
          <button
            type="button"
            onClick={() => setAudienceOpen(true)}
            aria-label={t('liveAudience.whosHere', "Who's here")}
            data-filter-chip
            className="inline-flex shrink-0 items-center gap-1.5 pl-2.5 pr-2 py-[5px] rounded-lg text-xs font-medium bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all hover:border-white/50"
            title={_copy("copy.7c5784e7b79a", { defaultValue: "People watching this stream right now" })}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{_copy("copy.8fc2e70dbd8e", { defaultValue: "{{count}} watching", count: watching })}</span>
          </button>
        )}
        </div>
        {watching !== null && (
          <LiveAudienceSheet open={audienceOpen} onOpenChange={setAudienceOpen} audience={audience} loading={audienceLoading} />
        )}
      </div>

      {/* Pinned message banner (Telegram style) */}
      {pinnedMessage && (
        <button
          onClick={() => scrollToMessage(pinnedMessage.id)}
          data-keep-dark={overlay ? '' : undefined}
          className={cn(
            'w-full flex items-center gap-2 mb-2 px-3 py-2 border-l-2 border-blue-400 text-left transition-colors group',
            overlay
              ? 'rounded-xl bg-black/40 backdrop-blur-md hover:bg-black/50'
              : 'rounded-lg bg-white/[0.06] hover:bg-white/10'
          )}
        >
          <Pin className="w-3.5 h-3.5 text-blue-400 shrink-0 fill-current" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-blue-400 font-medium leading-none mb-0.5">{_copy("copy.2aa60e3c77ee", { defaultValue: "Pinned Message" })}</p>
            <p className="text-xs text-zinc-300 truncate">
              {pinnedMessage.content || (pinnedMessage.message_type === 'voice' ? _copy("copy.68981d194d79", { defaultValue: "🎤 Voice message" }) : _copy("copy.2bc85f36b3e4", { defaultValue: "📎 Media" }))}
            </p>
          </div>
          {isHost && (
            <button
              onClick={(e) => { e.stopPropagation(); handleUnpinMessage(); }}
              disabled={isPinning}
              className="shrink-0 text-zinc-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </button>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        // Scrolling the messages is not a swipe to the next short.
        data-shorts-scrollable
        // Over the picture the lines stay white with their shadow in every
        // theme; System Light turned them dark ink on the video.
        data-keep-dark={overlay ? '' : undefined}
        {...messageHold}
        className={cn(
          'chat-text-zone overflow-y-auto overscroll-contain scrollbar-hide',
          overlay
            // The mask lives on the scroller, so the dissolve stays pinned to
            // the top edge while messages travel under it. -webkit- kept for
            // the iOS Safari this layout exists for.
            ? 'min-h-0 flex-1 max-h-[42vh] space-y-0.5 mb-2 pr-1 [text-shadow:0_1px_3px_rgb(0_0_0/0.85)] [mask-image:linear-gradient(to_bottom,transparent,#000_3.5rem)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,#000_3.5rem)]'
            : 'h-64 space-y-1 mb-3'
        )}
      >
        <p className="py-1.5 px-1 text-xs text-zinc-300">{_copy("copy.4ff3e008d45e", { defaultValue: "Live started" })}</p>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.message_type === 'system') {
              const moment = momentById.get(msg.id);
              const who = msg.sender_username
                || (msg.sender_address ? `${msg.sender_address.slice(0, 6)}…${msg.sender_address.slice(-4)}` : _copy("copy.f541591bfa86", { defaultValue: "A viewer" }));
              const face = msg.sender_avatar_url ? buildAvatarUrl(msg.sender_address, msg.sender_avatar_url) : undefined;
              return (
                <div key={msg.id} className={`flex items-start gap-2 py-1 px-1 rounded-lg${landClass(msg)}`}>
                  <LiveChatAvatar src={face} address={msg.sender_address || undefined} name={who} />
                  <div className="flex-1 min-w-0 text-xs">
                    <span className="font-semibold text-white">{who}</span>
                    {moment?.type === 'gift' ? (
                      <>
                        <span className="text-zinc-400 ml-1.5">
                          {t('live.chatSentGift')}
                          <DhbAmount amount={moment.giftAmount} currency={moment.giftCurrency} iconClassName="h-3 w-3" className="ml-1" />
                        </span>
                        {msg.content && (
                          <p className="chat-body text-zinc-300 break-words whitespace-pre-wrap mt-0.5"><InlineEmoji value={msg.content} /></p>
                        )}
                      </>
                    ) : moment?.type === 'pointsGift' ? (
                      <span className="text-zinc-400 ml-1.5 inline-flex items-center gap-1 align-middle" data-points-gift-line>
                        <PointsIcon className="h-3 w-3" />
                        {msg.content}
                      </span>
                    ) : moment?.type === 'reward' ? (
                      <>
                        <span className="text-zinc-400 ml-1.5 inline-flex items-center gap-1 align-middle">
                          <PointsIcon className="h-3 w-3" />
                          {t('livePoints.chatRedeemedShort')}
                          <span className="font-semibold text-white">{moment.rewardTitle}</span>
                        </span>
                        {moment.message && (
                          <p className="chat-body text-zinc-300 break-words whitespace-pre-wrap mt-0.5">{moment.message}</p>
                        )}
                      </>
                    ) : (
                      <span className="text-zinc-400 ml-1.5"><InlineEmoji value={msg.content} /></span>
                    )}
                  </div>
                </div>
              );
            }
            const avatarUrl = msg.sender_avatar_url
              ? buildAvatarUrl(msg.sender_address, msg.sender_avatar_url)
              : undefined;
            const displayName = msg.sender_display_name || msg.sender_username || msg.sender_address.slice(0, 8);
            const isPinned = msg.id === pinnedMessageId;

            return (
              <div
                key={msg.client_key ?? msg.id}
                id={chatMessageDomId(msg.id)}
                ref={(el) => { if (el) messageRefs.current.set(msg.id, el); else messageRefs.current.delete(msg.id); }}
                data-live-msg={msg.id}
                onDoubleClick={(e) => dblClickReply(e, canReply && editingId !== msg.id && (() => { setReplyTo(msg); textareaRef.current?.focus(); }))}
                data-chat-row
                className={`group py-1.5 px-1 rounded-lg transition-colors duration-700 ${isPinned ? 'bg-blue-400/5 border-l-2 border-blue-400/50 pl-2' : ''}${landClass(msg)}`}
              >
                <div className="flex items-start gap-2">
                  <LiveChatAvatar src={avatarUrl} address={msg.sender_address} name={displayName} />
                  <div className="flex-1 min-w-0">
                    {msg.reply_to && (
                      <button
                        type="button"
                        onClick={() => scrollToMessage(msg.reply_to!.id)}
                        className="mb-0.5 flex max-w-full items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                      >
                        <CornerDownRight className="h-3 w-3 shrink-0" />
                        <span className="shrink-0 font-semibold">{msg.reply_to.sender_name}</span>
                        <span className="truncate">{msg.reply_to.content}</span>
                      </button>
                    )}
                    <div className="flex items-baseline gap-1.5">
                      <span className="relative inline-flex items-baseline gap-1 shrink min-w-0 pr-3">
                        {canGiveTo(msg.sender_address) ? (
                          <button
                            type="button"
                            data-give-points-name
                            onClick={() => setGiveTarget({ to: msg.sender_username || msg.sender_address, name: displayName })}
                            title={t('livePoints.give.titleTo', { name: displayName })}
                            className="text-xs font-semibold text-white truncate max-w-[120px] hover:underline"
                          >
                            {displayName}
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                            {displayName}
                          </span>
                        )}
                        <LiveChatBadge badgeBalance={msg.sender_badge_balance} badgeLock={msg.sender_badge_lock} username={msg.sender_username} />
                        <CreatorBadges badges={msg.sender_creator_badges} />
                      </span>
                      {isPinned && <Pin className="w-2.5 h-2.5 text-blue-400 fill-current shrink-0" />}
                    </div>
                    {editingId === msg.id ? (
                      <InPlaceEditField
                        draftKey={`chat:edit:${msg.id}`}
                        text={msg.content || ''}
                        caret={editCaret}
                        onSave={(next) => editMessage(msg.id, next)}
                        onDone={stopEditing}
                        maxLength={500}
                        className="text-sm text-zinc-300 whitespace-pre-wrap"
                      />
                    ) : (msg.message_type === 'audio' || msg.message_type === 'voice') && (msg.audio_url || msg.image_url) ? (
                      <div className="mt-1">
                        <VoiceWaveformPlayer src={msg.audio_url || msg.image_url || ''} />
                      </div>
                    ) : msg.message_type === 'image' && msg.image_url ? (
                      <img src={getMediaUrl(msg.image_url)} alt="" className="max-w-full max-h-24 rounded mt-0.5 cursor-zoom-in" onClick={() => setViewingImage(getMediaUrl(msg.image_url) || msg.image_url)} />
                    ) : msg.message_type === 'gif' && (msg.image_url || msg.content) ? (
                      <img src={outsideImage(msg.image_url || msg.content)} alt="GIF" className="max-w-full max-h-20 rounded mt-0.5" />
                    ) : (
                      <TranslatableChatMsg
                        content={msg.content}
                        onHandle={translateHandleFor(msg.id)}
                        onEditAt={isMine(msg) && !msg.send_state && !msg.id.startsWith('temp-') ? (caret) => startEditing(msg, caret) : undefined}
                      />
                    )}
                    <span className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1.5">
                      {format(new Date(msg.created_at), 'HH:mm')}
                      {msg.client_key && (
                        <SendStatus
                          state={msg.send_state}
                          onRetry={() => retrySend(msg.client_key!)}
                          onDiscard={() => discardSend(msg.client_key!)}
                        />
                      )}
                    </span>
                    <StreamReactionChips
                      messageId={msg.id}
                      reactions={msg.reactions}
                      viewer={viewer}
                      onChip={(emoji) => (isMine(msg) ? setReactorsFor(msg.id) : toggleReaction(msg, emoji))}
                      overVideo={overlay}
                    />
                  </div>
                  {/* One "..." on hover: every action lives in the message menu, as in Public Chat. */}
                  {editingId !== msg.id && !(msg.client_key && msg.send_state === 'failed') && (
                    <MessageMoreButton
                      className="mt-0.5"
                      onOpen={(point) => { setContextMenuMsg(null); setMenuMsg(msg); menuPoint.openAt(point); }}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {!!liveStreamId && !isOffline && <StreamChatRewards streamId={liveStreamId} />}

      {lineMenu}

      {/* Moderate: timeouts, ban and make moderator, opened from the message
          menu or the hold sheet. Portalled: the chat often sits inside a
          blurred or transformed panel, which turns `fixed` into "fixed to
          that panel" and threw the menu off screen. */}
      {contextMenuMsg && canModerateSender(contextMenuMsg.sender_address) && !isMine(contextMenuMsg) && contextMenuMsg.message_type !== 'system' && contextMenuMsg.sender_address && createPortal(
        <div
          ref={contextMenuRef}
          data-glass-menu
          className="fixed z-50 bg-zinc-800 border border-white/10 rounded-xl shadow-2xl py-1 min-w-[140px]"
          style={{ top: contextMenuPlace?.top ?? contextMenuPos.y, left: contextMenuPlace?.left ?? contextMenuPos.x, visibility: contextMenuPlace ? undefined : 'hidden' }}
          onClick={(e) => e.stopPropagation()}
        >
          <>
              {TIMEOUTS.map(({ seconds, key }) => (
                <button
                  key={key}
                  onClick={() => moderate(contextMenuMsg, () => timeOutInStream(tokenId, contextMenuMsg.sender_address, seconds), t('liveChatModeration.timedOut'))}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                >
                  <Clock className="w-3.5 h-3.5" />{t(`liveChatModeration.${key}`)}
                </button>
              ))}
              <button
                onClick={() => moderate(contextMenuMsg, () => banFromStreams(tokenId, contextMenuMsg.sender_address), t('liveChatModeration.banned'))}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors"
              >
                <Ban className="w-3.5 h-3.5" />{t('liveChatModeration.ban')}
              </button>
              {isHost && (
                <button
                  onClick={() => moderate(contextMenuMsg, () => addStreamModerator(contextMenuMsg.sender_address), t('liveChatModeration.madeModerator'))}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />{t('liveChatModeration.makeModerator')}
                </button>
              )}
          </>
        </div>,
        document.body,
      )}

      {reactorsFor && (
        <ChatReactorsDrawer
          messageId={reactorsFor}
          reactions={chatMessages.find((m) => m.id === reactorsFor)?.reactions}
          onClose={() => setReactorsFor(null)}
        />
      )}

      <ChatHoldSheet
        open={!!held}
        onOpenChange={(open) => { if (!open) setHeld(null); }}
        anchor={held?.el ?? null}
        quickReactions={isAuthenticated ? QUICK_CHAT_REACTIONS.slice(0, 6) : null}
        mine={heldMsg ? reactedBy(heldMsg) : []}
        onReact={(emoji) => { if (heldMsg) toggleReaction(heldMsg, emoji); }}
        actions={holdActions}
        scrollActions
        reactors={heldMsg?.reactions ? { reactions: heldMsg.reactions, remoteMessageId: heldMsg.id } : null}
        meta={heldMsg ? messageMenuMeta(heldMsg.created_at, heldMsg.is_edited) ?? undefined : undefined}
      />

      {/* Input */}
      <div className={overlay ? '' : 'pt-2'}>
        {!isOffline && (
          <StreamBotCommands
            tokenId={tokenId}
            overlay={overlay}
            disabled={bannedHere || muted}
            onSend={(command) => {
              if (!isAuthenticated) {
                openLoginModal();
                return;
              }
              send(command, 'text').catch(() => {});
            }}
          />
        )}
        {/* One row at the foot of the screen. Tapping the box turns the whole
            row into it: the viewer's buttons fold into the box's end, where
            the send key comes up, and fold back out when the keyboard goes
            with nothing left to send. A reply sits inside the box, on top of
            what you type. Nothing is ever on this row that the viewer is not
            about to use. */}
        <div className="flex items-end gap-2">
        <div className="relative flex-1 min-w-0">

          {replyTo && (
            <div
              data-keep-dark={overlay ? '' : undefined}
              data-live-reply-quote
              className={cn('live-reply-quote absolute left-3 top-2 z-[1] flex items-center gap-1.5 border-l-2 pl-2 text-[11px] leading-tight', overlay ? 'right-12 border-white' : 'right-12 border-current')}
            >
              <div className="min-w-0 flex-1 truncate">
                <span className={cn('font-semibold', overlay ? 'text-white' : 'text-foreground')}>
                  {t('features.replyingTo', { defaultValue: 'Replying to {{name}}', name: replyTo.sender_display_name || replyTo.sender_username || replyTo.sender_address.slice(0, 8) })}
                </span>
                <span className={cn('ml-1.5', overlay ? 'text-white/70' : 'text-muted-foreground')}>{(!replyTo.message_type || replyTo.message_type === 'text') && replyTo.content ? replyTo.content : _copy('copy.d357175cfe89', { defaultValue: 'Media' })}</span>
              </div>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setReplyTo(null)}
                aria-label={_copy('copy.19766ed6ccb2', { defaultValue: 'Cancel' })}
                className={cn('shrink-0 p-0.5', overlay ? 'text-white/70 hover:text-white' : 'text-muted-foreground hover:text-foreground')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => {
              const cursorPos = e.target.selectionStart;
              const val = e.target.value;
              setNewMessage(val);
              mention.handleInput(val, cursorPos ?? undefined);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setBoxFocused(true)}
            onBlur={() => setBoxFocused(false)}
            placeholder={isOffline ? _copy("copy.17529a437b97", { defaultValue: "Chat is offline" }) : bannedHere ? t('liveChatModeration.youAreBanned') : muted ? t('liveChatModeration.youAreTimedOut') : replyTo ? t('stories.replyTo', { defaultValue: 'Reply to {{name}}', name: replyTo.sender_display_name || replyTo.sender_username || replyTo.sender_address.slice(0, 8) }) : _copy("copy.69518e684f06", { defaultValue: "Type a message..." })}
            disabled={isOffline || !isAuthenticated || bannedHere || muted}
            data-live-chat-box
            className={cn(
              'live-chat-box chat-text-input max-h-32 resize-none text-white text-sm scrollbar-hide',
              overlay ? (typing ? 'pr-14' : showInlinePoints ? 'pr-20' : 'pr-4') : 'pr-14',
              replyTo && '!pt-9',
              overlay
                ? 'min-h-[46px] rounded-xl border-white/15 bg-black/40 py-3 pl-4 backdrop-blur-md placeholder:text-white/50'
                : 'min-h-[46px] rounded-xl border-white/10 bg-white/5 py-3 placeholder:text-zinc-500'
            )}
            rows={1}
          />
          <UserMentionDropdown
            query={mention.query}
            isOpen={mention.isOpen}
            position={mention.position}
            armed={mention.armed}
            selectedIndex={mention.selectedIndex}
            onSelectedIndexChange={mention.setSelectedIndex}
            onSelect={mention.handleSelect}
            onClose={mention.handleClose}
          />
          <div className={cn('absolute right-2 flex items-center gap-1', overlay ? 'bottom-[7px]' : 'bottom-[7px]')}>
            {/* No voice notes over a broadcast. The row is the stream's and
                it is already three buttons and a message box wide; holding
                a mic down to talk over someone else talking is not what
                anyone is doing here. The panel keeps it, until you start
                typing: then it folds into the send key. */}
            {!overlay && !typing && (
              <div className="live-fold-in">
                <VoiceRecorder
                  onRecordingComplete={handleVoiceRecordingComplete}
                  disabled={isOffline || !isAuthenticated || bannedHere || muted}
                />
              </div>
            )}
            {/* Channel points, at the end of the empty box: the viewer's
                balance with this creator, and the rewards behind it. */}
            {showInlinePoints && <PointsButton streamId={liveStreamId} variant="inline" />}
            {(typing || keyLeaving) && (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={handleSend}
                disabled={!typing || !newMessage.trim() || isOffline}
                aria-label={t('tip.send', { defaultValue: 'Send' })}
                data-keep-dark={overlay ? '' : undefined}
                data-state={newMessage.trim() ? 'on' : 'off'}
                data-enter=""
                data-leaving={typing ? undefined : ''}
                className="live-send-key"
              >
                <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
        {overlay && viewerActions ? (
          // No padding of its own: the row is `items-end` and the buttons are
          // the box's height, so anything here lifts them off its baseline.
          // While typing they fold into the box (width to 0, sliding into
          // its end) and are out of reach until they unfold.
          <div
            className="live-row-actions shrink-0"
            data-folded={typing ? '' : undefined}
            aria-hidden={typing || undefined}
            {...(typing ? { inert: '' } : {})}
            style={{ maxWidth: typing ? 0 : (actionsWidth ?? undefined) }}
          >
            <div ref={actionsRef}>{viewerActions}</div>
          </div>
        ) : null}
        </div>
      </div>
      <FullscreenImageViewerLazy
        images={viewingImage ? [viewingImage] : []}
        initialIndex={0}
        isOpen={!!viewingImage}
        onClose={() => setViewingImage(null)}
        downloadable
      />
      {giving && liveStreamId && (
        <GivePointsSheet
          open={!!giveTarget}
          onOpenChange={(open) => { if (!open) setGiveTarget(null); }}
          streamId={liveStreamId}
          dailyCap={giving.dailyCap}
          target={giveTarget}
        />
      )}
    </div>
  );
}

/**
 * A line's reactions, played in as they land (Fly, Pop or Burst from
 * Settings), the same moving emoji and rolling count as Public Chat.
 */
function StreamReactionChips({ messageId, reactions, viewer, onChip, overVideo }: {
  messageId: string;
  /** Drawn over the picture: chips keep their dark glass and white count in every theme. */
  overVideo?: boolean;
  reactions?: Record<string, string[]>;
  viewer?: string;
  onChip: (emoji: string) => void;
}) {
  useReactionHost(messageId);
  const entries = Object.entries(reactions ?? {}).filter(([, a]) => a?.length);
  if (!entries.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([emoji, addrs]) => {
        const mine = !!viewer && addrs.some((a) => a.toLowerCase() === viewer);
        return (
          <button
            key={emoji}
            type="button"
            data-chat-reaction-chip
            data-keep-dark={overVideo ? '' : undefined}
            onClick={() => onChip(emoji)}
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] leading-none text-white',
              // bg-black/20: light tone keeps the count dark (bg-black/30 up is read as a photo overlay there and forced white).
              mine ? 'bg-sky-400/25 ring-1 ring-sky-400/60' : 'bg-black/20 ring-1 ring-white/10',
            )}
          >
            <ReactionGlyph messageId={messageId} emoji={emoji} addresses={addrs} me={viewer} className="h-3.5 m-0" />
            {addrs.length > 1 && <RollingCount value={addrs.length} className="tabular-nums" />}
          </button>
        );
      })}
    </div>
  );
}
