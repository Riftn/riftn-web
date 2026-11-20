import { outsideImage } from '@/lib/outside-image';
import { useTranslation as _useCopy } from 'react-i18next';
import { useHoldBottomNav } from '@/lib/bottom-nav-hold';
import { useSwipeReply } from '@/hooks/use-swipe-reply';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { useDraftState } from '@/hooks/use-draft-state';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Community Chat
 * ===============
 * Full chat UI for community members. Matches SidebarChat style exactly.
 * Supports text, emoji, GIF, replies, and reactions.
 *
 * Moderation state (pinning, delete rights, mutes, slow mode, media rights) is
 * derived from useCommunityAbilities — a mirror of the server's rules, so every
 * control the database would refuse simply does not render. The server stays
 * the authority: nothing here is a security boundary.
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, Fragment, useContext } from 'react';
import { UnreadMarker, UnreadJumpButton } from '../chat/UnreadJump';
import type { UnreadAnchor } from '@/lib/chat-unread-anchor';
import { anchorFromReadSpot, newestLineOnScreen } from '@/lib/chat-read-position';
import { useChatReadPosition } from '@/hooks/use-chat-read-position';
import { countLinesBelow, glideToBottom } from '@/lib/chat-lines-below';
import { roomChatId } from '@/lib/api/dehub/chat-prefs';
import { holderGateOf, runHolderCheck } from '@/hooks/use-holder-gate';
import { useQueryClient } from '@tanstack/react-query';
import { markCommunityChatSeen, COMMUNITY_CHAT_SEEN_INTERVAL_MS } from '@/lib/community-chat-notify';
import { useRoomChatReading } from '@/hooks/use-room-chat-summaries';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';
import { Loader2, SmilePlus, CornerDownRight, LogIn, Pin, PinOff, ImagePlus } from "lucide-react";
import Reply from "@/components/ui/cut-icons/reply";
import Pencil from "@/components/ui/cut-icons/edit";
import Check from "@/components/ui/cut-icons/check";
import Trash2 from "@/components/ui/cut-icons/delete";
import MicOff from "@/components/ui/cut-icons/mic-off";
import Megaphone from "@/components/ui/cut-icons/advertising";
import { communityKindOf } from "@/lib/community-kinds";
import { GroupCallButtons } from "@/components/app/chat/calls/GroupCallButtons";
import Ban from "@/components/ui/cut-icons/blocked";

import Send from "@/components/ui/cut-icons/send";
import X from "@/components/ui/cut-icons/close";
import MessageSquare from "@/components/ui/cut-icons/messages";
import Search from "@/components/ui/cut-icons/search";

import { VoiceRecorder } from '../chat/VoiceRecorder';
import { voiceRecordingFile } from '@/lib/voice-recording';
import { VoiceWaveformPlayer } from '../chat/VoiceWaveformPlayer';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken, uploadChatImage } from '@/lib/api/dehub';
import { PUBLIC_CHAT_IMAGE_TYPES, PUBLIC_CHAT_IMAGE_MAX_SIZE } from '@/lib/public-chat-media';
import { toast } from 'sonner';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChatTextSizeButton } from '@/components/app/chat/ChatTextSizeButton';
import { ChatSearchBar, ChatSearchPanel, ChatSearchPill, rememberChatSearch, useChatSearch, type ChatSearchPerson, type ChatSearchSource } from '@/components/app/chat/ChatSearch';
import { searchCommunityChat } from '@/lib/community-chat-search';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { AppState } from '@/components/app/AppState';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiGifPicker } from '../chat/EmojiGifPicker';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { useCommunityChat, type CommunityChatMessage } from '@/hooks/use-community-chat';
import { DehubLinkEmbeds, useDehubLinks } from '@/components/app/cards/DehubLinkEmbedsLazy';
import { useCommunityAbilities } from '@/hooks/use-community-admin';
import type { Community, CommunityMember } from '@/hooks/use-communities';
import { DeleteMessageDialog, type DeleteScope } from '@/components/app/chat/DeleteMessageDialog';
import { MemberActionsDialog } from './manage/MemberActionsDialog';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { replaceLinksWithEmoji, TranslatableText, SharedTranslationContext } from '../TranslatableText';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MarkdownText } from '@/lib/markdown';
import { ASSISTANT_AVATAR as assistantAvatar } from '@/lib/assistant';
import Sparkles from "@/components/ui/cut-icons/assistant";




import { QUICK_CHAT_REACTIONS } from '@/components/app/chat/reaction-options';
import { MoreReactionsButton } from '@/components/app/chat/MoreReactionsButton';
import { ChatHoldSheet, isTouchHold, type ChatHoldAction } from '@/components/app/chat/ChatHoldSheet';
import { MessageMenu, type MessageMenuAction } from '@/components/app/chat/MessageMenu';
import { menuIcons, messageMenuMeta, keepBrowserMenu } from '@/components/app/chat/message-menu-kit';
import { useHoldMenu } from '@/hooks/use-hold-menu';
import { canLinkMessage, copyChatMessageLink, copyLinkLabel, useLinkedMessage } from '@/lib/chat-message-link';

/** "Forever" mutes are stored as a date far in the future rather than as null. */
const FOREVER_YEAR = 9000;

/**
 * A text message with its Riftn links carded. A shared community or invite
 * leads and the words follow, matching the DM bubble and the app; before this
 * the channel printed an invite as a lone 🔗 with nothing behind it.
 */
/** Phone: drag a line left to reply to it, like Public Chat and DMs. */
function SwipeReplyRow({ onReply, children }: { onReply?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useSwipeReply(ref, onReply);
  return <div ref={ref}>{children}</div>;
}

function CommunityMessageBody({ content }: { content: string }) {
  const { links, displayText } = useDehubLinks(content);
  return (
    <>
      {links.length > 0 && (
        <div className="w-[288px] max-w-full mb-1 [&>*:first-child]:!mt-1">
          <DehubLinkEmbeds links={links} compact />
        </div>
      )}
      {displayText.trim() && (
        <TranslatableText text={displayText} className="chat-body text-xs text-zinc-300 break-words" as="p" />
      )}
    </>
  );
}

/** mm:ss once we are past a minute, plain seconds below it. */
function formatCountdown(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${mins}:${String(rest).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

// Buy alert card imported from shared component
import { BuyAlertCard } from '../chat/BuyAlertCard';
import { useBuyBotHidden } from '@/hooks/use-buy-bot-hidden';
import { SendStatus } from '@/components/app/chat/SendStatus';

function ChatAvatar({ src, address, name }: { src?: string | null; address?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);
  const cdnUrl = address ? buildAvatarCdnFallbackUrl(address, src ?? undefined) : undefined;
  const activeSrc = failed ? cdnUrl : (src ?? undefined);
  return (
    <Avatar className="w-7 h-7">
      {activeSrc && !cdnFailed && (
        <AvatarImage
          src={activeSrc}
          onError={() => failed ? setCdnFailed(true) : setFailed(true)}
        />
      )}
      <AvatarFallback className="bg-zinc-700 text-white text-[10px] font-medium">
        {name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function ChatReactions({
  reactions,
  currentUserAddress,
  onReact,
  onRemoveReaction,
  messageId,
}: {
  reactions: Record<string, string[]>;
  currentUserAddress?: string;
  onReact: (id: string, emoji: string) => void;
  onRemoveReaction: (id: string, emoji: string) => void;
  messageId: string;
}) {
  const entries = Object.entries(reactions).filter(([, addrs]) => addrs.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-0.5 mt-0.5">
      {entries.map(([emoji, addresses]) => {
        const mine = currentUserAddress
          ? addresses.some((a) => a.toLowerCase() === currentUserAddress.toLowerCase())
          : false;
        return (
          <button
            key={emoji}
            onClick={() => mine ? onRemoveReaction(messageId, emoji) : onReact(messageId, emoji)}
            className={`group/reaction inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded-md border transition-colors ${
              mine
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <span className="text-xs inline-flex items-center"><InlineEmoji value={emoji} className="h-4 m-0" /></span>
            {mine ? (
              <>
                <span className="group-hover/reaction:hidden">{addresses.length}</span>
                <X className="w-2.5 h-2.5 hidden group-hover/reaction:block text-white" />
              </>
            ) : (
              <span>{addresses.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface CommunityChatProps {
  communityId: string;
  community: Community;
  membership: CommunityMember | null | undefined;
  isMember: boolean;
  /** Membership is still being read: show neither the join prompt nor the message box yet. */
  membershipLoading?: boolean;
  /** The chat is the tab on screen. Defaults to true for a chat shown on its own. */
  active?: boolean;
  /** Joins the community: the "join to chat" bar calls it. */
  onJoin?: () => void;
  joining?: boolean;
  /** Fill the parent's height (the chat opened inside Chat) instead of the community tab's fixed size. */
  fill?: boolean;
}

/** History pages (50 lines each) a chat may pull in at open to reach where you left off. */
const MAX_READ_SPOT_PAGES = 10;

export function CommunityChat({ communityId, community, membership, isMember, membershipLoading = false, active = true, onJoin, joining, fill = false }: CommunityChatProps) {
  const { t: _copy } = _useCopy();
  const [newMessage, setNewMessage] = useSurfaceDraft("components/app/communities/CommunityChat.tsx:newMessage", '', communityId);
  const [replyTo, setReplyTo] = useDraftState<CommunityChatMessage | null>(`community:${communityId}:reply`, null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInitial, setEditInitial] = useState('');
  const [editText, setEditText] = useDraftState(editingId ? `chat:edit:${editingId}` : null, editInitial);
  const commitDraftEdit = async (id: string) => {
    if (!editText.trim()) return;
    try {
      const result = await editMessage(id, editText);
      if (result !== false && setEditText.complete(editText, editText)) setEditingId(current => current === id ? null : current);
    } catch { /* Keep the edit available for retry. */ }
  };

  const [searchQuery, setSearchQuery] = useSurfaceDraft("components/app/communities/CommunityChat.tsx:searchQuery", '', communityId);
  const [showSearch, setShowSearch] = useState(false);
  const [adminThinking, setAdminThinking] = useState(false);
  const PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  // Every line below the fold: the number on the scroll-down button.
  const [linesBelow, setLinesBelow] = useState(0);
  const [highlight, setHighlight] = useState<{ id: string; nonce: number } | null>(null);
  const [pinPendingId, setPinPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommunityChatMessage | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [slowModeRemaining, setSlowModeRemaining] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const didInitialScrollRef = useRef(false);
  const prevScrollHeightRef = useRef<number | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingJumpRef = useRef<string | null>(null);
  const prevLastMessageIdRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const { isHidden: buyBotHidden, hide: hideBuyBot } = useBuyBotHidden();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { user } = useAuth();
  // Holder groups: re-read this member's balance when the chat opens, so a
  // top-up lets them talk again and a sale is caught before they type.
  useEffect(() => {
    if (!active || !isMember || !walletAddress || !holderGateOf(community)) return;
    if (membership?.role === 'owner' || membership?.role === 'admin') return;
    runHolderCheck(communityId, walletAddress).catch(() => { /* the send guard still decides */ });
  }, [active, isMember, walletAddress, communityId, community, membership?.role]);
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Clears this chat's unread number in the Messages list.
  useRoomChatReading(communityId, walletAddress, active && isMember);

  // While the chat is on screen its notification is cleared and new pings are
  // held (lib/community-chat-notify). Re-sent every minute and on return to
  // the tab, so a reader who walks away starts hearing about it again.
  useEffect(() => {
    if (!active || !isAuthenticated || !isMember || !communityId) return;
    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      void markCommunityChatSeen(communityId).then(() =>
        queryClient.invalidateQueries({ queryKey: ['notifications'] }));
    };
    ping();
    const timer = window.setInterval(ping, COMMUNITY_CHAT_SEEN_INTERVAL_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [active, isAuthenticated, isMember, communityId, queryClient]);

  // @mention autocomplete. The composer already had handles parsed out of the
  // sent text for notifications, but nothing offered suggestions while typing,
  // so a handle only worked if you already knew it letter for letter.
  const mention = useMention({
    inputRef: textareaRef,
    onMentionInsert: (_user, newText) => setNewMessage(newText.slice(0, 500)),
  });

  const profileData = user ? {
    handle: user.username,
    name: user.displayName || user.display_name,
    avatarUrl: user.avatarImageUrl || user.avatarUrl || user.avatar_url,
  } : null;

  const abilities = useCommunityAbilities(community, membership);
  const canPinMessages = abilities.can('pin_messages');
  const canDeleteAnyMessage = abilities.can('delete_messages');
  const canSendMedia = abilities.can('send_media');
  const canSendMessages = abilities.can('send_messages');
  const canRestrictMembers = abilities.isOwner || abilities.can('restrict_members');
  const [memberActions, setMemberActions] = useState<CommunityMember | null>(null);
  const openMemberActions = useCallback(async (wallet: string, fallback?: () => void) => {
    try {
      const { data } = await withWalletHeader(
        supabase
          .from('community_members')
          .select('*')
          .eq('community_id', community.id)
          .eq('wallet_address', wallet.toLowerCase())
          .maybeSingle(),
        walletAddress,
      );
      const row = data as CommunityMember | null;
      // Same rank rule as the dialog: never the owner, an admin only for the owner.
      if (row && row.role !== 'owner' && (row.role !== 'admin' || abilities.isOwner)) { setMemberActions(row); return; }
    } catch { /* fall through to the profile */ }
    fallback?.();
  }, [community.id, walletAddress, abilities.isOwner]);

  const {
    messages,
    pinnedMessage,
    isLoading,
    hasOlderMessages, isLoadingOlder, loadOlder, showMessage, showLatest, isHistoryWindow, error: historyError, refreshHistory,
    sendMessage,
    retrySend,
    discardSend,
    editMessage,
    deleteMessage,
    hideMessage,
    setPinned,
    addReaction,
    removeReaction,
  } = useCommunityChat(communityId, { isPrivate: community.is_private });

  // ─── Where you left off ───────────────────────────────────────────────────
  // Saved on the server per chat, so every device opens on the first line you
  // haven't seen, under an "Unread messages" line.
  const readSpot = useChatReadPosition(isAuthenticated && communityId ? roomChatId(communityId) : null);
  const myLowerAddress = walletAddress?.toLowerCase() ?? null;
  const readLines = useMemo(() => messages.map((m) => ({
    id: m.id,
    own: !!myLowerAddress && m.wallet_address?.toLowerCase() === myLowerAddress,
    at: m.created_at,
    // Bot cards have no row of their own to land on.
    skip: !!m.send_state || m.message_type === 'buy_alert' || m.message_type === 'admin_response',
  })), [messages, myLowerAddress]);
  const [unreadAnchor, setUnreadAnchor] = useState<UnreadAnchor | null>(null);
  const [unreadMarkerSeen, setUnreadMarkerSeen] = useState(false);
  const [unreadMarkerAbove, setUnreadMarkerAbove] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  const unreadPlacedRef = useRef(false);
  const readSpotPagesRef = useRef(0);
  const readTrackingRef = useRef(false);

  // ─── Slow mode ────────────────────────────────────────────────────────────
  // Owners and admins are exempt server-side, so only plain members see this.
  // The countdown is feedback only — the database raises slow_mode_active on
  // its own clock, so the last-send stamp lives in localStorage purely to keep
  // the timer honest across a reload rather than to gate anything.
  const slowModeSeconds = community?.slow_mode_seconds ?? 0;
  const slowModeApplies = slowModeSeconds > 0 && abilities.role === 'member';
  const slowModeKey = walletAddress && communityId
    ? `community-slow-mode:${communityId}:${walletAddress.toLowerCase()}`
    : null;

  const readSlowModeRemaining = useCallback(() => {
    if (!slowModeApplies || !slowModeKey) return 0;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(slowModeKey);
    } catch {
      return 0;
    }
    const lastSentAt = raw ? Number(raw) : 0;
    if (!Number.isFinite(lastSentAt) || lastSentAt <= 0) return 0;
    const elapsed = (Date.now() - lastSentAt) / 1000;
    return Math.max(0, Math.min(slowModeSeconds, Math.ceil(slowModeSeconds - elapsed)));
  }, [slowModeApplies, slowModeKey, slowModeSeconds]);

  useEffect(() => {
    if (!slowModeApplies) {
      setSlowModeRemaining(0);
      return;
    }
    setSlowModeRemaining(readSlowModeRemaining());
    const timer = window.setInterval(() => {
      setSlowModeRemaining(readSlowModeRemaining());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [slowModeApplies, readSlowModeRemaining]);

  const startSlowModeCountdown = useCallback(() => {
    if (!slowModeApplies || !slowModeKey) return;
    try {
      window.localStorage.setItem(slowModeKey, String(Date.now()));
    } catch {
      // Private mode / storage disabled — the timer just won't survive a reload.
    }
    setSlowModeRemaining(slowModeSeconds);
  }, [slowModeApplies, slowModeKey, slowModeSeconds]);

  const humanisedInterval = useMemo(() => {
    if (slowModeSeconds >= 3600) {
      const hours = Math.round(slowModeSeconds / 3600);
      return hours === 1
        ? t('communities.chat.intervalHour', { defaultValue: '1 hour' })
        : t('communities.chat.intervalHours', { defaultValue: '{{count}} hours', count: hours });
    }
    if (slowModeSeconds >= 60) {
      const minutes = Math.round(slowModeSeconds / 60);
      return minutes === 1
        ? t('communities.chat.intervalMinute', { defaultValue: '1 minute' })
        : t('communities.chat.intervalMinutes', { defaultValue: '{{count}} minutes', count: minutes });
    }
    return slowModeSeconds === 1
      ? t('communities.chat.intervalSecond', { defaultValue: '1 second' })
      : t('communities.chat.intervalSeconds', { defaultValue: '{{count}} seconds', count: slowModeSeconds });
  }, [slowModeSeconds, t]);

  // ─── Why the composer may be closed, in the order the server checks ───────
  const mutedNotice = useMemo(() => {
    const until = abilities.mutedUntil;
    if (!until || until.getFullYear() >= FOREVER_YEAR) {
      return t('communities.chat.muted', { defaultValue: 'You are muted' });
    }
    return t('communities.chat.mutedUntil', {
      defaultValue: 'You are muted until {{until}}',
      until: until.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    });
  }, [abilities.mutedUntil, t]);

  const readOnlyChannel = communityKindOf(community) === 'channel' && !abilities.isOwner && !abilities.isAdmin;
  const composerNotice: { icon: React.ReactNode; text: React.ReactNode } | null = readOnlyChannel
    ? { icon: <Megaphone className="w-4 h-4" />, text: t('communities.newChat.adminsOnly', { defaultValue: 'Only admins post in this channel.' }) }
    : abilities.isMuted
    ? { icon: <MicOff className="w-4 h-4" />, text: mutedNotice }
    : !canSendMessages
      ? {
          icon: <Ban className="w-4 h-4" />,
          text: t('communities.chat.postingDisabled', { defaultValue: 'Posting is disabled for members here' }),
        }
      : null;

  // Filter by search query (searches content + sender names)
  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => {
      const name = (m.display_name || m.username || '').toLowerCase();
      return m.content?.toLowerCase().includes(q) || name.includes(q);
    });
  }, [messages, searchQuery]);

  // Paginate: show last `visibleCount` messages. When searching, show all matches.
  const displayedMessages = useMemo(() => {
    if (searchQuery.trim()) return filteredMessages;
    if (filteredMessages.length <= visibleCount) return filteredMessages;
    return filteredMessages.slice(filteredMessages.length - visibleCount);
  }, [filteredMessages, visibleCount, searchQuery]);

  const hasMore = !searchQuery.trim() && (filteredMessages.length > displayedMessages.length || hasOlderMessages);

  // Open where you left off: on the "Unread messages" line when there are lines
  // you haven't seen, otherwise at the newest line.
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (messages.length === 0) return;
    if (!readSpot.ready) return;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    let anchor: UnreadAnchor | null = null;
    if (readSpot.opening && !isHistoryWindow && !searchQuery.trim()) {
      const found = anchorFromReadSpot(readLines, readSpot.opening, hasOlderMessages);
      if (found.kind === 'older') {
        if (readSpotPagesRef.current < MAX_READ_SPOT_PAGES) {
          if (!isLoadingOlder) {
            readSpotPagesRef.current += 1;
            void loadOlder().catch(() => {});
          }
          return;
        }
        const theirs = readLines.filter((l) => !l.own && !l.skip);
        if (theirs.length) anchor = { id: theirs[0].id, ids: theirs.map((l) => l.id), count: theirs.length };
      } else if (found.kind === 'anchor') {
        anchor = found.anchor;
      }
    }
    if (anchor) {
      const index = messages.findIndex((m) => m.id === anchor!.id);
      // Show enough history that the marker and a few lines above it render.
      if (index >= 0) setVisibleCount((c) => Math.max(c, messages.length - index + 3));
      setUnreadAnchor(anchor);
      didInitialScrollRef.current = true;
      prevLastMessageIdRef.current = messages[messages.length - 1]?.id ?? null;
      window.setTimeout(() => { readTrackingRef.current = true; }, 1500);
      return;
    }
    requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      didInitialScrollRef.current = true;
      readTrackingRef.current = true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, readSpot.ready, hasOlderMessages, isLoadingOlder]);

  /** How many unread lines sit below the fold, and whether the marker is above it. */
  const refreshUnreadJump = useCallback(() => {
    const container = scrollRef.current;
    if (!container || !unreadAnchor) return;
    const box = container.getBoundingClientRect();
    let below = 0;
    for (const id of unreadAnchor.ids) {
      const el = messageRefs.current[id];
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
    const container = scrollRef.current;
    if (!container || !readTrackingRef.current || searchQuery.trim()) return;
    const ids: string[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m.send_state && m.created_at) ids.push(m.id);
    }
    const id = newestLineOnScreen(container, ids, (x) => messageRefs.current[x]);
    if (!id) return;
    const line = messages.find((m) => m.id === id);
    if (line) readSpot.report(line.id, line.created_at);
  }, [messages, searchQuery, readSpot.report]);

  const refreshLinesBelow = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    setLinesBelow(countLinesBelow(container, messages.map((m) => m.id), (id) => messageRefs.current[id]));
  }, [messages]);

  const scrollFrame = useRef(0);
  const scheduleScrollWork = useCallback(() => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      refreshUnreadJump();
      refreshLinesBelow();
      reportReadSpot();
    });
  }, [refreshUnreadJump, refreshLinesBelow, reportReadSpot]);
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);
  // Lines landing while you sit at the bottom are read as they arrive.
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
    const container = scrollRef.current;
    const marker = container?.querySelector<HTMLElement>('[data-chat-unread-marker]');
    if (!container || !marker) return;
    unreadPlacedRef.current = true;
    const offset = marker.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop = Math.max(0, container.scrollTop + offset - 8);
    readTrackingRef.current = true;
    scheduleScrollWork();
  }, [unreadAnchor, displayedMessages, scheduleScrollWork]);

  const jumpToUnreadMarker = useCallback(() => {
    const container = scrollRef.current;
    const marker = container?.querySelector<HTMLElement>('[data-chat-unread-marker]');
    if (!container || !marker) return;
    const offset = marker.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: Math.max(0, container.scrollTop + offset - 8), behavior: 'smooth' });
    setUnreadMarkerSeen(true);
  }, []);

  // Auto-scroll to bottom on new message arrival (only if user is near bottom)
  //
  // The count is derived from where the previous tail sits in the current list,
  // never accumulated one-per-signal. A blind `c + 1` trusts that every firing
  // of this effect means exactly one new message, and anything that makes the
  // last id flip back and forth — an optimistic id swapped for a real one, two
  // messages sharing a timestamp, a refetch reordering the tail — then ratchets
  // the pill up on every render. That is how it reached "602070 new messages".
  // Re-deriving is self-correcting: an id that comes back around scores zero.
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!didInitialScrollRef.current) return;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const prevLastId = prevLastMessageIdRef.current;
    const prevIndex = prevLastId ? messages.findIndex((m) => m.id === prevLastId) : -1;
    // Old tail gone (full refetch, or an id swap) — count nothing rather than
    // guess, so the pill can't lie.
    const appended = prevIndex === -1 ? 0 : messages.length - 1 - prevIndex;
    prevLastMessageIdRef.current = lastMessageId ?? null;
    if (appended <= 0) return;

    const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
    if (distanceFromBottom < 120) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    } else {
      // New message arrived while the user is scrolled up — surface the
      // "jump to latest" button with an unread count (matches DM behaviour).
      setNewMessageCount((c) => c + appended);
      setShowJumpToLatest(true);
    }
    // `messages` is read but deliberately not a dependency: only a change of
    // tail is a new message, and re-running on every list identity change is
    // exactly the over-firing this guards against.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId]);

  // Preserve scroll position when loading older messages
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    if (prevScrollHeightRef.current != null) {
      const diff = scrollContainer.scrollHeight - prevScrollHeightRef.current;
      scrollContainer.scrollTop = diff;
      prevScrollHeightRef.current = null;
    }
  }, [visibleCount]);

  // Jumping to the pinned message: if it sits above the paginated window we
  // widen the window first and finish the jump once its node exists.
  const jumpToMessage = useCallback(async (messageId: string) => {
    const node = messageRefs.current[messageId];
    if (node && !searchQuery.trim()) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlight({ id: messageId, nonce: Date.now() });
      return;
    }
    try {
      await showMessage(messageId);
      pendingJumpRef.current = messageId;
      setSearchQuery('');
      setVisibleCount(Math.max(messages.length, 50));
    } catch {
      toast.error(t('common.failedToLoad'));
    }
  }, [showMessage, messages.length, searchQuery, setSearchQuery, t]);

  // Search: the shared chat search (public chat's), reading this chat's table.
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState('');
  const [searchPerson, setSearchPerson] = useState<ChatSearchPerson | null>(null);
  const [searchView, setSearchView] = useState<'list' | 'chat'>('list');
  const [activeHit, setActiveHit] = useState(-1);
  const [jumping, setJumping] = useState(false);
  const searchReadable = isAuthenticated || !community.is_private;
  const searchSource = useCallback<ChatSearchSource>(
    (roomId, params) => searchCommunityChat(roomId, params, walletAddress),
    [walletAddress],
  );
  const search = useChatSearch(communityId, showSearch && searchReadable, searchText, searchPerson?.address ?? null, searchSource);
  const showSearchList = showSearch && searchView === 'list';
  const openSearch = useCallback(() => {
    setShowSearch(true);
    setSearchView('list');
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);
  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchText('');
    setSearchPerson(null);
    setSearchView('list');
    setActiveHit(-1);
  }, []);
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
    setActiveHit(index);
    setSearchView('chat');
    setJumping(true);
    await jumpToMessage(hit.id);
    setJumping(false);
  }, [jumping, search, searchText, jumpToMessage]);

  useEffect(() => {
    const pending = pendingJumpRef.current;
    if (!pending) return;
    const node = messageRefs.current[pending];
    if (!node) {
      // Already inside the rendered window but with no bubble of its own (bot
      // cards) — drop the jump rather than leaving it armed forever.
      if (displayedMessages.some(m => m.id === pending)) pendingJumpRef.current = null;
      return;
    }
    pendingJumpRef.current = null;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight({ id: pending, nonce: Date.now() });
  }, [displayedMessages]);

  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 1500);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const loadEarlier = useCallback(async () => {
    if (isLoadingOlder) return;
    const el = scrollRef.current;
    if (el) prevScrollHeightRef.current = el.scrollHeight;
    try {
      if (visibleCount >= messages.length && !(await loadOlder())) {
        prevScrollHeightRef.current = null;
        return;
      }
      setVisibleCount(c => c + PAGE_SIZE);
    } catch {
      prevScrollHeightRef.current = null;
      toast.error(t('common.failedToLoad'));
    }
  }, [isLoadingOlder, visibleCount, messages.length, loadOlder, t]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpToLatest(distanceFromBottom > 100);
    if (distanceFromBottom < 50) setNewMessageCount(0);
    scheduleScrollWork();
    if (el.scrollTop <= 0 && hasMore) void loadEarlier();
  }, [hasMore, loadEarlier, scheduleScrollWork]);

  const scrollToBottom = useCallback(async () => {
    try {
      await showLatest();
      setSearchQuery('');
      // Folding the loaded history back to one page mid-glide made the list
      // snap; only do it when we were in an old window or a search.
      if (isHistoryWindow || searchQuery.trim()) setVisibleCount(PAGE_SIZE);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) glideToBottom(el);
      });
      setNewMessageCount(0);
      setShowJumpToLatest(false);
    } catch { toast.error(t('common.failedToLoad')); }
  }, [showLatest, setSearchQuery, t, isHistoryWindow, searchQuery]);

  const handleSetPinned = useCallback(async (messageId: string, pinned: boolean) => {
    setPinPendingId(messageId);
    try {
      await setPinned(messageId, pinned);
    } finally {
      setPinPendingId(null);
    }
  }, [setPinned]);

  const handleConfirmDelete = useCallback(async (scope: DeleteScope) => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    setDeletePending(true);
    try {
      if (scope === 'everyone') await deleteMessage(target.id);
      else await hideMessage(target.id);
    } finally {
      setDeletePending(false);
    }
  }, [deleteTarget, deleteMessage, hideMessage]);

  const sendingRef = useRef(false);
  const handleSend = async () => {
    if (sendingRef.current) return;
    if (!isAuthenticated) { openLoginModal(); return; }
    if (slowModeRemaining > 0) return;
    const trimmed = newMessage.trim();
    if (!trimmed) return;
    const replyToId = replyTo?.id;
    sendingRef.current = true;

    // Detect /admin command
    const adminMatch = trimmed.match(/^\/admin\b\s*(.*)$/i);

    let sent = false;
    // The line shows in the chat at once (a small ring until it is stored,
    // Retry on it if it fails), so the box lets go of it straight away.
    if (setNewMessage.complete(newMessage, '')) setReplyTo.complete(replyTo, null);
    try {
      await sendMessage(trimmed, 'text', undefined, replyToId, {
        username: profileData?.handle || undefined,
        displayName: profileData?.name || undefined,
        avatarUrl: profileData?.avatarUrl || undefined,
        badgeBalance: user?.badgeBalance || undefined,
      });
      sent = true;
    } catch {
      // Error handled in hook
    }
    sendingRef.current = false;
    if (!sent) return;
    startSlowModeCountdown();

    if (adminMatch) {
      const prompt = (adminMatch[1] || '').trim();
      if (!prompt) {
        toast.info(_copy("copy.2c7bc98141ec", { defaultValue: "Try: /admin <your question>" }));
        return;
      }
      setAdminThinking(true);
      try {
        const { error } = await supabase.functions.invoke('community-admin-chat', {
          body: {
            communityId,
            prompt,
            askerName: profileData?.name || profileData?.handle || 'Member',
          },
        });
        if (error) throw error;
      } catch (err: any) {
        console.error('[CommunityChat] AI Admin error:', err);
        toast.error(err?.message || _copy("copy.b49ffce28586", { defaultValue: "AI Admin failed to respond" }));
      } finally {
        setAdminThinking(false);
      }
    }
  };


  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => (prev + emoji).slice(0, 500));
  };

  const handleGifSelect = async (gifUrl: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (slowModeRemaining > 0) return;
    const replyToId = replyTo?.id;
    try {
      // image_url carries the picture; the body stays empty so a client that
      // renders the text does not print the URL under the GIF as a link.
      await sendMessage('', 'gif', gifUrl, replyToId, {
        username: profileData?.handle || undefined,
        displayName: profileData?.name || undefined,
        avatarUrl: profileData?.avatarUrl || undefined,
        badgeBalance: user?.badgeBalance || undefined,
      });
      startSlowModeCountdown();
    } catch {
      // Error handled in hook
    }
  };

  // Photos, same rules as Public Chat (JPG, PNG, GIF, WebP up to 10MB). The
  // typed line goes along as the caption.
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const handleImageFile = async (file: File) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (slowModeRemaining > 0 || imageUploading) return;
    const type = (file.type || '').toLowerCase();
    if (!(PUBLIC_CHAT_IMAGE_TYPES as readonly string[]).includes(type)) {
      toast.error(t('communities.chat.imageType', { defaultValue: 'Send a photo: JPG, PNG, GIF or WebP.' }));
      return;
    }
    if (file.size > PUBLIC_CHAT_IMAGE_MAX_SIZE) {
      toast.error(t('communities.chat.imageSize', { defaultValue: 'Image must be less than 10MB' }));
      return;
    }
    const caption = newMessage.trim();
    const replyToId = replyTo?.id;
    setImageUploading(true);
    try {
      const { url } = await uploadChatImage(file);
      await sendMessage(caption, 'image', url, replyToId, {
        username: profileData?.handle || undefined,
        displayName: profileData?.name || undefined,
        avatarUrl: profileData?.avatarUrl || undefined,
        badgeBalance: user?.badgeBalance || undefined,
      });
      if (caption) setNewMessage.complete(newMessage, '');
      setReplyTo.complete(replyTo, null);
      startSlowModeCountdown();
    } catch (err: any) {
      console.error('[CommunityChat] Image send failed:', err);
      toast.error(err?.message || t('communities.chat.imageFailed', { defaultValue: 'Failed to send photo' }));
    } finally {
      setImageUploading(false);
    }
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!canSendMedia) return;
    const file = Array.from(e.clipboardData?.files || []).find(f => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void handleImageFile(file);
  };

  const handleVoiceRecordingComplete = useCallback(async (blob: Blob, _duration: number) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const toastId = 'community-voice-upload';
    toast.loading(_copy("copy.97a0afff525e", { defaultValue: "Uploading voice note..." }), { id: toastId });
    try {
      const token = getAuthToken();
      const file = voiceRecordingFile(blob);
      const formData = new FormData();
      formData.append('file', file, file.name);
      const { data, error } = await supabase.functions.invoke('dm-upload-media', {
        body: formData,
        headers: {
          'x-wallet-address': walletAddress?.toLowerCase() || '',
          'x-dehub-token': token || '',
        },
      });
      if (error || !data?.ok || !data?.url) {
        throw new Error(data?.error || error?.message || _copy("copy.6efc5d27f30b", { defaultValue: "Upload failed" }));
      }
      await sendMessage(data.url, 'voice', data.url, replyTo?.id, {
        username: profileData?.handle || undefined,
        displayName: profileData?.name || undefined,
        avatarUrl: profileData?.avatarUrl || undefined,
        badgeBalance: user?.badgeBalance || undefined,
      });
      setReplyTo.complete(replyTo, null);
      startSlowModeCountdown();
      toast.success(_copy("copy.690c816e9745", { defaultValue: "Voice note sent!" }), { id: toastId });
    } catch (err: any) {
      console.error('[CommunityChat] Voice upload failed:', err);
      toast.error(err?.message || _copy("copy.615d555f779c", { defaultValue: "Failed to send voice note" }), { id: toastId });
    }
  }, [isAuthenticated, walletAddress, sendMessage, replyTo, profileData, user, openLoginModal, startSlowModeCountdown, setReplyTo, _copy]);

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

  const handleReact = useCallback((messageId: string, emoji: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const msg = messages.find(m => m.id === messageId);
    const myReaction = walletAddress && msg?.reactions?.[emoji]?.some(
      (a) => a.toLowerCase() === walletAddress.toLowerCase()
    );
    if (myReaction) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
    }
  }, [isAuthenticated, walletAddress, messages, addReaction, removeReaction]);

  // Hold a line on a phone, or right-click it with a mouse: reactions and the
  // line's actions, Copy link among them.
  const [held, setHeld] = useState<{ msg: CommunityChatMessage; el: HTMLElement } | null>(null);
  const [menu, setMenu] = useState<{ msg: CommunityChatMessage; point: { x: number; y: number } } | null>(null);
  const [menuMounted, setMenuMounted] = useState(false);
  const hold = useHoldMenu((point, target) => {
    if (editingId) return false;
    const el = target.closest<HTMLElement>('[data-cc-msg]');
    const msg = el ? messages.find((m) => m.id === el.dataset.ccMsg) : undefined;
    if (!el || !msg || msg.send_state) return false;
    if (isTouchHold()) { setHeld({ msg, el }); return; }
    if (keepBrowserMenu(target, el)) return false;
    setMenuMounted(true);
    setMenu({ msg, point });
  });
  const lineActions = (msg: CommunityChatMessage | undefined, phone: boolean) => {
    const list: (MessageMenuAction & { prime?: boolean; secondary?: boolean })[] = [];
    if (!msg) return list;
    const mine = !!walletAddress && msg.wallet_address?.toLowerCase() === walletAddress.toLowerCase();
    if (isAuthenticated && isMember) list.push({ key: 'reply', prime: phone, icon: menuIcons.reply, label: t('communities.reply'), onSelect: () => setReplyTo(msg), hint: 'R' });
    if (msg.content?.trim() && msg.message_type !== 'gif') list.push({
      key: 'copy', icon: menuIcons.copy,
      label: phone ? _copy('chatHold.copy', { defaultValue: 'Copy' }) : _copy('msgMenu.copyText', { defaultValue: 'Copy Text' }), hint: 'C',
      onSelect: () => { void navigator.clipboard?.writeText(msg.content).then(() => toast.success(_copy('chatHold.copied', { defaultValue: 'Copied' })), () => undefined); },
    });
    if (community.slug && canLinkMessage(msg.id)) list.push({
      key: 'copy-link', icon: menuIcons.link, label: copyLinkLabel(), hint: 'L',
      onSelect: () => copyChatMessageLink({ kind: 'community', slug: community.slug }, msg.id),
    });
    if (mine && isAuthenticated && isMember && msg.message_type !== 'gif') list.push({ key: 'edit', icon: menuIcons.edit, label: t('communities.edit'), onSelect: () => { setEditingId(msg.id); setEditInitial(msg.content); }, hint: 'E' });
    if (canPinMessages && isAuthenticated && isMember) list.push({
      key: 'pin', icon: msg.pinned_at ? menuIcons.unpin : menuIcons.pin,
      label: msg.pinned_at ? t('communities.chat.unpin', { defaultValue: 'Unpin' }) : t('communities.chat.pin', { defaultValue: 'Pin' }),
      onSelect: () => void handleSetPinned(msg.id, !msg.pinned_at), hint: 'P',
    });
    if (isAuthenticated && isMember) list.push({ key: 'delete', divided: true, destructive: true, secondary: phone, icon: menuIcons.delete, label: t('communities.chat.delete', { defaultValue: 'Delete' }), onSelect: () => setDeleteTarget(msg) });
    return list;
  };
  const reactedByMe = (msg: CommunityChatMessage | undefined) => (msg && walletAddress
    ? Object.entries(msg.reactions ?? {})
        .filter(([, addrs]) => addrs?.some((a) => a.toLowerCase() === walletAddress.toLowerCase()))
        .map(([emoji]) => emoji)
    : []);

  // A copied message link to this community's chat: open on that line,
  // reading the history around it when it is older than what is held.
  useLinkedMessage(
    community.slug ? `community:${community.slug.toLowerCase()}` : null,
    active && !isLoading && messages.length > 0 && readSpot.ready,
    async (id) => {
      didInitialScrollRef.current = true;
      readTrackingRef.current = true;
      setUnreadAnchor(null);
      setSearchQuery('');
      if (!messages.some((m) => m.id === id)) await showMessage(id);
      setVisibleCount((c) => Math.max(c, messages.length + 50));
      return true;
    },
    (id) => messageRefs.current[id] ?? null,
  );

  const pinnedSenderName = pinnedMessage
    ? pinnedMessage.display_name
      || pinnedMessage.username
      || (pinnedMessage.wallet_address
        ? `${pinnedMessage.wallet_address.slice(0, 6)}...${pinnedMessage.wallet_address.slice(-4)}`
        : _copy("copy.90395d452a30", { defaultValue: "Anon" }))
    : '';
  const pinnedPreview = pinnedMessage
    ? (pinnedMessage.content
      || (pinnedMessage.message_type === 'gif'
        ? t('communities.chat.pinnedGif', { defaultValue: 'GIF' })
        : t('communities.chat.pinnedMedia', { defaultValue: 'Media' })))
    : '';

  // Members get a message box at the bottom: the phone bottom bar stands down.
  // Only while its page is on screen: Messages stays mounted (hidden) after
  // you leave it, and an open group there kept the bar hidden on Home.
  const pageOnScreen = useContext(CachedPageActiveContext);
  useHoldBottomNav(active && isMember && pageOnScreen);
  const translateSignal = 0;
  const originalSignal = 0;

  return (
    <div data-room-chat={fill ? 'pane' : 'tab'} className={fill ? 'flex h-full min-h-0 flex-col' : 'flex flex-col'} style={fill ? undefined : { height: 'calc(100vh - 340px)', minHeight: '300px' }}>
      <SharedTranslationContext.Provider value={{ translateSignal, originalSignal, requestTranslate: () => {}, requestOriginal: () => {} }}>
        {/* Search bar */}
        <div className="px-1 pb-1 flex items-center gap-1">
          {!showSearch && isMember && communityKindOf(community) === 'group' ? (
            <GroupCallButtons groupId={communityId} groupName={community?.name ?? ''} />
          ) : null}
          {showSearch ? (
            <div className="flex-1 min-w-0">
              <ChatSearchBar
                inputRef={searchInputRef}
                text={searchText}
                person={searchPerson}
                onText={(value) => { setSearchText(value); setSearchView('list'); setActiveHit(-1); }}
                onClearPerson={() => { setSearchPerson(null); setSearchView('list'); setActiveHit(-1); searchInputRef.current?.focus(); }}
                onFocusList={() => setSearchView('list')}
                onClose={closeSearch}
              />
            </div>
          ) : (
            <button
              data-community-chat-search
              onClick={openSearch}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              {t('communities.searchMessages', 'Search')}
            </button>
          )}
        </div>
        {/* Messages area */}
        <div className="relative flex-1">
          {/* The same search as the public chat: people, words, and stepping through results. */}
          {showSearchList && (
            <ChatSearchPanel
              text={searchText}
              person={searchPerson}
              search={search}
              signedIn={searchReadable}
              activeId={search.results[activeHit]?.id ?? null}
              onSignIn={() => openLoginModal()}
              onPickPerson={(person) => { setSearchPerson(person); setSearchText(''); setActiveHit(-1); }}
              onPickText={(value) => { setSearchText(value); searchInputRef.current?.focus(); }}
              onOpenResult={openResult}
            />
          )}
          {showSearch && searchView === 'chat' && activeHit >= 0 && (
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
          <div ref={scrollRef} onScroll={handleScroll} className={`absolute inset-0 chat-text-zone overflow-y-auto py-2 space-y-2 ${showSearchList ? 'invisible' : ''}`} {...hold}>
            {historyError && (
              <button onClick={() => void refreshHistory()} className="mx-3 px-3 py-2 text-sm" role="alert">
                {t('common.failedToLoad')} — {t('common.retry')}
              </button>
            )}
            {/* Pinned message banner */}
            {pinnedMessage && (
              <div className="sticky top-0 z-20 mx-3 flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/85 backdrop-blur-xl px-2.5 py-1.5">
                <Pin className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <button
                  onClick={() => jumpToMessage(pinnedMessage.id)}
                  className="flex-1 min-w-0 text-left"
                  title={t('communities.chat.jumpToPinned', { defaultValue: 'Jump to the pinned message' })}
                >
                  <span className="block text-[10px] text-zinc-500">
                    {t('communities.chat.pinnedMessage', { defaultValue: 'Pinned message' })}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-300">
                    <span className="font-medium text-white">{pinnedSenderName}</span>
                    {' '}
                    {pinnedPreview}
                  </span>
                </button>
                {canPinMessages && (
                  <button
                    onClick={() => handleSetPinned(pinnedMessage.id, false)}
                    disabled={pinPendingId === pinnedMessage.id}
                    className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors flex-shrink-0 disabled:opacity-50"
                    title={t('communities.chat.unpin', { defaultValue: 'Unpin' })}
                    aria-label={t('communities.chat.unpin', { defaultValue: 'Unpin' })}
                  >
                    {pinPendingId === pinnedMessage.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <X className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            )}
            {isLoading ? (
              <div className="space-y-3 py-2 px-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Skeleton className="w-7 h-7 rounded-full bg-white/[0.06]" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-3 w-20 bg-white/[0.06]" />
                      <Skeleton className="h-3 w-40 bg-white/[0.06]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <AppState
                icon="messages"
                title={t('communities.noMessagesYet')}
                description={t('communities.beFirstToChat')}
                size="section"
                className="h-full"
              />
            ) : displayedMessages.length === 0 ? (
              <AppState
                icon="search"
                title={_copy("copy.bf3cda441288", { defaultValue: "No matching messages" })}
                description={_copy("copy.c3de7ea4ce48", { defaultValue: "No messages match \"{{value1}}\".", value1: searchQuery })}
                kind="search-empty"
                size="compact"
                className="h-full"
              />
            ) : (
              <>
                {hasMore && (
                  <div className="flex justify-center py-1">
                    <button
                      onClick={() => void loadEarlier()}
                      disabled={isLoadingOlder}
                      aria-busy={isLoadingOlder}
                      className="text-[11px] text-zinc-500 hover:text-white px-2 py-1 rounded-md hover:bg-white/[0.04] transition-colors"
                    >{_copy("copy.f17671d83db0", { defaultValue: "Load older messages" })}</button>
                  </div>
                )}
                {displayedMessages.map((msg) => {
                const row = (() => {
                // Buy alert messages get a special card treatment
                if (msg.message_type === 'buy_alert') {
                  if (buyBotHidden) return null;
                  return (
                    <BuyAlertCard
                      key={msg.id}
                      content={msg.content}
                      timestamp={msg.created_at}
                      onHide={hideBuyBot}
                    />
                  );
                }

                // AI Admin response — styled like the AI Assistant page
                if (msg.message_type === 'admin_response') {
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-start gap-2 px-3"
                    >
                      <img
                        src={assistantAvatar}
                        alt={_copy("copy.d544dcff425e", { defaultValue: "AI Admin" })}
                        className="w-7 h-7 rounded-lg shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="text-xs font-semibold text-white">{_copy("copy.d544dcff425e", { defaultValue: "AI Admin" })}</span>
                          <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide text-white/70 px-1.5 py-[1px] rounded-md bg-white/10 border border-white/15">
                            <Sparkles className="w-2.5 h-2.5" />{_copy("copy.4603c6da1d5a", { defaultValue: " bot" })}</span>
                          <span className="text-zinc-600 text-[10px]">{formatTimeAgo(msg.created_at)}</span>
                        </span>
                        <div className="mt-1 rounded-2xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-3 py-2 text-white">
                          <MarkdownText content={msg.content} className="text-xs" />
                        </div>
                      </div>
                    </motion.div>
                  );
                }



                const avatarUrl = buildAvatarUrl(msg.wallet_address, msg.avatar_url);
                const name = msg.display_name || msg.username || msg.wallet_address?.slice(0, 8) || _copy("copy.90395d452a30", { defaultValue: "Anon" });
                const handle = msg.username;
                const openProfile = handle ? () => navigate(`/${handle}`) : undefined;
                // Owners and admins who may restrict members get the member's
                // actions (mute, ban, remove) from a click on the name or face.
                const canActHere = canRestrictMembers && !!msg.wallet_address
                  && !(walletAddress && msg.wallet_address.toLowerCase() === walletAddress.toLowerCase());
                const goToProfile = canActHere ? () => void openMemberActions(msg.wallet_address!, openProfile) : openProfile;
                const isMine = !!walletAddress && msg.wallet_address?.toLowerCase() === walletAddress.toLowerCase();
                // Anyone can delete a line for themselves; for everyone needs it
                // to be yours, or the delete_messages right.
                const canDeleteThis = !msg.send_state;
                const isPinned = !!msg.pinned_at;
                const isHighlighted = highlight?.id === msg.id;

                return (
                  <SwipeReplyRow key={msg.client_key ?? msg.id} onReply={isMember && !msg.send_state ? () => setReplyTo(msg) : undefined}>
                  <div
                    ref={(node) => { messageRefs.current[msg.id] = node; }}
                    data-cc-msg={msg.id}
                    className={`group relative px-3 py-0.5 rounded-xl transition-shadow duration-300 ${isMine ? 'bg-white/5 py-1' : ''} ${isHighlighted ? 'ring-1 ring-white/30' : ''}`}
                  >
                    {msg.reply_to && (
                      <button
                        type="button"
                        onClick={() => void jumpToMessage(msg.reply_to!.id)}
                        aria-label={t('communities.chat.jumpToReply', { defaultValue: 'Jump to replied message' })}
                        className="flex max-w-full items-center gap-1 text-left text-[10px] text-zinc-500 hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 ml-9 mb-0.5"
                      >
                        <CornerDownRight className="w-2.5 h-2.5" />
                        <span className="font-medium">{msg.reply_to.sender_name}</span>
                        <span className="truncate max-w-[200px]">{msg.reply_to.content}</span>
                      </button>
                    )}
                    <div className="flex items-start gap-2">
                      <button onClick={goToProfile} disabled={!goToProfile} className={`flex-shrink-0 ${goToProfile ? 'cursor-pointer' : 'cursor-default'}`}>
                        <ChatAvatar src={avatarUrl} address={msg.wallet_address} name={name} />
                      </button>
                       <div className="min-w-0 flex-1">
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="inline-flex items-baseline gap-1 shrink min-w-0">
                            <button onClick={goToProfile} disabled={!goToProfile} className={`text-xs font-semibold text-white truncate ${goToProfile ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>
                              {name}
                            </button>
                            <BadgeIcon badgeBalance={(msg as any).badge_balance} username={msg.username} className="w-[1em] h-[1em]" />
                          </span>
                          <span className="text-zinc-600 text-[10px]">{formatTimeAgo(msg.created_at)}</span>
                          {isMine && msg.client_key && (
                            <SendStatus
                              state={msg.send_state}
                              className="self-center text-zinc-500"
                              onRetry={() => retrySend(msg.client_key!)}
                              onDiscard={() => discardSend(msg.client_key!)}
                            />
                          )}
                          {isPinned && (
                            <span
                              className="inline-flex items-center text-zinc-500"
                              title={t('communities.chat.pinnedMessage', { defaultValue: 'Pinned message' })}
                            >
                              <Pin className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </span>
                        {msg.message_type === 'gif' && (msg.image_url || msg.content) ? (
                          <img src={outsideImage(msg.image_url || msg.content)} alt="GIF" className="max-w-[280px] max-h-32 rounded mt-0.5" loading="lazy" />
                        ) : msg.message_type === 'image' && msg.image_url ? (
                          <div className="mt-1" data-community-chat-image>
                            <a href={msg.image_url} target="_blank" rel="noopener noreferrer" className="block w-fit">
                              <img src={msg.image_url} alt={msg.content || t('communities.chat.photo', { defaultValue: 'Photo' })} className="max-w-[280px] max-h-72 rounded-lg object-cover" loading="lazy" />
                            </a>
                            {!!msg.content && (
                              <p className="text-sm text-zinc-200 mt-1 whitespace-pre-wrap break-words">{msg.content}</p>
                            )}
                          </div>
                        ) : msg.message_type === 'voice' && msg.image_url ? (
                          <div className="mt-1">
                            <VoiceWaveformPlayer src={msg.image_url} />
                          </div>
                        ) : editingId === msg.id ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  void commitDraftEdit(msg.id);
                                } else if (e.key === 'Escape') {
                                  setEditingId(null);
                                }
                              }}
                              className="flex-1 text-xs text-white bg-white/5 border border-white/10 rounded px-1.5 py-0.5 outline-none focus:border-white/20"
                              maxLength={500}
                            />
                            <button
                              onClick={() => { void commitDraftEdit(msg.id); }}
                              className="p-0.5 text-emerald-400 hover:text-emerald-300"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-0.5 text-zinc-500 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <CommunityMessageBody content={msg.content} />
                        )}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <ChatReactions
                            reactions={msg.reactions}
                            currentUserAddress={walletAddress || undefined}
                            onReact={addReaction}
                            onRemoveReaction={removeReaction}
                            messageId={msg.id}
                          />
                        )}
                      </div>
                      {isAuthenticated && isMember && (
                        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                          {isMine && msg.message_type !== 'gif' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => { setEditingId(msg.id); setEditInitial(msg.content); }}
                                  className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
                                  aria-label={t('communities.edit')}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">{t('communities.edit')}</TooltipContent>
                            </Tooltip>
                          )}
                          {canPinMessages && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleSetPinned(msg.id, !isPinned)}
                                  disabled={pinPendingId === msg.id}
                                  className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded disabled:opacity-50"
                                  aria-label={isPinned
                                    ? t('communities.chat.unpin', { defaultValue: 'Unpin' })
                                    : t('communities.chat.pin', { defaultValue: 'Pin' })}
                                >
                                  {pinPendingId === msg.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : isPinned ? (
                                    <PinOff className="w-3.5 h-3.5" />
                                  ) : (
                                    <Pin className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {isPinned
                                  ? t('communities.chat.unpin', { defaultValue: 'Unpin' })
                                  : t('communities.chat.pin', { defaultValue: 'Pin' })}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {canDeleteThis && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setDeleteTarget(msg)}
                                  className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors rounded"
                                  aria-label={t('communities.chat.delete', { defaultValue: 'Delete' })}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {t('communities.chat.delete', { defaultValue: 'Delete' })}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setReplyTo(msg)}
                                className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
                                aria-label={t('communities.reply')}
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t('communities.reply')}</TooltipContent>
                          </Tooltip>
                          <Popover>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                  <button
                                    className="p-0.5 text-zinc-500 hover:text-white transition-colors rounded"
                                    aria-label={t('communities.react')}
                                  >
                                    <SmilePlus className="w-3.5 h-3.5" />
                                  </button>
                                </PopoverTrigger>
                              </TooltipTrigger>
                              <TooltipContent side="top">{t('communities.react')}</TooltipContent>
                            </Tooltip>
                            <PopoverContent
                              side="top"
                              align="end"
                              className="w-auto p-1 bg-zinc-800 border-zinc-700 rounded-xl"
                            >
                              <div className="flex gap-0.5">
                                {QUICK_CHAT_REACTIONS.map((emoji) => {
                                  const isActive = walletAddress && msg.reactions?.[emoji]?.some(
                                    (a) => a.toLowerCase() === walletAddress.toLowerCase()
                                  );
                                  return (
                                    <button
                                      key={emoji}
                                      onClick={() => handleReact(msg.id, emoji)}
                                      className={`w-8 h-8 flex items-center justify-center text-sm rounded-lg transition-colors ${
                                        isActive ? 'bg-white/15 ring-1 ring-white/30' : 'hover:bg-zinc-700'
                                      }`}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                                <MoreReactionsButton
                                  onPick={(emoji) => handleReact(msg.id, emoji)}
                                  reactions={msg.reactions}
                                  viewerAddress={walletAddress}
                                />
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                    </div>
                  </div>
                  </SwipeReplyRow>
                );
                })();
                if (unreadAnchor?.id !== msg.id || searchQuery.trim()) return row;
                return (
                  <Fragment key={`unread-${msg.id}`}>
                    <UnreadMarker count={unreadAnchor.count} />
                    {row}
                  </Fragment>
                );
              })}
              </>
            )}
            {adminThinking && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 px-3"
              >
                <img src={assistantAvatar} alt={_copy("copy.d544dcff425e", { defaultValue: "AI Admin" })} className="w-7 h-7 rounded-lg shrink-0 mt-0.5" />
                <div className="mt-1 rounded-2xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-3 py-2 inline-flex items-center gap-1.5 text-white/80 text-xs">
                  <Sparkles className="w-3 h-3 animate-pulse" />
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1 h-1 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: '240ms' }} />
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />

          </div>

          {/* Jump control, same as DMs: up to the unread marker until it has
              been seen, then down to the newest line, with the count of
              unread lines still below. */}
          {(() => {
            const up = !!unreadAnchor && !unreadMarkerSeen && unreadMarkerAbove;
            return (
              <UnreadJumpButton
                show={up || showJumpToLatest || newMessageCount > 0 || isHistoryWindow}
                up={up}
                count={Math.max(linesBelow, unreadBelow + newMessageCount)}
                onClick={up ? jumpToUnreadMarker : () => void scrollToBottom()}
                className="absolute bottom-3 right-3 z-10"
              />
            );
          })()}
        </div>
      </SharedTranslationContext.Provider>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-1.5 mx-1 mb-1 px-2 py-1 bg-zinc-800/70 rounded-lg">
          <Reply className="w-3.5 h-3.5 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-white">
              {replyTo.display_name || replyTo.username || _copy("copy.b512d97e7cbf", { defaultValue: "User" })}
            </span>
            <p className="text-[10px] text-zinc-400 truncate">{replyTo.content || _copy("copy.d357175cfe89", { defaultValue: "Media" })}</p>
          </div>
          <button onClick={() => setReplyTo.complete(replyTo, null)} className="flex-shrink-0 p-0.5 text-zinc-500 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input area */}
      {!isMember && membershipLoading && isAuthenticated ? (
        // Same height as the join bar, empty: a member must never see
        // "Join this community" flash while their row is still loading.
        <div className="px-1 py-3" data-composer-pending aria-hidden>
          <div className="h-[46px]" />
        </div>
      ) : !isMember ? (
        <div className="px-1 py-3">
          <button
            onClick={() => {
              if (!isAuthenticated) { openLoginModal(); return; }
              if (membership?.status !== 'pending') onJoin?.();
            }}
            disabled={joining}
            className="disabled:opacity-50 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 text-sm hover:text-white transition-colors"
          >
            <LogIn className="w-4 h-4" />
            {t('communities.joinToChat')}
          </button>
        </div>
      ) : composerNotice ? (
        <div className="px-1 py-3">
          <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-500 text-sm text-center px-3">
            {composerNotice.icon}
            <span>{composerNotice.text}</span>
          </div>
        </div>
      ) : (
        <div className="px-1 py-2">
          {slowModeApplies && (
            <p className="text-zinc-500 text-xs px-1 pb-1">
              {t('communities.chat.slowMode', {
                defaultValue: 'Slow mode: one message every {{interval}}',
                interval: humanisedInterval,
              })}
            </p>
          )}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <div className="relative">
              <span className="absolute top-1 right-0 text-[10px] text-zinc-600 z-10">{newMessage.length}/500</span>
              <Textarea
                ref={textareaRef}
                placeholder={_copy("copy.8cbff9ea966c", { defaultValue: "Type here..." })}
                value={newMessage}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.length <= 500) {
                    setNewMessage(val);
                    mention.handleInput(val, e.target.selectionStart);
                  }
                  const ta = e.target;
                  requestAnimationFrame(() => {
                    ta.style.height = 'auto';
                    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
                  });
                }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                maxLength={500}
                className="chat-text-input min-h-[36px] max-h-32 resize-none text-sm bg-transparent border-none text-white placeholder:text-zinc-500 p-0 pt-1 pr-12 focus-visible:ring-0 focus-visible:ring-offset-0 leading-[1.35]"
                rows={1}
                style={{ fieldSizing: 'content' } as React.CSSProperties}
              />
              <UserMentionDropdown
                query={mention.query}
                isOpen={mention.isOpen}
                position={mention.position}
                selectedIndex={mention.selectedIndex}
                onSelectedIndexChange={mention.setSelectedIndex}
                onSelect={mention.handleSelect}
                onClose={mention.handleClose}
              />
            </div>
            <div className="flex items-center justify-end pt-1">
              <ChatTextSizeButton className="mr-auto" />
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setNewMessage(prev => {
                      if (/^\/admin\b/i.test(prev)) return prev;
                      const next = prev.trim().length ? `/admin ${prev}` : '/admin ';
                      return next.slice(0, 500);
                    });
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  title={_copy("copy.aeec090ec6e7", { defaultValue: "Ask AI Admin (/admin)" })}
                  aria-label={_copy("copy.5a5c6c721e7a", { defaultValue: "Ask AI Admin" })}
                >
                  <Sparkles className="w-5 h-5" />
                </Button>
                {canSendMedia && (
                  <>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept={PUBLIC_CHAT_IMAGE_TYPES.join(',')}
                      className="hidden"
                      data-community-chat-image-input
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void handleImageFile(file);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      data-community-chat-attach
                      onClick={() => { if (!isAuthenticated) { openLoginModal(); return; } imageInputRef.current?.click(); }}
                      disabled={imageUploading || slowModeRemaining > 0}
                      className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                      title={t('communities.chat.sendPhoto', { defaultValue: 'Send a photo' })}
                      aria-label={t('communities.chat.sendPhoto', { defaultValue: 'Send a photo' })}
                    >
                      {imageUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                    </Button>
                    <EmojiGifPicker
                      onEmojiSelect={handleEmojiSelect}
                      onGifSelect={handleGifSelect}
                    />
                    <VoiceRecorder
                      onRecordingComplete={handleVoiceRecordingComplete}
                      disabled={!isAuthenticated}
                    />
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSend}
                  disabled={!newMessage.trim() || slowModeRemaining > 0}
                  className={`h-8 text-zinc-400 hover:text-white hover:bg-zinc-700 ${slowModeRemaining > 0 ? 'w-auto min-w-8 px-1.5' : 'w-8'}`}
                  title={slowModeRemaining > 0
                    ? t('communities.chat.slowModeWait', {
                        defaultValue: 'Slow mode — wait {{time}}',
                        time: formatCountdown(slowModeRemaining),
                      })
                    : t('communities.chat.send', { defaultValue: 'Send' })}
                  aria-label={t('communities.chat.send', { defaultValue: 'Send' })}
                >
                  {slowModeRemaining > 0
                    ? <span className="text-[11px] tabular-nums">{formatCountdown(slowModeRemaining)}</span>
                    : <Send className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ChatHoldSheet
        open={!!held}
        onOpenChange={(open) => { if (!open) setHeld(null); }}
        anchor={held?.el ?? null}
        quickReactions={isAuthenticated && isMember ? QUICK_CHAT_REACTIONS.slice(0, 6) : null}
        mine={reactedByMe(held?.msg)}
        onReact={(emoji) => { if (held) handleReact(held.msg.id, emoji); }}
        actions={lineActions(held?.msg, true).map(({ hint: _hint, divided: _divided, ...a }) => a as ChatHoldAction)}
        reactors={held?.msg.reactions ? { reactions: held.msg.reactions } : null}
      />
      {menuMounted && (
        <MessageMenu
          point={menu?.point ?? null}
          onClose={() => setMenu(null)}
          quickReactions={isAuthenticated && isMember ? QUICK_CHAT_REACTIONS : null}
          mine={reactedByMe(menu?.msg)}
          onReact={(emoji) => { if (menu) handleReact(menu.msg.id, emoji); }}
          actions={lineActions(menu?.msg, false).map(({ prime: _prime, secondary: _secondary, ...a }) => a)}
          reactors={menu?.msg.reactions ? { reactions: menu.msg.reactions } : null}
          meta={menu ? messageMenuMeta(menu.msg.created_at, !!menu.msg.edited_at) : null}
        />
      )}
      <DeleteMessageDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open && !deletePending) setDeleteTarget(null); }}
        canDeleteForEveryone={!!deleteTarget && (canDeleteAnyMessage || (!!walletAddress && deleteTarget.wallet_address?.toLowerCase() === walletAddress.toLowerCase()))}
        onDelete={(scope) => { void handleConfirmDelete(scope); }}
      />
      <MemberActionsDialog
        community={community}
        membership={membership}
        target={memberActions}
        open={!!memberActions}
        onOpenChange={(v) => { if (!v) setMemberActions(null); }}
        onEditRights={() => setMemberActions(null)}
      />
    </div>
  );
}
