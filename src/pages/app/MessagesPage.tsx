import { useTranslation as _useCopy } from 'react-i18next';
import { clearPendingChatLink, peekPendingChatLink, toastNotInLinkedChat } from '@/lib/chat-message-link';
import { UnreadCountChip } from '@/components/app/chat/UnreadCountChip';
import { ReactionAlertBadge, reactionAlertLine } from '@/components/app/chat/ReactionAlertBadge';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { AppState } from '@/components/app/AppState';
import { IslandAction, PageIsland, usePhonePill } from '@/components/app/page-kit/PageKit';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { PULL_REFRESH_THRESHOLD } from '@/lib/pill-pull-motion';
import { DhbCoin } from '@/components/app/DhbAmount';
import { lazy, Suspense, useState, useEffect, useRef, useCallback, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import CloseIcon from '@/components/ui/cut-icons/close';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from "lucide-react";
import RefreshCw from "@/components/ui/cut-icons/refresh";
import Trash2 from "@/components/ui/cut-icons/delete";
import Ban from "@/components/ui/cut-icons/blocked";

import Search from "@/components/ui/cut-icons/search";
import Plus from "@/components/ui/cut-icons/add";
import MessageCircle from "@/components/ui/cut-icons/message-envelope";
import Fullscreen from "@/components/ui/cut-icons/fullscreen";
import { FullScreenChatShell } from '@/components/app/chat/FullScreenChatShell';
import { ChatTextSizeButton } from '@/components/app/chat/ChatTextSizeButton';
import { PhoneChatListTop } from '@/components/app/chat/PhoneChatListTop';
import { ChatIconButton, ChatListTop } from '@/components/app/chat/FullScreenChatChrome';
import { ChatRowContextMenu, type ChatOptionsHandlers } from '@/components/app/chat/ChatOptionsMenu';
import { isArchived, isMuted, useChatPrefs, useClearChatHistory } from '@/hooks/use-chat-prefs';
import { PUBLIC_CHAT_PREF_ID, roomChatId, type ChatPref, type ChatReactionSummary } from '@/lib/api/dehub/chat-prefs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Archive, BellOff, Pin, ChevronLeft, ListChecks } from 'lucide-react';
import { BulkChatBar } from '@/components/app/chat/BulkChatBar';
import { useRowLongPress } from '@/hooks/use-row-long-press';
import { MessageRequestsHeader, MessageRequestsRow } from '@/components/app/chat/MessageRequestBar';
import { MessagesNavGlyph } from '@/components/app/navigation/MessagesNavGlyph';
import '@/styles/messages-cards.css';
import { useFeedSeparator } from '@/lib/feed-separator';

import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { collapseChat, cameFromPanel } from '@/lib/chat-expand';
import { PublicChat, DirectMessageChat, NewConversationModal, NewMessageSelector } from '@/components/app/chat';
import { NewMessageDrawer, type NewMessageDrawerHandle } from '@/components/app/chat/NewMessageDrawer';
import { flushSync } from 'react-dom';
import { OnlineDot } from '@/components/app/chat/OnlineDot';

import { useAuth } from '@/contexts/AuthContext';
import { usePublicChatReading, usePublicChatUnreadCount } from '@/hooks/use-public-chat-unread';
import { AuthGate } from '@/components/app/AuthGate';
import { useConversations, useCreateConversation, useUserSearchForDM, useDeleteConversation } from '@/hooks/use-messages';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getMediaUrl, getAccountInfo, type DeHubConversation, type DeHubUser } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath, storageImage } from '@/lib/media-url';
import { useChatTabs } from '@/hooks/use-chat-tabs';
import { CHAT_DRAG_TYPE, ChatTabBar, ChatTabDeleteConfirm, ChatTabEditor, ChatTabEmpty, ChatTabsManager, type TabCandidate } from '@/components/app/chat/ChatTabs';
import { PUBLIC_CHAT_TAB_ID } from '@/lib/api/dehub/chat-tabs';
import { formatDistanceToNow } from 'date-fns';
import { formatTimeAgo } from '@/lib/feed-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgedName } from '@/components/app/BadgedName';
import { useDMRealtime } from '@/hooks/use-dm-realtime';
import { conversationIdentity } from '@/lib/conversation-identity';
import { encryptedMediaLabel } from '@/lib/dm-e2ee/media-label';
import { useDraftText } from '@/hooks/use-draft';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { showUndoToast } from '@/components/ui/undo-toast';
import { scheduleDelete, undoDelete, usePendingDeletes, UNDO_WINDOW_MS } from '@/lib/undoable-delete';
import { useKeyboardOpen, useVisualViewportBox } from '@/hooks/use-keyboard-open';
import { emitSendMessage, onConversationDeleted, waitForDmSocket } from '@/lib/api/dehub/dm-socket';
import { DeleteMessageDialog, type DeleteScope } from '@/components/app/chat/DeleteMessageDialog';
import { usePublicChatLastLine, useRoomChatSummaries } from '@/hooks/use-room-chat-summaries';
import { roomPreviewLine } from '@/lib/room-chat-read';
import { prepareOutgoing } from '@/lib/dm-e2ee/keys';
import chatBubbleIcon from '@/assets/icons/chat-bubble.webp';
import messagesBubbleIcon from '@/assets/icons/messages-3d-icon.webp';
import dehubLogo from '@/assets/dehub-logo.png';
import { SEOHead } from '@/components/SEOHead';
import { blockUser } from '@/lib/api/dehub/blocks';
import { toast } from 'sonner';
import { NotesSheetHost, openNotesSheet } from '@/components/app/chat/NotesRow';
import { LiveRipple } from '@/components/app/LiveRipple';
import { NewGroupChannelSheet, type NewChatKind } from '@/components/app/chat/NewGroupChannelSheet';
import { GroupChatRow } from '@/components/app/chat/GroupChatRow';
import { ChatPinStrip } from '@/components/app/chat/ChatPinStrip';
import { ChatSearchDiscover } from '@/components/app/chat/ChatSearchDiscover';
import { useUserCommunities, type Community } from '@/hooks/use-communities';
import { chatsFromMemberships } from '@/lib/community-kinds';
import { insertCommunityChatMessage } from '@/lib/community-chat-send';
import { reportCommunityChatMessage } from '@/lib/community-chat-notify';
import { previewLinks } from '@/lib/dehub-links';

import { formatCount } from '@/lib/format-count';
/**
 * The other person's name with their badge sitting on its baseline, the same
 * BadgedName system the feed uses. The badge rides straight after the name
 * (before the online dot) so it reads as part of the name.
 */
function ConversationName({ user, children }: { user?: DeHubUser; children: React.ReactNode }) {
  return (
    <BadgedName
      badgeBalance={user?.badgeBalance}
      badgeLock={user?.badgeLock}
      username={user?.username}
      lookupId={user ? user.username || user.address || user.wallet_address : null}
      className="font-semibold text-white"
    >
      {children}
    </BadgedName>
  );
}

function ConversationsSkeleton() {
  return (
    <div className="space-y-1">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="w-12 h-12 rounded-lg bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32 bg-white/[0.06]" />
            <Skeleton className="h-3 w-48 bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationItem({
  conversation,
  onClick,
  isSelected,
  onDelete,
  onBlock,
  pref,
  selecting = false,
  checked = false,
  onLongPress,
  compactTime = false,
  reactions,
}: {
  conversation: DeHubConversation;
  onClick: (e: React.MouseEvent) => void;
  isSelected: boolean;
  onDelete: (conversation: DeHubConversation) => void;
  onBlock: (conversation: DeHubConversation) => void;
  /** Your own pin / mute / marked-unread for this chat (full-screen chat). */
  pref?: ChatPref;
  /** Picking several chats: each row shows a tick circle and a click toggles it. */
  selecting?: boolean;
  checked?: boolean;
  /** Phones: holding the row starts picking (or toggles it while picking). */
  onLongPress?: () => void;
  /** Computers' card inbox: short times (4m, 2h, 3d). */
  compactTime?: boolean;
  /** Reactions to your messages here that you haven't seen yet. */
  reactions?: ChatReactionSummary | null;
}) {
  const { t: _copy } = _useCopy();
  const hold = useRowLongPress(onLongPress);
  const { t } = useTranslation();
  const otherUser = conversation.otherUser || conversation.participants?.[0];
  const avatarUrl = buildAvatarUrl(otherUser?.address || '', otherUser?.avatarImageUrl || otherUser?.avatarUrl);
  const displayName = otherUser?.displayName || otherUser?.display_name || '';
  const username = otherUser?.username || '';
  const fallbackName = displayName || username ||
    (otherUser?.address ? `${otherUser.address.slice(0, 6)}...${otherUser.address.slice(-4)}` : 'User');
  const lastMessagePreview = conversation.lastMessage?.undecryptable
    ? `🔒 ${t('messages.cannotDecrypt')}`
    : (conversation.lastMessage?.content && previewLinks(conversation.lastMessage.content)) || _copy("copy.f42e0f66017d", { defaultValue: "No messages yet" });
  const lastMessageTime = conversation.lastMessage?.createdAt
    ? (compactTime
      ? formatTimeAgo(conversation.lastMessage.createdAt)
      : formatDistanceToNow(new Date(conversation.lastMessage.createdAt), { addSuffix: false }))
    : '';

  // An unsent message left in this thread's composer. Shown in place of the
  // last message, the way every mail and chat client does it — a draft nobody
  // can see from the list is indistinguishable from a draft that was lost.
  const draft = useDraftText(conversationIdentity(conversation));
  // A reaction newer than the last message takes the preview line, so
  // "Reacted ❤️ to your message" reads at a glance instead of a bare dot.
  const reactionLine = reactions && (!conversation.lastMessage?.createdAt
    || new Date(reactions.last.at).getTime() >= new Date(conversation.lastMessage.createdAt).getTime())
    ? reactionAlertLine(t, reactions, { named: false })
    : null;

  return (
    <SwipeableRow
      actions={[
        {
          key: 'block',
          label: t('profileOptions.block'),
          icon: <Ban className="w-4 h-4" />,
          className: 'bg-zinc-700',
          onSelect: () => onBlock(conversation),
        },
        {
          key: 'delete',
          label: t('common.delete'),
          icon: <Trash2 className="w-4 h-4" />,
          className: 'bg-red-600',
          onSelect: () => onDelete(conversation),
          destructive: true,
        },
      ]}
    >
    <button
      onClick={(e) => { if (hold.consumeClick()) return; onClick(e); }}
      {...hold.handlers}
      data-chat-list-row
      data-selected={isSelected ? '' : undefined}
      data-unread={conversation.unreadCount > 0 || pref?.markedUnread || reactions ? '' : undefined}
      data-bulk-checked={selecting ? (checked ? 'true' : 'false') : undefined}
      aria-pressed={selecting ? checked : undefined}
      className={`w-full flex items-center gap-3 p-4 border-t border-white/[0.07] hover:bg-white/[0.04] transition-colors text-left ${
        (selecting ? checked : isSelected) ? 'bg-white/[0.07]' : ''
      }`}
    >
      {selecting && (
        <span
          data-bulk-tick
          aria-hidden="true"
          style={checked ? { background: 'hsl(var(--foreground))', borderColor: 'hsl(var(--foreground))' } : { borderColor: 'hsl(var(--foreground) / 0.35)' }}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
            checked ? '' : 'border-white/30 text-transparent'
          }`}
        >
          {checked && <span className="block h-[6px] w-[10px] -translate-y-px -rotate-45 border-b-2 border-l-2" style={{ borderColor: 'hsl(var(--background))' }} />}
        </span>
      )}
      <LiveRipple ids={[otherUser?.address, otherUser?.username]} className="relative rounded-lg">
        <Avatar className="w-12 h-12">
          {avatarUrl && <AvatarImage src={avatarUrl} />}
          <AvatarFallback className="bg-zinc-700 text-white font-medium">
            {(fallbackName.startsWith('0x') ? fallbackName.charAt(2) : fallbackName.charAt(0)).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </LiveRipple>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 min-w-0">
            {displayName ? (
              <>
                <ConversationName user={otherUser}>{displayName}</ConversationName>
                <OnlineDot address={otherUser?.address} />
                {username && <span className="text-zinc-500 text-sm truncate">@{username}</span>}
              </>
            ) : (
              <>
                <ConversationName user={otherUser}>{fallbackName}</ConversationName>
                <OnlineDot address={otherUser?.address} />
              </>
            )}
          </span>
          {lastMessageTime && (
            <span className="text-zinc-500 text-sm ml-auto flex-shrink-0 tabular-nums">{lastMessageTime}</span>
          )}
          {pref && isMuted(pref) && <BellOff data-chat-row-muted aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
          {pref?.pinnedAt && <Pin data-chat-row-pinned aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rotate-45 text-zinc-500" />}
          {pref?.markedUnread && !(conversation.unreadCount > 0) && !reactions && (
            <span data-count-badge data-chat-row-marked-unread aria-label="Unread" className="ml-1 h-2.5 w-2.5 shrink-0 rounded-[3px] bg-white" />
          )}
          {/* Count rides in the name row rather than welded to the avatar corner,
              matching the mobile app. White-on-near-black instead of red-500:
              the palette has no colour in it, and Osaka/Jungle still repaint
              this through [data-count-badge]. */}
          <ReactionAlertBadge reactions={reactions} rowKey={`dm:${conversation.id}`} className="ml-0.5" />
          <UnreadCountChip count={conversation.unreadCount} className="ml-0.5" />
        </div>
        {draft ? (
          <p className="text-sm truncate text-white">
            <span className="font-medium">{_copy("copy.9565c5e214a4", { defaultValue: "Draft: " })}</span>
            {draft}
          </p>
        ) : reactionLine ? (
          <p data-reaction-alert-line className="text-sm truncate text-white font-bold">{reactionLine}</p>
        ) : (
          <p className={`text-sm truncate text-white ${conversation.unreadCount > 0 ? 'font-bold' : 'font-normal'}`}>
            {conversation.lastMessage?.encMedia
              ? encryptedMediaLabel(conversation.lastMessage.encMedia, _copy) :
             conversation.lastMessage?.type === 'image' ? _copy("copy.1b13ff986443", { defaultValue: "📷 Photo" }) :
             conversation.lastMessage?.type === 'gif' ? _copy("copy.fd0ce9669a4e", { defaultValue: "🎞️ GIF" }) :
             lastMessagePreview}
          </p>
        )}
      </div>
    </button>
    </SwipeableRow>
  );
}

/**
 * `fullscreen` is riftn.com/chat: the same inbox with nothing else on screen,
 * the list and the open chat side by side on a computer, and the cozy thread
 * layout (grouped bubbles, day pills, wallpaper). See FullScreenChatShell.
 */
// Settings open inside the full-screen chat (computers) rather than leaving it.
const EmbeddedSettings = lazy(() => import('@/pages/app/SettingsPage'));
// Group, channel and community chats: the community chat itself, loaded on first open.
const RoomChatPane = lazy(() => import('@/components/app/chat/RoomChatPane').then(m => ({ default: m.RoomChatPane })));
// Phones on /chat: the app's bottom nav pill (already loaded by the app shell).
const MobileBottomNav = lazy(() => import('@/components/app/MobileBottomNav').then(m => ({ default: m.MobileBottomNav })));

/** A group is found by its name or its @name (the slug in its link). Requests 483e1e5f. */
function groupMatchesSearch(c: { name: string; slug?: string | null }, query: string) {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  return c.name.toLowerCase().includes(q) || (c.slug || '').toLowerCase().includes(q);
}

export default function MessagesPage({ fullscreen = false }: { fullscreen?: boolean } = {}) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const location = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<DeHubConversation | null>(null);
  const [showPublicChat, setShowPublicChat] = useState(false);
  // A group, channel or community chat open in place (same chat as the
  // community page's Chat tab).
  const [selectedRoom, setSelectedRoom] = useState<Community | null>(null);
  // A conversation open on mobile reclaims the bottom-nav zone as well as the
  // header zone: the reply strip (orb flanked by two drafts) lives in that
  // band until the composer takes focus and the keyboard takes it instead.
  const chatOpen = !!selectedConversation || showPublicChat || !!selectedRoom;
  // The inbox scrolls behind the floating nav. Reserve its clearance inside
  // the list, so a viewport-height gap cannot paint a strip behind the pill.
  const keyboardOpen = useKeyboardOpen();
  const mobileChatHeight = 'h-[calc(100dvh_-_var(--app-top-bar))]';
  // dvh only tracks the keyboard on Android (interactive-widget) — iOS keeps
  // the layout viewport full-size and just covers it. Sizing to the measured
  // visual viewport keeps the composer above the keyboard on both. On iOS,
  // Safari additionally PANS the page to chase the focused input (offsetTop
  // > 0), shoving the chat off the top and leaving a dead gap above the
  // keyboard — when that happens, pin the chat over the visible area instead:
  // position:fixed anchors to the layout viewport, so top = offsetTop lands
  // exactly on the visual viewport. Android never pans (offsetTop stays 0),
  // so its in-flow layout is untouched.
  const { height: vvHeight, offsetTop: vvOffsetTop } = useVisualViewportBox(keyboardOpen);
  const keyboardStyle: CSSProperties | undefined = keyboardOpen && vvHeight
    ? vvOffsetTop > 1
      ? { position: 'fixed', top: vvOffsetTop, left: 0, right: 0, height: vvHeight, zIndex: 40, background: '#000' }
      // The chat starts under the top bar, which is 0 on a phone now: taking a
      // fixed 44px off left a dead band between the composer and the keys.
      : { height: `calc(${vvHeight}px - var(--app-top-bar))` }
    : undefined;
  const [showMessageSelector, setShowMessageSelector] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  // Phones: the + opens the New message drawer directly, keyboard up.
  const [showNewMessageDrawer, setShowNewMessageDrawer] = useState(false);
  const newMessageDrawerRef = useRef<NewMessageDrawerHandle>(null);
  // The chat opened from that drawer, whose composer takes the caret on arrival.
  const [composerFocusFor, setComposerFocusFor] = useState<string | null>(null);
  const [newChatKind, setNewChatKind] = useState<NewChatKind | null>(null);
  const { data: myMemberships } = useUserCommunities();
  
  const [searchQuery, setSearchQuery] = useSurfaceDraft("pages/app/MessagesPage.tsx:searchQuery", '');
  const phonePill = usePhonePill();
  // Both search-backed queries key on the query string — passing the raw
  // input fired 2 network requests per KEYSTROKE (each prefix a fresh cache
  // key). Debounce to one request pair per pause in typing.
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  // Your own pins, archives, mutes, "marked unread" and Show in Chats, for DMs
  // and for group/channel/community chats alike.
  const { byId: chatPrefs, update: updateChatPref, seeReactions } = useChatPrefs();
  const groupChats = chatsFromMemberships(myMemberships, id => !!chatPrefs.get(roomChatId(id))?.listedAt).filter(c =>
    !searchQuery.trim() || groupMatchesSearch(c, searchQuery));
  const { isAuthenticated, walletAddress, user, isLoading: authLoading, openLoginModal } = useAuth();
  const guest = !authLoading && !isAuthenticated;

  // Subscribe to DM realtime updates only when on messages page
  useDMRealtime();

  const{
    conversations,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useConversations(debouncedSearchQuery);

  // Phones: pull the chat list down from its top to refresh it.
  const chatListRef = useRef<HTMLDivElement>(null);
  const chatPullRef = useRef<HTMLDivElement>(null);
  const showChatPull = useCallback((distance: number) => {
    const list = chatListRef.current;
    if (!list) return;
    list.style.setProperty('--chat-pull', `${Math.max(0, distance)}px`);
    list.style.setProperty('--chat-pull-p', String(Math.min(1, Math.max(0, distance) / PULL_REFRESH_THRESHOLD)));
    list.style.setProperty('--chat-pull-o', String(Math.min(1, Math.max(0, distance) / 28)));
  }, []);
  const chatPull = usePullToRefresh({
    enabled: phonePill,
    pullThreshold: PULL_REFRESH_THRESHOLD,
    onRefresh: () => { void refetch(); },
    isRefreshing: isRefetching,
    containerRef: chatListRef,
    motionRef: chatPullRef,
    onMotion: showChatPull,
  });

  const createConversation = useCreateConversation();

  // Signed out on a computer, the public room is open beside the list rather
  // than an empty "Pick a chat" pane: it is the one chat they can read.
  useEffect(() => {
    if (fullscreen && guest && !phonePill) setShowPublicChat(true);
  }, [fullscreen, guest, phonePill]);

  const openNewMessage = useCallback(() => {
    if (guest) { openLoginModal({ path: '/chat?chat=public' }); return; }
    const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    if (!phone) {
      setShowMessageSelector(true);
      return;
    }
    // Inside the tap, so iOS lets the keyboard come up with the drawer.
    newMessageDrawerRef.current?.primeKeyboard();
    setShowNewMessageDrawer(true);
  }, [guest, openLoginModal]);

  /**
   * A person picked in the drawer: open the chat in place right away (a thread
   * you have never had starts as the usual virtual `new_0x…` one, which the
   * chat creates on the server itself), then let the drawer slide away and
   * hand the caret to the composer while the keyboard is still up.
   */
  const pickFromDrawer = useCallback((user: DeHubUser) => {
    const addr = (user.address || '').toLowerCase();
    if (!addr) return;
    const existing = conversations?.find(c => c.otherUser?.address?.toLowerCase() === addr);
    const now = new Date().toISOString();
    const conv: DeHubConversation = existing ?? {
      id: `new_${addr}`,
      participants: [user],
      otherUser: user,
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
    } as DeHubConversation;
    setComposerFocusFor(conversationIdentity(conv));
    flushSync(() => setSelectedConversation(conv));
    window.setTimeout(() => {
      setShowNewMessageDrawer(false);
      requestAnimationFrame(() => {
        const box = document.querySelector<HTMLTextAreaElement>('[data-chat-composer-input]');
        box?.focus({ preventScroll: true });
      });
    }, 60);
  }, [conversations]);
  const { data: userSearchResults, isLoading: isSearchingUsers } = useUserSearchForDM(debouncedSearchQuery);

  /*
   * Until now deleting a thread meant opening it first and going through its
   * menu. The row's left swipe does it from the list, as Mail and Messages do.
   */
  const deleteConversationMutation = useDeleteConversation();
  const pendingDeletes = usePendingDeletes();

  // The row is gone the moment it is swiped away, with Undo in the toast; the
  // real delete runs when that window closes. A swipe is one careless thumb
  // away, and a confirm dialog after every one defeats the point of swiping.
  // Swiping a chat away asks first: Delete for me, Delete for both (1:1
  // chats), or Cancel. The same pop-up as deleting a message.
  const [confirmChatDelete, setConfirmChatDelete] = useState<DeHubConversation | null>(null);
  const handleDeleteConversation = useCallback((conv: DeHubConversation) => {
    setConfirmChatDelete(conv);
  }, []);
  const deleteConversationNow = useCallback((conv: DeHubConversation, scope: DeleteScope) => {
    setSelectedConversation(prev => (prev?.id === conv.id ? null : prev));
    scheduleDelete(conv.id, () =>
      deleteConversationMutation.mutate(scope === 'everyone' ? { id: conv.id, forEveryone: true } : conv.id, {
        onError: () => toast.error(t('messages.deleteConversationFailed')),
      }),
    );
    showUndoToast(t('toasts.conversation_deleted'), {
      id: `dm-delete-${conv.id}`,
      duration: UNDO_WINDOW_MS,
      undoLabel: t('common.undo'),
      closeLabel: t('common.close'),
      onUndo: () => undoDelete(conv.id),
    });
  }, [deleteConversationMutation, t]);

  // The other person deleted a 1:1 chat for both of you: drop it from the list.
  useEffect(() => onConversationDeleted((data) => {
    if (!data?.forEveryone) return;
    setSelectedConversation(prev => (prev?.id === data.dmId ? null : prev));
    void refetch();
  }), [refetch]);

  const liveConversations = (conversations || []).filter(c => !pendingDeletes.has(c.id));
  // First messages from people you don't follow wait under Requests. A search
  // looks through both, so a request is never unfindable.
  const [showRequests, setShowRequests] = useState(false);
  const requestConversations = liveConversations.filter(c => c.isRequest);
  const requestUnread = requestConversations.reduce((n, c) => n + (c.unreadCount || 0), 0);

  /*
   * Tabs above the list: All, Direct, Communities, Requests and the person's
   * own tabs (saved to their account). A search always looks through
   * everything, so the tabs step aside while one is typed.
   */
  const chatTabs = useChatTabs();
  const [activeTabRaw, setActiveTabRaw] = useState<string>(() => {
    try { return localStorage.getItem('riftn.chatTab') || 'all'; } catch { return 'all'; }
  });
  const setActiveTab = useCallback((id: string) => {
    setActiveTabRaw(id);
    try { localStorage.setItem('riftn.chatTab', id); } catch { /* private mode */ }
  }, []);
  // The same tabs on /chat and /app/messages, so both pages behave alike.
  const tabsOn = !guest && !searchQuery.trim();
  const activeTabView = chatTabs.tabs.find(x => x.id === activeTabRaw && !x.hidden);
  const activeTab = tabsOn && activeTabView ? activeTabView.id : 'all';
  const customTab = activeTabView && !activeTabView.builtin && tabsOn ? activeTabView : null;
  const requestsTabShown = !chatTabs.tabs.find(x => x.id === 'requests')?.hidden;
  const [tabEditor, setTabEditor] = useState<{ id?: string; preset?: string[] } | null>(null);
  const [tabManager, setTabManager] = useState(false);
  const [tabDelete, setTabDelete] = useState<string | null>(null);

  const requestsMode = showRequests || activeTab === 'requests';
  const inRequests = requestsMode && !searchQuery.trim();
  const visibleConversations = searchQuery.trim()
    ? liveConversations
    : requestsMode
      ? requestConversations
      : liveConversations.filter(c => !c.isRequest);

  const handleBlockConversationUser = useCallback(async (conv: DeHubConversation) => {
    const user = conv.otherUser || conv.participants?.[0];
    if (!user?.address) return;
    try {
      await blockUser(user.address, 'Blocked from message list');
      toast.success(_copy("copy.2b7bd96d731a", { defaultValue: "User blocked" }));
    } catch {
      toast.error(_copy("copy.d2b91e7b896f", { defaultValue: "Failed to block user" }));
    }
  }, [_copy]);

  // Any computer: your own pins, archive, mutes and "marked unread", plus
  // the right-click menu on every row.
  const richList = !phonePill;
  // /app/messages: every chat is its own glass card, with All / Unread /
  // Groups / Requests (/ Archived) tabs: in the header pill on computers, in
  // a row at the top of the list on phones.
  const cards = !fullscreen;
  const plainList = useFeedSeparator() === 'line' && cards;
  const deskCards = cards && !phonePill;
  const clearHistory = useClearChatHistory();
  const [showArchived, setShowArchived] = useState(false);
  // The last request was accepted or deleted: nothing left to show here.
  const noRequestsLeft = requestConversations.length === 0;
  useEffect(() => { if (noRequestsLeft) setShowRequests(false); }, [noRequestsLeft]);
  // The Requests tab hides itself once it is empty, so leave it for All.
  useEffect(() => {
    if (noRequestsLeft && !isLoading && activeTabRaw === 'requests') setActiveTab('all');
  }, [noRequestsLeft, isLoading, activeTabRaw, setActiveTab]);
  const [showSettings, setShowSettings] = useState(false);
  // Opening any chat puts settings away.
  useEffect(() => {
    if (selectedConversation || showPublicChat || selectedRoom) setShowSettings(false);
  }, [selectedConversation, showPublicChat, selectedRoom]);
  const [clearTarget, setClearTarget] = useState<DeHubConversation | null>(null);
  const lastActivity = (c: DeHubConversation) => c.lastMessage?.createdAt || c.updatedAt;
  const archivedConversations = visibleConversations.filter(c => isArchived(chatPrefs.get(c.id), lastActivity(c)));
  const pinnedAt = (c: DeHubConversation) => {
    const at = chatPrefs.get(c.id)?.pinnedAt;
    return at ? new Date(at).getTime() : 0;
  };
  const otherConversations = visibleConversations.filter(c => !isArchived(chatPrefs.get(c.id), lastActivity(c)));
  const phoneSearch = phonePill && !!searchQuery.trim();
  const listedConversations = phoneSearch ? visibleConversations : showArchived ? archivedConversations
    : richList ? otherConversations.sort((a, b) => pinnedAt(b) - pinnedAt(a)) : otherConversations;
  // Group, channel and community chats share the same settings, keyed by
  // community id: archived ones move under Archived chats, pinned ones go first.
  const roomPref = (c: { id: string }) => chatPrefs.get(roomChatId(c.id));
  const roomPinnedAt = (c: { id: string }) => {
    const at = roomPref(c)?.pinnedAt;
    return at ? new Date(at).getTime() : 0;
  };
  const archivedRooms = groupChats.filter(c => isArchived(roomPref(c)));
  const otherRooms = groupChats.filter(c => !isArchived(roomPref(c)));
  const listedRooms = phoneSearch ? groupChats : showArchived ? archivedRooms
    : richList ? otherRooms.sort((a, b) => roomPinnedAt(b) - roomPinnedAt(a)) : otherRooms;
  // "Add to tab" in a chat's menu.
  const tabMenuFor = (chatId: string): Pick<ChatOptionsHandlers, 'tabs' | 'onToggleTab' | 'onNewTabWith'> => (guest ? {} : {
    tabs: chatTabs.tabs.filter(x => !x.builtin).map(x => ({ id: x.id, name: x.name, emoji: x.emoji, has: x.chats.includes(chatId) })),
    onToggleTab: (tabId) => {
      const tab = chatTabs.tabs.find(x => x.id === tabId);
      if (!tab) return;
      const had = tab.chats.includes(chatId);
      void chatTabs.toggleChat(tabId, chatId);
      toast.success(had
        ? _copy('chatTabs.removedFrom', { defaultValue: 'Removed from {{name}}', name: tab.name })
        : _copy('chatTabs.addedTo', { defaultValue: 'Added to {{name}}', name: tab.name }));
    },
    onNewTabWith: () => setTabEditor({ preset: [chatId] }),
  });
  // Which chats the open tab shows.
  const convInTab = (c: DeHubConversation) =>
    activeTab === 'communities' ? false : customTab ? customTab.chats.includes(c.id) : true;
  const roomInTab = (c: { id: string }) =>
    activeTab === 'direct' ? false : customTab ? customTab.chats.includes(roomChatId(c.id)) : true;
  const publicInTab = activeTab === 'direct' || activeTab === 'communities' ? false : customTab ? customTab.chats.includes(PUBLIC_CHAT_TAB_ID) : true;
  const roomOptionsFor = (c: (typeof groupChats)[number]): ChatOptionsHandlers => ({
    pref: roomPref(c),
    hasUnread: false,
    onPref: (patch) => updateChatPref(roomChatId(c.id), patch),
    onHideFromList: c.kind !== 'group' && c.kind !== 'channel'
      ? () => updateChatPref(roomChatId(c.id), { listed: false, pinned: false })
      : undefined,
    onSelectMany: () => setBulkIds(new Set([roomChatId(c.id)])),
    ...tabMenuFor(roomChatId(c.id)),
  });
  const openRoomChat = (c: (typeof groupChats)[number]) => {
    if (roomPref(c)?.markedUnread) updateChatPref(roomChatId(c.id), { unread: false });
    setSelectedConversation(null);
    setShowPublicChat(false);
    setSelectedRoom(c);
  };
  const archivedCount = archivedConversations.length + archivedRooms.length;
  // Newest line + unread number for each group row, and General Chat's newest line.
  const roomSummaries = useRoomChatSummaries(groupChats.map(c => c.id), isAuthenticated ? walletAddress : null);
  const publicLastLine = usePublicChatLastLine(isAuthenticated);
  const publicPreview = publicLastLine ? roomPreviewLine(publicLastLine, walletAddress || '', (key, options) => _copy(key, options)) : '';
  // Computer tabs: Unread keeps chats with something new (or marked unread),
  // Groups keeps group, channel and community chats only.
  const convHasUnread = (c: DeHubConversation) => (c.unreadCount || 0) > 0 || !!chatPrefs.get(c.id)?.markedUnread || !!chatPrefs.get(c.id)?.reactions;
  const roomHasUnread = (c: (typeof groupChats)[number]) => !!roomPref(c)?.markedUnread || !!roomPref(c)?.reactions || (roomSummaries[c.id]?.unread ?? 0) > 0;
  const publicReactions = chatPrefs.get(PUBLIC_CHAT_PREF_ID)?.reactions ?? null;
  const tabFilter = tabsOn && activeTab === 'unread' && !showArchived && !inRequests ? 'unread' : 'all';
  const shownConversations = tabFilter === 'unread' ? listedConversations.filter(convHasUnread) : listedConversations;
  const shownRooms = tabFilter === 'unread' ? listedRooms.filter(roomHasUnread) : listedRooms;
  // Glass, full screen on computers: pinned chats ride as bubbles above the list.
  const pinStrip = richList && fullscreen && !phonePill && !showArchived && !inRequests && !searchQuery.trim()
    ? listedConversations.filter(c => pinnedAt(c) > 0)
    : [];
  const chatOptionsFor = (conv: DeHubConversation): ChatOptionsHandlers => {
    const peer = (conv.otherUser || conv.participants?.[0])?.address;
    return {
      pref: chatPrefs.get(conv.id),
      // The server's unread count clears when the chat is opened; the menu
      // only flips your own "marked unread" flag.
      hasUnread: false,
      onPref: (patch) => updateChatPref(conv.id, patch),
      onOpenWindow: peer
        ? () => { window.open(`/chat?with=${encodeURIComponent(peer)}`, `riftn-chat-${conv.id}`, 'popup,width=520,height=780'); }
        : undefined,
      onToggleEncryption: conv.isGroup
        ? undefined
        : () => updateChatPref(conv.id, { encrypted: !chatPrefs.get(conv.id)?.encryptedAt }),
      onToggleTranslateOut: conv.isGroup || !/^[0-9a-f]{24}$/i.test(conv.id)
        ? undefined
        : () => updateChatPref(conv.id, { translateOut: !chatPrefs.get(conv.id)?.translateOutAt }),
      onBlock: () => handleBlockConversationUser(conv),
      onClearHistory: () => setClearTarget(conv),
      onDelete: () => handleDeleteConversation(conv),
      onSelectMany: () => setBulkIds(new Set([conv.id])),
      ...tabMenuFor(conv.id),
    };
  };

  // Picking several chats at once: right-click a chat and choose Select (or
  // Ctrl/Cmd-click one), then click others. null = not picking.
  const [bulkIds, setBulkIds] = useState<Set<string> | null>(null);
  const toggleBulk = (id: string) => setBulkIds(prev => {
    const next = new Set(prev ?? []);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // Switching layout, archive or requests, or Esc, ends picking. On phones a
  // hold on a chat starts it (there is no right-click there).
  useEffect(() => { setBulkIds(null); }, [richList]);
  useEffect(() => { setBulkIds(null); }, [showArchived, inRequests]);
  const picking = bulkIds !== null;
  const holdToPick = (id: string) => (picking ? toggleBulk(id) : setBulkIds(new Set([id])));
  /** The Select button in the list header: start picking with nothing ticked, or stop. */
  const togglePicking = () => setBulkIds(prev => (prev ? null : new Set()));
  /** Computers without the full-screen menu: a right-click on a row starts picking from it. */
  const rightClickPick = (id: string) => (e: ReactMouseEvent) => {
    if (richList || e.defaultPrevented) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) return;
    e.preventDefault();
    holdToPick(id);
  };
  // The phone list does not pin or show mutes, but a chat you marked
  // unread (here or on another device) still shows its marker.
  const unreadOnly = (p: ChatPref | undefined): ChatPref | undefined =>
    p?.markedUnread ? { ...p, pinnedAt: null, mutedUntil: null } : undefined;
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBulkIds(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking]);
  // Only chats still on screen count (one may have been deleted meanwhile).
  const bulkChats = picking ? liveConversations.filter(c => bulkIds.has(c.id)) : [];
  // Group, channel and community chats picked alongside (keyed by their settings id).
  const bulkRooms = picking ? groupChats.filter(c => bulkIds.has(roomChatId(c.id))) : [];
  const bulkCount = bulkChats.length + bulkRooms.length;
  const bulkAllUnread = bulkCount > 0
    && bulkChats.every(c => c.unreadCount > 0 || !!chatPrefs.get(c.id)?.markedUnread)
    && bulkRooms.every(c => !!roomPref(c)?.markedUnread);
  const bulkAllArchived = bulkChats.every(c => isArchived(chatPrefs.get(c.id), lastActivity(c)))
    && bulkRooms.every(c => isArchived(roomPref(c)));
  const archiveWallet = useRef(walletAddress);
  archiveWallet.current = walletAddress;
  const bulkToggleArchive = async () => {
    const ids = [...bulkChats.map(c => c.id), ...bulkRooms.map(c => roomChatId(c.id))];
    setBulkIds(null);
    for (const id of ids) {
      if (archiveWallet.current !== walletAddress) break;
      await updateChatPref(id, { archived: !bulkAllArchived });
    }
  };
  const bulkToggleUnread = () => {
    const unread = !bulkAllUnread;
    for (const c of bulkChats) updateChatPref(c.id, { unread });
    for (const c of bulkRooms) updateChatPref(roomChatId(c.id), { unread });
    setBulkIds(null);
  };
  const bulkDelete = () => {
    const ids = bulkChats.map(c => c.id);
    if (!ids.length) return;
    setSelectedConversation(prev => (prev && ids.includes(prev.id) ? null : prev));
    for (const id of ids) {
      scheduleDelete(id, () =>
        deleteConversationMutation.mutate(id, {
          onError: () => toast.error(t('messages.deleteConversationFailed')),
        }),
      );
    }
    showUndoToast(
      ids.length === 1
        ? t('toasts.conversation_deleted')
        : _copy('chatBulk.deleted', { defaultValue: '{{count}} chats deleted', count: ids.length }),
      {
        id: `dm-bulk-delete-${ids.join(',')}`,
        duration: UNDO_WINDOW_MS,
        undoLabel: t('common.undo'),
        closeLabel: t('common.close'),
        onUndo: () => ids.forEach(id => undoDelete(id)),
      },
    );
    setBulkIds(null);
  };
  // One message, sent to each picked chat as its own normal (encrypted where
  // possible) message. Resolves with how many it reached.
  const bulkReply = async (text: string): Promise<number> => {
    const targets = bulkChats.filter(c => (c.otherUser || c.participants?.[0])?.address);
    let ok = 0;
    try {
      if (targets.length) await waitForDmSocket();
    } catch {
      toast.error(_copy('chatBulk.offline', { defaultValue: 'Not connected. Try again in a moment.' }));
      return 0;
    }
    const me = user as { username?: string; displayName?: string; avatarImageUrl?: string; avatarUrl?: string } | null;
    const results = await Promise.allSettled([
      ...targets.map(async (c) => {
        const peer = (c.otherUser || c.participants?.[0])?.address;
        const wire = await prepareOutgoing(peer, text);
        await emitSendMessage({ dmId: c.id, content: wire.content, type: 'msg' });
      }),
      // Group and community chats get it as a normal line in the room.
      ...bulkRooms.map(async (c) => {
        if (!walletAddress) throw new Error('signed out');
        const { data, error } = await insertCommunityChatMessage<{ id: string }>({
          communityId: c.id, walletAddress, content: text,
          sender: { username: me?.username, displayName: me?.displayName, avatarUrl: me?.avatarImageUrl ?? me?.avatarUrl },
        });
        if (error) throw error;
        if (data?.id) void reportCommunityChatMessage(c.id, data.id, walletAddress);
      }),
    ]);
    ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (failed === 0) {
      toast.success(_copy('chatBulk.sent', { defaultValue: 'Sent to {{count}} chats', count: ok }));
      setBulkIds(null);
    } else if (ok > 0) {
      toast.error(_copy('chatBulk.partSent', { defaultValue: 'Sent to {{ok}} of {{total}} chats', ok, total: results.length }));
      setBulkIds(null);
    } else {
      toast.error(_copy('chatBulk.notSent', { defaultValue: 'Could not send. Try again.' }));
    }
    return ok;
  };
  const openConversation = (conv: DeHubConversation) => {
    setShowPublicChat(false);
    setSelectedConversation({ ...conv, unreadCount: 0 });
    if (chatPrefs.get(conv.id)?.markedUnread) updateChatPref(conv.id, { unread: false });
  };

  // Get existing conversation addresses to filter search results
  const existingAddresses = new Set(
    (conversations || []).map(c => c.otherUser?.address?.toLowerCase()).filter(Boolean)
  );

  // Filter user search results to exclude users we already have conversations with
  const newUserResults = (userSearchResults?.items || []).filter(
    (user: DeHubUser) => !existingAddresses.has(user.address?.toLowerCase())
  );

  // A search that matches none of your chats shows who and what does match,
  // instead of a blank list.
  const searchDiscover = !guest && !isLoading && !isError && !showArchived
    && searchQuery.trim().length >= 2 && debouncedSearchQuery.trim() === searchQuery.trim()
    && listedConversations.length === 0 && groupChats.length === 0;

  /** Handle clicking a user search result — always create conversation and open chat */
  const handleSelectSearchUser = (user: DeHubUser) => {
    if (guest) { openLoginModal({ path: '/chat?chat=public' }); return; }
    const dmSettingsObj = (() => {
      const raw = (user as any).dmSettings || (user as any).dmSetting;
      return Array.isArray(raw) ? raw[0] : raw;
    })();
    const dmDisabled = dmSettingsObj?.disables?.includes('NEW_DM') || dmSettingsObj?.disables?.includes('all');
    if (dmDisabled) return;

    const userAddress = user.address || (user as any)._id;
    if (!userAddress) return;

    createConversation.mutateAsync({
      recipientAddress: userAddress,
      recipientUser: user,
    }).then(conv => {
      setSelectedConversation(conv);
      setSearchQuery.complete(searchQuery, '');
    }).catch(() => {});
  };

  // Capture navigation state into a ref immediately (before it can be cleared)
  const pendingDmRef = useRef<{ address: string; username?: string; autoSendBody?: string } | null>(null);
  const pendingAutoSendRef = useRef<{ peerAddress: string; body: string } | null>(null);
  const pendingDraftRef = useRef<{ peerAddress: string; body: string } | null>(null);
  // Draft carried into a fee-gated chat's composer (see auto-send effect below).
  const [composerPrefill, setComposerPrefill] = useState<{ convId: string; text: string } | null>(null);
  const [pendingDmTrigger, setPendingDmTrigger] = useState(0);
  
  // Account-info lookup fired the moment the "Message" navigation arrives so
  // it overlaps the conversations load below (was a serial 3-round-trip chain).
  const pendingUserPromiseRef = useRef<Promise<DeHubUser | null> | null>(null);

  // `?chat=public` is the same landing in a URL, which is all a push or an
  // email can carry: a mention in the public chat opens the room itself.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('chat') === 'public') setShowPublicChat(true);
    // `?with=<address>` opens that chat: what "Open in new window" links to.
    const peer = params.get('with');
    if (peer && /^0x[0-9a-fA-F]{40}$/.test(peer)) {
      pendingDmRef.current = { address: peer };
      pendingUserPromiseRef.current = getAccountInfo(peer).catch(() => null);
      setPendingDmTrigger(prev => prev + 1);
    }
  }, [location.search]);

  useEffect(() => {
    const state = location.state as { openDmWith?: string; username?: string; autoSendBody?: string; draftBody?: string; openPublicChat?: boolean } | null;
    // Where a public-chat notification lands. Without it the card drops the
    // reader on the conversation list and makes them find the room that just
    // interrupted them.
    if (state?.openPublicChat) {
      setShowPublicChat(true);
      window.history.replaceState({}, document.title);
      return;
    }
    if (state?.openDmWith) {
      pendingDmRef.current = { address: state.openDmWith, username: state.username, autoSendBody: state.autoSendBody };
      if (state.autoSendBody) {
        pendingAutoSendRef.current = { peerAddress: state.openDmWith.toLowerCase(), body: state.autoSendBody };
      }
      // `draftBody` is autoSendBody's opposite number: open the chat with the
      // message typed but NOT sent. Welcoming a new member is the case that
      // needs it — a canned greeting fired off without the sender ever seeing
      // it reads as a bot, and the point of the feature is that a person said
      // hello. Mobile's `sharedText` behaves the same way.
      if (state.draftBody) {
        pendingDraftRef.current = { peerAddress: state.openDmWith.toLowerCase(), body: state.draftBody };
      }
      // Start the _id lookup now — if an existing conversation is found the
      // result is simply discarded.
      pendingUserPromiseRef.current = getAccountInfo(state.openDmWith).catch(() => null);
      window.history.replaceState({}, document.title);
      setPendingDmTrigger(prev => prev + 1);
    }
  }, [location.state]); // re-run when navigation state changes

  // `?conversation=<id>` opens that chat: what a message notification links
  // to. It used to stop at the list, so a tap on "X sent you a message" made
  // you find X yourself. Keyed on the location as well as the query, so a
  // second tap on the same chat's notification opens it again.
  const pendingConversationIdRef = useRef<string | null>(null);
  const [pendingConversationTrigger, setPendingConversationTrigger] = useState(0);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('conversation');
    if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
    pendingConversationIdRef.current = id;
    setPendingConversationTrigger(prev => prev + 1);
  }, [location.search, location.key]);
  useEffect(() => {
    const id = pendingConversationIdRef.current;
    if (!id || !isAuthenticated || isLoading || !conversations) return;
    pendingConversationIdRef.current = null;
    const match = conversations.find(c => c.id === id);
    if (match) openConversation(match);
    // A copied message link to a chat this account is not in.
    else if (peekPendingChatLink(`dm:${id}`)) {
      clearPendingChatLink();
      toastNotInLinkedChat();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, conversations, isLoading, pendingConversationTrigger]);

  // Process the pending DM once conversations have finished loading
  useEffect(() => {
    if (!pendingDmRef.current || !isAuthenticated || isLoading) return;
    const { address, username } = pendingDmRef.current;
    pendingDmRef.current = null;

    const targetAddress = address.toLowerCase();
    const existing = conversations?.find(c =>
      c.otherUser?.address?.toLowerCase() === targetAddress
    );

    if (existing) {
      pendingUserPromiseRef.current = null;
      setSelectedConversation(existing);
    } else {
      // The account_info lookup (for the MongoDB _id createAndStart requires)
      // was fired when the navigation arrived — by now it has usually resolved
      // in parallel with the conversations load.
      const userPromise = pendingUserPromiseRef.current ?? getAccountInfo(address).catch(() => null);
      pendingUserPromiseRef.current = null;
      userPromise
        .then((user: DeHubUser | null) =>
          user
            ? createConversation.mutateAsync({
                recipientAddress: address,
                recipientUser: {
                  _id: user._id || address,
                  address,
                  username: username ?? user.username,
                  displayName: user.displayName ?? user.display_name,
                  avatarImageUrl: user.avatarImageUrl ?? user.avatarUrl,
                  dmSettings: (user as any).dmSettings,
                },
              })
            : createConversation.mutateAsync({
                recipientAddress: address,
                recipientUser: { address, username } as Partial<DeHubUser>,
              })
        )
        .then((conv) => setSelectedConversation(conv))
        .catch(() => {});
    }
  }, [isAuthenticated, conversations, isLoading, pendingDmTrigger]);

  // When conversations list gets a real dmId for the same peer (e.g. after getContacts returns Riftn data),
  // upgrade selectedConversation so we use socket/Riftn instead of Supabase
  useEffect(() => {
    if (!selectedConversation || !conversations?.length) return;
    const selId = selectedConversation.id;
    const isVirtual = selId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(selId);
    if (!isVirtual) return;
    const peerAddr = (selId.startsWith('new_') ? selId.replace('new_', '') : selId).toLowerCase();
    const realConv = conversations.find(
      c => c.id !== selId &&
        c.otherUser?.address?.toLowerCase() === peerAddr
    );
    if (realConv) {
      setSelectedConversation(realConv);
    }
  }, [selectedConversation, conversations]);

  // Refetch conversations more often when we have a virtual convo selected, to pick up real dmId from Riftn sooner.
  // Route-gated: this page stays mounted forever (PersistentPageCache), so
  // without the pathname check the interval would poll for the whole session
  // after the user navigates away mid-handshake.
  const hasVirtualSelected = selectedConversation &&
    (selectedConversation.id.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(selectedConversation.id));
  // The route this instance answers on. /chat mounts its own copy outside the
  // app layout, so each copy only polls and pushes history while it is shown.
  const routeBase = fullscreen ? '/chat' : '/app/messages';
  const isMessagesRouteActive = location.pathname === routeBase;
  const publicUnread = usePublicChatUnreadCount();
  usePublicChatReading(isMessagesRouteActive && showPublicChat);
  // An open chat's reactions are seen: clear them, including ones that land
  // while it stays open.
  const openChatPrefId = !isMessagesRouteActive ? null
    : selectedConversation ? selectedConversation.id
    : selectedRoom ? roomChatId(selectedRoom.id)
    : showPublicChat ? PUBLIC_CHAT_PREF_ID
    : null;
  const openChatHasReactions = !!(openChatPrefId && chatPrefs.get(openChatPrefId)?.reactions);
  useEffect(() => {
    if (openChatPrefId && openChatHasReactions) seeReactions(openChatPrefId);
  }, [openChatPrefId, openChatHasReactions, seeReactions]);

  /*
   * Back out of a chat to the conversation LIST, not out of Messages entirely.
   *
   * Opening a thread is component state and used to push no history entry at
   * all, so /app/messages was a single stack entry and the device Back popped
   * the whole route — landing the user on the home feed.
   *
   * The entry is carried in the SEARCH, not a route param: the pathname has to
   * stay exactly '/app/messages' or three separate things break. PersistentPageCache
   * matches it with strict equality, the messages route has no child route, and
   * the 5s message poll is gated on the same literal string. Pushed through
   * react-router rather than history.pushState so its internal index survives.
   */
  const navigate = useNavigate();
  const chatEntryRef = useRef(false);
  const chatParamPresent = new URLSearchParams(location.search).get('chat') === '1';

  useEffect(() => {
    if (!isMessagesRouteActive) return;
    // Signed out, /app/messages is only a gate (or a hop to /chat for a
    // Public Chat link): pushing ?chat=1 here would pull them back from /chat.
    if (!isAuthenticated && !fullscreen) return;
    if (chatOpen && !chatEntryRef.current) {
      chatEntryRef.current = true;
      navigate(`${routeBase}?chat=1`);
    }
  }, [chatOpen, isMessagesRouteActive, navigate, routeBase, isAuthenticated, fullscreen]);

  // Back was pressed: the param is gone, so close the chat rather than leave
  // the route. This also clears a selection that would otherwise survive —
  // MessagesPage never unmounts, so tapping Messages used to reopen the last
  // thread instead of the list.
  useEffect(() => {
    if (!isMessagesRouteActive) return;
    if (!chatParamPresent && chatEntryRef.current) {
      chatEntryRef.current = false;
      setSelectedConversation(null);
      setShowPublicChat(false);
    }
  }, [chatParamPresent, isMessagesRouteActive]);

  // Opened out of the side panel: Esc folds the page back into it.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !cameFromPanel()) return;
      if (document.querySelector('[role="dialog"],[data-radix-popper-content-wrapper]')) return;
      collapseChat();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  // The in-app arrow has to CONSUME the entry we pushed, or it is left dangling
  // and the next Back walks straight back into the chat. Don't clear the ref
  // here — navigate(-1)'s popstate is async, so clearing it early loses the
  // race with the effect above: it'd see chatEntryRef already false, skip
  // clearing the selection, and the push effect would immediately re-push
  // '?chat=1' since chatOpen was still true — undoing the back nav and
  // forcing a second tap. Leave it true and let that effect reset it once
  // the URL actually changes.
  const closeChat = useCallback(() => {
    if (chatEntryRef.current) {
      navigate(-1);
      return;
    }
    setSelectedConversation(null);
    setShowPublicChat(false);
    setSelectedRoom(null);
  }, [navigate]);
  // Opening a DM or the public chat puts an open group chat away.
  useEffect(() => {
    if (selectedConversation || showPublicChat) setSelectedRoom(null);
  }, [selectedConversation, showPublicChat]);
  useEffect(() => {
    if (!hasVirtualSelected || !isMessagesRouteActive) return;
    // Poll at 1.5s for first 30s, then 5s
    const fast = setInterval(() => refetch(), 1500);
    let slowInterval: ReturnType<typeof setInterval>;
    const slow = setTimeout(() => {
      clearInterval(fast);
      slowInterval = setInterval(() => refetch(), 5000);
    }, 30000);
    return () => { clearInterval(fast); clearTimeout(slow); clearInterval(slowInterval); };
  }, [hasVirtualSelected, isMessagesRouteActive, refetch]);

  // Auto-send a queued invite/draft message once the selected conversation has a real dmId
  useEffect(() => {
    const pending = pendingAutoSendRef.current;
    if (!pending || !selectedConversation) return;
    const peerAddr = selectedConversation.otherUser?.address?.toLowerCase();
    if (peerAddr !== pending.peerAddress) return;

    // Fee-gated chats must go through the composer's payment flow: a bare
    // emit carries no txHash, so the server rejects it and the queued share
    // used to vanish silently (user landed on an EMPTY composer and had to
    // retype + press send again). Prefill the composer instead — one tap on
    // Send runs the existing pay-and-send path.
    const holder = selectedConversation.otherUser as { dmSettings?: unknown; dmSetting?: unknown } | undefined;
    const rawSettings = holder?.dmSettings ?? holder?.dmSetting;
    const settings = (Array.isArray(rawSettings) ? rawSettings[0] : rawSettings) as { perMessageFee?: number } | undefined;
    const feeRequired =
      (Number(settings?.perMessageFee) || 0) > 0 ||
      (selectedConversation.dmFee?.required && !selectedConversation.dmFee.hasFreeAccess);
    if (feeRequired) {
      pendingAutoSendRef.current = null;
      setComposerPrefill({ convId: selectedConversation.id, text: pending.body });
      return;
    }

    const dmId = selectedConversation.id;
    const isVirtual = dmId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(dmId);
    if (isVirtual) return; // wait for real dmId
    pendingAutoSendRef.current = null;
    void prepareOutgoing(selectedConversation.otherUser?.address, pending.body)
      .then(wire => emitSendMessage({ dmId, content: wire.content, type: 'msg' }))
      .catch(() => { setComposerPrefill({ convId: dmId, text: pending.body }); });
  }, [selectedConversation]);

  // Drop a queued draft into the composer once the right chat is on screen.
  // Waits for a real dmId for the same reason the auto-send does: the prefill
  // is keyed by conversation id, and a virtual `new_0x…` id is replaced the
  // moment the conversation list catches up, which would take the draft with it.
  useEffect(() => {
    const pending = pendingDraftRef.current;
    if (!pending || !selectedConversation) return;
    if (selectedConversation.otherUser?.address?.toLowerCase() !== pending.peerAddress) return;

    const dmId = selectedConversation.id;
    if (dmId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(dmId)) return;
    pendingDraftRef.current = null;
    setComposerPrefill({ convId: dmId, text: pending.body });
  }, [selectedConversation]);

  // /chat's own title, card and canonical. Shown signed out too, so a shared
  // riftn.com/chat link unfurls as the chat page rather than the homepage.
  const chatSeo = fullscreen ? (
    <>
      <SEOHead
        title="Chat: Full-Screen Messages on Riftn"
        description="Your Riftn messages full screen: every conversation on the left, the open chat on the right, grouped bubbles and day markers. Direct messages, group chats and the public chat in one place."
        url="https://riftn.com/chat"
        image="https://riftn.com/og/chat.jpg"
      />
      <h1 className="sr-only">{_copy('fullscreenChat.h1', { defaultValue: 'Riftn Chat: full-screen messages' })}</h1>
    </>
  ) : null;
  // The shell is fixed to the window, so on iOS (which covers the page with
  // the keyboard instead of resizing it) it follows the visible area.
  const shellKeyboardStyle: CSSProperties | undefined = keyboardOpen && vvHeight
    ? { top: vvOffsetTop, height: vvHeight, bottom: 'auto' }
    : undefined;

  // riftn.com/chat signed out is the same page everyone else gets, with the
  // public room readable: sending, reacting, starting a chat or scrolling past
  // its one page of history opens the sign-in sheet in place.
  // Block access for unauthenticated users everywhere else.
  if (!isAuthenticated && !fullscreen) {
    // A copied Public Chat link opened while signed out: the public room is
    // readable at riftn.com/chat, so carry the visitor there to see the line.
    if (!authLoading && (new URLSearchParams(location.search).get('chat') === 'public' || peekPendingChatLink('public'))) {
      return <Navigate to="/chat?chat=public" replace />;
    }
    return <AuthGate description={_copy("copy.b38dabfa0639", { defaultValue: "Log in to access your messages and chat with others." })} />;
  }

  // If Public Chat is open, show full-screen chat
  const publicChatPane = fullscreen && showPublicChat ? (
    <div data-chat-expand-target className="h-full overflow-hidden pt-1">
      <PublicChat onBack={() => { if (!collapseChat()) closeChat(); }} />
    </div>
  ) : null;
  if (showPublicChat && !fullscreen) {
    return (
      /* No horizontal padding: the chat surfaces run to the column edges on
         every theme. The rows and composer carry their own inner padding. */
      <div style={keyboardStyle} className={`${mobileChatHeight} lg:h-[calc(100dvh-32px)] pt-1 pb-0 sm:pt-1 sm:pb-3 lg:pt-2 overflow-hidden`}>
          <PublicChat
            onBack={closeChat}
          />
      </div>
    );
  }

  const newMessageDrawer = (
    <NewMessageDrawer
        ref={newMessageDrawerRef}
        open={showNewMessageDrawer}
        onOpenChange={setShowNewMessageDrawer}
        conversations={conversations ?? []}
        myAddress={walletAddress}
        onPick={pickFromDrawer}
        onNote={() => { setShowNewMessageDrawer(false); openNotesSheet(); }}
        onGroup={() => { setShowNewMessageDrawer(false); setNewChatKind('group'); }}
        onChannel={() => { setShowNewMessageDrawer(false); setNewChatKind('channel'); }}
      />
  );

  const settingsPane = fullscreen && !phonePill && showSettings ? (
    <div data-fsc-settings className="h-full overflow-y-auto">
      <div className="sticky top-0 z-[60] flex justify-end px-4 pt-3">
        <ChatIconButton label={_copy('fullscreenChat.closeSettings', { defaultValue: 'Close settings' })} onClick={() => setShowSettings(false)} data-fsc-settings-close="">
          <CloseIcon />
        </ChatIconButton>
      </div>
      <div className="mx-auto -mt-11 w-full max-w-[47.5rem] px-4">
        <Suspense fallback={null}>
          <EmbeddedSettings initialTab="messages" />
        </Suspense>
      </div>
    </div>
  ) : null;

  const roomPane = fullscreen && selectedRoom ? (
    <div className="h-full overflow-hidden pt-1">
      <Suspense fallback={null}><RoomChatPane key={selectedRoom.id} community={selectedRoom} onBack={closeChat} /></Suspense>
    </div>
  ) : null;
  if (selectedRoom && !fullscreen) {
    return (
      <div style={keyboardStyle} className={`${mobileChatHeight} lg:h-[calc(100dvh-32px)] pt-1 pb-0 sm:pt-1 sm:pb-3 lg:pt-2 overflow-hidden`}>
        <Suspense fallback={null}><RoomChatPane key={selectedRoom.id} community={selectedRoom} onBack={closeChat} /></Suspense>
      </div>
    );
  }

  const dmPane = fullscreen && selectedConversation && !showPublicChat ? (
    <DirectMessageChat
      key={conversationIdentity(selectedConversation)}
      conversation={selectedConversation}
      initialComposerText={composerPrefill?.convId === selectedConversation.id ? composerPrefill.text : undefined}
      focusComposer={composerFocusFor === conversationIdentity(selectedConversation)}
      onBack={closeChat}
      cozy
      options={richList ? (({ onBlock: _b, onDelete: _d, ...rest }) => rest)(chatOptionsFor(selectedConversation)) : undefined}
    />
  ) : null;

  // If a DM conversation is selected, show it
  if (selectedConversation && !fullscreen) {
    /* No horizontal padding: the chat surfaces run to the column edges on
       every theme. The rows and composer carry their own inner padding. */
    return (
      <>
      <div style={keyboardStyle} className={`${mobileChatHeight} lg:h-[calc(100dvh-32px)] pt-1 pb-0 sm:pt-1 sm:pb-3 lg:pt-2 overflow-hidden`}>
        <DirectMessageChat
          /*
           * Keyed on WHO, not on the conversation id. A thread you have never
           * opened starts as "new_0x<addr>" and is swapped for a real ObjectId
           * a second or two later by the effect above — keyed on the id, that
           * swap remounted the whole chat and threw away the message being
           * typed, the scroll position and the reply target. DirectMessageChat
           * already adopts a new real id in place; this lets it.
           */
          key={conversationIdentity(selectedConversation)}
          conversation={selectedConversation}
          initialComposerText={composerPrefill?.convId === selectedConversation.id ? composerPrefill.text : undefined}
          focusComposer={composerFocusFor === conversationIdentity(selectedConversation)}
          onBack={closeChat}
        />
      </div>
      {newMessageDrawer}
      </>
    );
  }

  // Unread chats per tab, for the counts on the tab row.
  const inboxConvs = liveConversations.filter(c => !c.isRequest);
  const unreadOf = (c: DeHubConversation) => c.unreadCount || 0;
  const roomsUnread = listedRooms.filter(c => !isMuted(roomPref(c))).reduce((n, c) => n + (roomSummaries[c.id]?.unread ?? 0), 0);
  const tabUnread: Record<string, number> = {
    all: inboxConvs.reduce((n, c) => n + unreadOf(c), 0) + publicUnread + roomsUnread,
    unread: inboxConvs.reduce((n, c) => n + unreadOf(c), 0) + publicUnread + roomsUnread,
    direct: inboxConvs.reduce((n, c) => n + unreadOf(c), 0),
    communities: roomsUnread,
    requests: requestUnread,
  };
  for (const tab of chatTabs.tabs) {
    if (tab.builtin) continue;
    tabUnread[tab.id] = inboxConvs.filter(c => tab.chats.includes(c.id)).reduce((n, c) => n + unreadOf(c), 0)
      + (tab.chats.includes(PUBLIC_CHAT_TAB_ID) ? publicUnread : 0);
  }
  // An empty Requests tab stays out of the row.
  const tabRowTabs = requestConversations.length
    ? chatTabs.tabs
    : chatTabs.tabs.map(x => (x.id === 'requests' && activeTab !== 'requests' ? { ...x, hidden: true } : x));
  // Every chat the tab editor can put in a tab.
  const tabCandidates: TabCandidate[] = [
    { id: PUBLIC_CHAT_TAB_ID, name: t('publicChat.title'), avatar: dehubLogo, kind: _copy('chatTabs.kindPublic', { defaultValue: 'Public' }) },
    ...chatsFromMemberships(myMemberships, id => !!chatPrefs.get(roomChatId(id))?.listedAt).map(c => ({
      id: roomChatId(c.id),
      name: c.name,
      avatar: c.avatar_url ? storageImage(c.avatar_url, 80) : undefined,
      kind: c.kind === 'channel' ? _copy('chatTabs.kindChannel', { defaultValue: 'Channel' })
        : c.kind === 'group' ? _copy('chatTabs.kindGroup', { defaultValue: 'Group' })
        : _copy('chatTabs.kindCommunity', { defaultValue: 'Community' }),
    })),
    ...inboxConvs.map(c => {
      const u = c.otherUser || c.participants?.[0];
      const name = c.isGroup ? (c as { name?: string }).name || 'Group' : (u?.displayName || (u as { display_name?: string } | undefined)?.display_name || u?.username || 'User');
      return {
        id: c.id,
        name,
        avatar: u?.address ? buildAvatarUrl(u.address, extractAvatarPath(u)) : undefined,
        kind: _copy('chatTabs.kindDirect', { defaultValue: 'Direct' }),
        round: true,
      };
    }),
  ];
  const tabBeingEdited = tabEditor?.id ? chatTabs.tabs.find(x => x.id === tabEditor.id) : undefined;
  const moveCustomTab = (id: string, by: -1 | 1) => {
    const ids = chatTabs.tabs.map(x => x.id);
    const customIds = chatTabs.tabs.filter(x => !x.builtin).map(x => x.id);
    const swapWith = customIds[customIds.indexOf(id) + by];
    if (!swapWith) return;
    const a = ids.indexOf(id), b = ids.indexOf(swapWith);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    void chatTabs.reorder(ids);
  };
  const tabBar = tabsOn ? (
    <ChatTabBar
      tabs={tabRowTabs}
      unread={tabUnread}
      active={showArchived ? 'archived' : inRequests ? 'requests' : activeTab}
      onSelect={(id) => { setShowArchived(false); setShowRequests(false); setActiveTab(id); }}
      onNew={() => setTabEditor({})}
      onManage={() => setTabManager(true)}
      onEdit={(id) => setTabEditor({ id })}
      onMove={moveCustomTab}
      onHide={(id) => { void chatTabs.setHidden(id, true); if (activeTab === id) setActiveTab('all'); }}
      onDelete={(id) => setTabDelete(id)}
      onDropChat={(tabId, chatId) => {
        const tab = chatTabs.tabs.find(x => x.id === tabId);
        if (!tab || tab.chats.includes(chatId)) return;
        void chatTabs.addChats(tabId, [chatId]);
        toast.success(_copy('chatTabs.addedTo', { defaultValue: 'Added to {{name}}', name: tab.name }));
      }}
      className={deskCards ? 'px-0 pb-0 pt-0' : phonePill ? 'pl-3 pr-1 pb-0 pt-0' : undefined}
      bare={phonePill}
      trailing={(deskCards || phonePill) && (archivedCount > 0 || showArchived) ? (
        <button type="button" role="tab" data-chat-tab="archived" data-msg-cards-archived aria-selected={showArchived}
          onClick={() => { setShowRequests(false); setActiveTab('all'); setShowArchived(!showArchived); }}>
          <Archive className="h-3.5 w-3.5" />
          <span className="whitespace-nowrap">{_copy('chatMenu.archived', { defaultValue: 'Archived' })}</span>
          {archivedCount > 0 && <span data-chat-tab-unread data-quiet>{formatCount(archivedCount)}</span>}
        </button>
      ) : undefined}
    />
  ) : null;
  const tabSheets = (
    <>
      {tabEditor && (
        <ChatTabEditor
          initial={tabBeingEdited ? { id: tabBeingEdited.id, name: tabBeingEdited.name, emoji: tabBeingEdited.emoji, chats: tabBeingEdited.chats } : { name: '', emoji: '', chats: tabEditor.preset ?? [] }}
          candidates={tabCandidates}
          onClose={() => setTabEditor(null)}
          onDelete={tabBeingEdited ? () => { setTabDelete(tabBeingEdited.id); setTabEditor(null); } : undefined}
          onSave={(tab) => {
            if (tabBeingEdited) {
              void chatTabs.update(tabBeingEdited.id, tab);
            } else {
              if (!chatTabs.canAdd) { toast.error(_copy('chatTabs.tooMany', { defaultValue: 'You can have up to 10 tabs' })); return; }
              const id = chatTabs.create(tab);
              setActiveTab(id);
            }
            setTabEditor(null);
          }}
        />
      )}
      {tabManager && !tabEditor && !tabDelete && (
        <ChatTabsManager
          tabs={chatTabs.tabs}
          canAdd={chatTabs.canAdd}
          onReorder={(ids) => void chatTabs.reorder(ids)}
          onHide={(id, hidden) => { void chatTabs.setHidden(id, hidden); if (hidden && activeTab === id) setActiveTab('all'); }}
          onEdit={(id) => setTabEditor({ id })}
          onDelete={(id) => setTabDelete(id)}
          onNew={() => setTabEditor({})}
          onClose={() => setTabManager(false)}
        />
      )}
      {tabDelete && chatTabs.tabs.find(x => x.id === tabDelete) && (
        <ChatTabDeleteConfirm
          tab={chatTabs.tabs.find(x => x.id === tabDelete)!}
          onClose={() => setTabDelete(null)}
          onConfirm={() => {
            const tab = chatTabs.tabs.find(x => x.id === tabDelete);
            void chatTabs.remove(tabDelete);
            if (activeTabRaw === tabDelete) setActiveTab('all');
            setTabDelete(null);
            if (tab) toast.success(_copy('chatTabs.deleted', { defaultValue: 'Deleted {{name}}', name: tab.name }));
          }}
        />
      )}
    </>
  );

  // Computers only: phones keep the pill header they already have.
  const fullscreenTop = fullscreen && !phonePill ? (
    <ChatListTop
      title={_copy('settings.chat', { defaultValue: 'Chat' })}
      searchLabel={_copy('fullscreenChat.search', { defaultValue: 'Search chats' })}
      searchValue={searchQuery}
      onClearSearch={() => setSearchQuery('')}
      onOpenSettings={() => setShowSettings(true)}
      search={(
        <input
          type="text"
          data-fsc-search
          placeholder={_copy('fullscreenChat.search', { defaultValue: 'Search chats' })}
          aria-label={_copy('fullscreenChat.search', { defaultValue: 'Search chats' })}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 w-full bg-transparent pl-2.5 text-[15px] text-white placeholder:text-zinc-500 outline-none"
        />
      )}
      searchActions={(
        <>
          <ChatIconButton
            label={_copy('chatBulk.select', { defaultValue: 'Select chats' })}
            onClick={togglePicking}
            className={picking ? 'bg-white/15 text-white' : undefined}
            data-messages-search-action=""
            data-chat-select-start=""
          >
            <ListChecks />
          </ChatIconButton>
          <ChatIconButton label={_copy("copy.0e9161011702", { defaultValue: "Refresh" })} onClick={() => refetch()} data-messages-search-action="">
            <RefreshCw className={isRefetching ? 'animate-spin' : ''} />
          </ChatIconButton>
          <ChatIconButton label={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })} onClick={openNewMessage} data-messages-search-action="">
            <Plus />
          </ChatIconButton>
        </>
      )}
      actions={<ChatTextSizeButton className="rounded-full transition-[color,transform] duration-150 hover:scale-110 hover:bg-transparent" />}
    />
  ) : null;

  // Phones: no pill. The filter chips scroll sideways and the one menu, new
  // chat and search stay pinned at the end of their row.
  const phoneTop = phonePill ? (
    <PhoneChatListTop
      title={_copy('settings.chat', { defaultValue: 'Chat' })}
      chips={tabBar}
      searchValue={searchQuery}
      onSearch={setSearchQuery}
      searchPlaceholder={t('messages.searchConversations')}
      onNewChat={openNewMessage}
      onRefresh={() => refetch()}
      refreshing={isRefetching}
      picking={picking}
      onTogglePicking={guest ? undefined : togglePicking}
      onNewTab={guest ? undefined : () => setTabEditor({})}
      onEditTabs={guest ? undefined : () => setTabManager(true)}
    />
  ) : null;

  // Same total as the nav icon: requests never light it.
  const dmUnread = liveConversations.reduce((sum, c) => sum + (c.isRequest ? 0 : c.unreadCount || 0), 0);
  const deskTop = deskCards ? (
    <PageIsland
      className="shrink-0"
      icon={<span data-msg-cards-glyph className="flex h-8 w-8 items-center justify-center text-white"><MessagesNavGlyph unread={dmUnread} className="h-[22px] w-[22px]" /></span>}
      title={picking
        ? _copy('chatBulk.selected', { defaultValue: '{{count}} selected', count: bulkCount })
        : _copy('settings.chat', { defaultValue: 'Chat' })}
      actions={(
        <>
          <button
            type="button"
            data-msg-cards-action
            data-msg-cards-select
            data-chat-select-start
            onClick={togglePicking}
            aria-pressed={picking}
            className={picking ? 'is-on' : undefined}
          >
            {picking ? <CloseIcon /> : <ListChecks />}
            <span>{picking ? _copy('chatBulk.cancel', { defaultValue: 'Cancel' }) : _copy('chatBulk.selectShort', { defaultValue: 'Select' })}</span>
          </button>
          <button type="button" data-msg-cards-action onClick={openNewMessage}
            aria-label={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })}
            title={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })}>
            <Plus />
          </button>
          <button type="button" data-msg-cards-action data-open-fullscreen-chat onClick={() => navigate('/chat')}
            aria-label={_copy('fullscreenChat.open', { defaultValue: 'Open full screen chat' })}
            title={_copy('fullscreenChat.open', { defaultValue: 'Open full screen chat' })}>
            <Fullscreen />
          </button>
        </>
      )}
    >
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          data-search-surface
          data-msg-cards-search
          placeholder={t('messages.searchConversations')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 rounded-xl border-0 bg-white/[0.06] pl-10 pr-11 text-white placeholder:text-zinc-500"
        />
        <button
          type="button"
          data-messages-search-action
          onClick={() => refetch()}
          disabled={isRefetching}
          aria-label={_copy("copy.0e9161011702", { defaultValue: "Refresh" })}
          title={_copy("copy.0e9161011702", { defaultValue: "Refresh" })}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {tabBar}
    </PageIsland>
  ) : null;

  const listColumn = (
      <div className={fullscreen ? 'h-full' : 'h-full lg:h-[calc(100dvh-32px)] max-h-full'}>
        {/* Full Width Messages Panel. A list, not a set of cards, so it carries
            no surface at all — see [data-bento-flat] in index.css. The
            [data-page-bento] hook stays: the Osaka and Jungle `#app-root` class
            nets exclude on it, and without it every bg-zinc-8/9 descendant in
            here becomes a frosted rectangle. */}
        <div data-page-bento data-bento-flat data-msg-cards={cards ? '' : undefined} data-msg-plain={plainList ? '' : undefined} data-msg-cards-picking={deskCards && picking ? '' : undefined} className="relative w-full h-full flex flex-col overflow-hidden">
          {/* Header */}
          {fullscreenTop ?? deskTop ?? phoneTop ?? (<PageIsland
            className={fullscreen ? 'shrink-0 top-0 lg:top-0 px-2 pt-2' : 'shrink-0'}
            icon={<BrandIcon src={messagesBubbleIcon} alt={_copy("copy.04d7b4833927", { defaultValue: "Messages" })} className="h-8 w-8 object-contain" />}
            title={_copy('settings.chat', { defaultValue: 'Chat' })}
            actions={fullscreen ? (
              // Only phones reach this header (computers get fullscreenTop).
              // A phone has no full screen to leave, so the spare square is
              // the + : sign in when signed out, the new chat drawer when in.
              <>
                <ChatTextSizeButton />
                <IslandAction label={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })} onClick={openNewMessage}>
                  <Plus />
                </IslandAction>
              </>
            ) : phonePill ? (
              // Phones: search waits in the drawer behind the pill's search
              // button, so starting a chat lives on the pill itself.
              <IslandAction label={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })} onClick={openNewMessage}>
                <Plus />
              </IslandAction>
            ) : undefined}
          >
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                data-search-surface
                placeholder={t('messages.searchConversations')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                // Room for the buttons sitting inside the field (28px each).
                style={{ paddingRight: 8 + 32 * (2 + (phonePill ? 0 : 1) + (fullscreen ? 0 : 1)) }}
                className="pl-10 bg-white/[0.06] border-0 text-white placeholder:text-zinc-500 rounded-lg"
              />
              {/* Refresh and new message sit quietly inside the search field
                  instead of as island squares next to the title. */}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                {/* Select: then click (or tap) chats to tick them for the bulk bar. */}
                <button
                  type="button"
                  data-messages-search-action
                  data-chat-select-start
                  onClick={togglePicking}
                  aria-pressed={picking}
                  aria-label={_copy('chatBulk.select', { defaultValue: 'Select chats' })}
                  title={_copy('chatBulk.select', { defaultValue: 'Select chats' })}
                  className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${picking ? 'bg-white/15 text-white' : 'text-zinc-500 hover:text-white'}`}
                >
                  <ListChecks className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  data-messages-search-action
                  onClick={() => refetch()}
                  disabled={isRefetching}
                  aria-label={_copy("copy.0e9161011702", { defaultValue: "Refresh" })}
                  title={_copy("copy.0e9161011702", { defaultValue: "Refresh" })}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                </button>
                {!phonePill && (
                  <button
                    type="button"
                    data-messages-search-action
                    onClick={openNewMessage}
                    aria-label={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })}
                    title={_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
                {!fullscreen && (
                  <button
                    type="button"
                    data-messages-search-action
                    data-open-fullscreen-chat
                    onClick={() => navigate('/chat')}
                    aria-label={_copy('fullscreenChat.open', { defaultValue: 'Open full screen chat' })}
                    title={_copy('fullscreenChat.open', { defaultValue: 'Open full screen chat' })}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white transition-colors"
                  >
                    <Fullscreen className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </PageIsland>)}

          {!deskCards && !phonePill && tabBar}
          {tabSheets}

          {/* Conversation List */}
          <div data-chat-list-scroll data-pull-through ref={chatListRef} {...chatPull.handlers} className={`flex-1 min-h-0 overflow-y-auto ${fullscreen && !phonePill ? 'pt-1 pb-3' : 'pt-3 pb-[76px] lg:pb-0'}`}>
            {/* Phones: pulled down from the top, the rows lower and a refresh
                arrow turns in the gap; let go past its full turn to refresh.
                Every row is a button, so the list opts in with
                data-pull-through (a pull may start on a row; the tap that
                would follow a real pull is dropped). */}
            <div data-chat-pull-mark aria-hidden className="pointer-events-none sticky top-0 z-10 h-0">
              <div className="absolute inset-x-0 top-0 flex items-center justify-center overflow-hidden text-zinc-400" style={{ height: 'var(--chat-pull, 0px)', opacity: 'var(--chat-pull-o, 0)' }}>
                <RefreshCw className="h-[18px] w-[18px]" style={{ transform: 'rotate(calc(var(--chat-pull-p, 0) * 300deg)) scale(calc(0.7 + var(--chat-pull-p, 0) * 0.3))' }} />
              </div>
            </div>
            <div ref={chatPullRef} data-chat-list-body>
            <ChatPinStrip
              conversations={pinStrip}
              selectedId={selectedConversation?.id}
              optionsFor={chatOptionsFor}
              onOpen={openConversation}
            />
            {/* Public Chat (pinned) */}
            {!inRequests && (<>
            {(tabFilter === 'all' || (tabFilter === 'unread' && (publicUnread > 0 || !!publicReactions))) && !showArchived && publicInTab && (
            <button
              onClick={() => { setSelectedConversation(null); setShowPublicChat(true); }}
              data-chat-list-row
              data-selected={fullscreen && showPublicChat ? '' : undefined}
              className={`w-full flex items-center gap-3 p-4 border-t border-white/[0.07] hover:bg-white/[0.04] transition-colors text-left ${fullscreen && showPublicChat ? 'bg-white/[0.06]' : ''}`}
            >
              <div data-keep-dark className="w-12 h-12 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                <img 
                  src={dehubLogo} 
                  alt={_copy("copy.f73b495201cb", { defaultValue: "Public Chat" })} 
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="font-semibold text-white truncate">{t('publicChat.title')}</span>
                  {publicLastLine && <span data-room-last-at className="ml-auto shrink-0 text-zinc-500 text-sm tabular-nums">{formatTimeAgo(publicLastLine.created_at)}</span>}
                  {!showPublicChat && <ReactionAlertBadge reactions={publicReactions} rowKey="public" className={publicLastLine ? 'ml-0.5' : 'ml-auto'} />}
                  {/* Same white number as a private chat, not a red pill. */}
                  {publicUnread > 0 && !showPublicChat && <UnreadCountChip count={publicUnread} className={publicLastLine || publicReactions ? 'ml-0.5' : 'ml-auto'} />}
                </span>
                {publicReactions && !showPublicChat
                  ? <p data-reaction-alert-line className="text-white font-bold text-sm truncate">{reactionAlertLine(t, publicReactions, { named: true })}</p>
                  : publicPreview
                    ? <p data-room-preview className={`text-white text-sm truncate ${publicUnread > 0 ? 'font-bold' : 'font-normal'}`}>{publicPreview}</p>
                    : <p className="text-zinc-500 text-sm truncate">{t('publicChat.subtitle')}</p>}
              </div>
            </button>
            )}

            {/* Groups and channels you are in */}
            {shownRooms.filter(roomInTab).map((chat) => {
              const row = (
                <GroupChatRow
                  key={chat.id}
                  community={chat}
                  pref={richList ? roomPref(chat) : unreadOnly(roomPref(chat))}
                  summary={roomSummaries[chat.id]}
                  me={walletAddress || ''}
                  reactions={selectedRoom?.id === chat.id ? null : roomPref(chat)?.reactions}
                  selected={fullscreen && selectedRoom?.id === chat.id}
                  onClick={() => {
                    if (picking) { toggleBulk(roomChatId(chat.id)); return; }
                    openRoomChat(chat);
                  }}
                  selecting={picking}
                  checked={!!bulkIds?.has(roomChatId(chat.id))}
                  onLongPress={richList ? undefined : () => holdToPick(roomChatId(chat.id))}
                />
              );
              return richList ? (
                <ChatRowContextMenu key={chat.id} {...roomOptionsFor(chat)}>
                  <div data-chat-row data-pinned={roomPinnedAt(chat) > 0 ? '' : undefined} draggable onDragStart={(e) => e.dataTransfer.setData(CHAT_DRAG_TYPE, roomChatId(chat.id))}>{row}</div>
                </ChatRowContextMenu>
              ) : <div key={chat.id} onContextMenu={rightClickPick(roomChatId(chat.id))}>{row}</div>;
            })}
            </>)}

            {/* Loading State */}
            {isLoading && <ConversationsSkeleton />}

            {/* Error State */}
            {isError && (
              <AppState
                icon="messages"
                title={t('messages.failedToLoad')}
                description={_copy("copy.be26771e6ef9", { defaultValue: "Your conversations are still safe. Try loading them again." })}
                kind="error"
                size="drawer"
                primaryAction={{ label: t('messages.tryAgain'), onClick: () => refetch() }}
              />
            )}



            {/* Empty state */}
            {!guest && !isLoading && !isError && !searchQuery.trim() && liveConversations.length === 0 && (
              <AppState
                icon="messages"
                title={t('messages.noConversationsYet', 'No conversations yet')}
                description={_copy("copy.31dfdb14602d", { defaultValue: "Start a conversation and it will appear here." })}
                size="drawer"
              />
            )}

            {/* Message requests: people you don't follow */}
            {inRequests && <MessageRequestsHeader onBack={() => { setShowRequests(false); if (activeTab === 'requests') setActiveTab('all'); }} />}
            {!inRequests && !showArchived && tabFilter === 'all' && !searchQuery.trim() && !isLoading && !isError && requestConversations.length > 0 && (!tabsOn || !requestsTabShown) && (
              <MessageRequestsRow count={requestConversations.length} unread={requestUnread} onClick={() => setShowRequests(true)} />
            )}

            {/* Conversations */}
            {richList && showArchived && !deskCards && (
              <button
                type="button"
                data-chat-archive-back
                onClick={() => setShowArchived(false)}
                className="flex w-full items-center gap-2 border-t border-white/[0.07] px-4 py-3 text-left text-[15px] font-semibold text-white hover:bg-white/[0.04]"
              >
                <ChevronLeft className="h-4 w-4 text-zinc-400" />
                {_copy('chatMenu.archivedChats', { defaultValue: 'Archived chats' })}
              </button>
            )}
            {customTab && !isLoading && !isError && !showArchived
              && !shownConversations.some(convInTab) && !shownRooms.some(roomInTab) && !publicInTab && (
              <ChatTabEmpty tab={customTab} onAdd={() => setTabEditor({ id: customTab.id })} />
            )}
            {!isLoading && !isError && shownConversations.filter(convInTab).map((conv) => {
              const row = (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  onClick={(e) => {
                    if (picking) { toggleBulk(conv.id); return; }
                    if (e.metaKey || e.ctrlKey || e.shiftKey) { e.preventDefault(); setBulkIds(new Set([conv.id])); return; }
                    openConversation(conv);
                  }}
                  selecting={picking}
                  checked={!!bulkIds?.has(conv.id)}
                  isSelected={selectedConversation?.id === conv.id}
                  onDelete={handleDeleteConversation}
                  onBlock={handleBlockConversationUser}
                  pref={richList ? chatPrefs.get(conv.id) : unreadOnly(chatPrefs.get(conv.id))}
                  onLongPress={richList ? undefined : () => holdToPick(conv.id)}
                  compactTime={cards}
                  reactions={selectedConversation?.id === conv.id ? null : chatPrefs.get(conv.id)?.reactions}
                />
              );
              return richList ? (
                <ChatRowContextMenu key={conv.id} {...chatOptionsFor(conv)}>
                  <div data-chat-row data-pinned={pinnedAt(conv) > 0 ? '' : undefined} draggable onDragStart={(e) => e.dataTransfer.setData(CHAT_DRAG_TYPE, conv.id)}>{row}</div>
                </ChatRowContextMenu>
              ) : <div key={conv.id} onContextMenu={rightClickPick(conv.id)}>{row}</div>;
            })}
            {richList && !deskCards && !showArchived && archivedCount > 0 && !searchQuery.trim() && activeTab === 'all' && (
              <button
                type="button"
                data-chat-archive-open
                onClick={() => setShowArchived(true)}
                className="flex w-full items-center gap-3 border-t border-white/[0.07] px-4 py-3 text-left text-[14px] text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              >
                <Archive className="h-[18px] w-[18px]" />
                <span className="flex-1">{_copy('chatMenu.archivedChats', { defaultValue: 'Archived chats' })}</span>
                <span className="tabular-nums">{formatCount(archivedCount)}</span>
              </button>
            )}

            {searchDiscover && (
              <ChatSearchDiscover
                query={searchQuery}
                users={newUserResults}
                usersLoading={isSearchingUsers}
                onMessageUser={handleSelectSearchUser}
                onNewChat={openNewMessage}
                onNewGroup={() => setNewChatKind('group')}
              />
            )}

            {/* User search results (people not in existing conversations) */}
            {!searchDiscover && searchQuery.trim().length >= 2 && newUserResults.length > 0 && (
              <>
                <div className="px-4 py-2 mt-2">
                  <p className="text-zinc-500 text-xs uppercase tracking-wider font-medium">{_copy("copy.4787aa7e2d5c", { defaultValue: "Start new conversation" })}</p>
                </div>
                {newUserResults.map((user: DeHubUser) => {
                  const avatarPath = extractAvatarPath(user);
                  const avatarUrl = user.address ? buildAvatarUrl(user.address, avatarPath) : undefined;
                  const displayName = user.displayName || (user as any).display_name || user.username || _copy("copy.b512d97e7cbf", { defaultValue: "User" });
                  const isVerified = user.isVerified || (user as any).is_verified;
                  const dmSettingsObj = (() => {
                    const raw = (user as any).dmSettings || (user as any).dmSetting;
                    return Array.isArray(raw) ? raw[0] : raw;
                  })();
                  const dmDisabled = dmSettingsObj?.disables?.includes('NEW_DM') || dmSettingsObj?.disables?.includes('all');
                  const perMessageFee = dmSettingsObj?.perMessageFee;

                  return (
                    <button
                      key={user._id || user.address}
                      onClick={() => handleSelectSearchUser(user)}
                      disabled={dmDisabled}
                      className={`w-full flex items-center gap-3 p-4 border-t border-white/[0.07] transition-colors text-left ${
                        dmDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <Avatar className="w-12 h-12">
                        {avatarUrl && <AvatarImage src={avatarUrl} />}
                        <AvatarFallback className="bg-zinc-700 text-white font-medium">
                          {displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <ConversationName user={user}>{displayName}</ConversationName>
                          {isVerified && <VerifiedBadge className="w-3.5 h-3.5" />}
                        </div>
                        {user.username && (
                          <p className="text-sm text-zinc-500 truncate">@{user.username}</p>
                        )}
                        {dmDisabled && (
                          <p className="text-xs text-red-400 mt-0.5">{_copy("copy.c20ed70dd868", { defaultValue: "DMs disabled" })}</p>
                        )}
                        {!dmDisabled && perMessageFee && perMessageFee > 0 && (
                          <p className="text-xs text-amber-400 mt-0.5">
                            {perMessageFee.toLocaleString()} <DhbCoin />{_copy("copy.cf92bc9b461f", { defaultValue: " to message" })}</p>
                        )}
                      </div>
                      {!dmDisabled && (
                        <MessageCircle className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Searching indicator */}
            {!searchDiscover && searchQuery.trim().length >= 2 && isSearchingUsers && (
              <div className="flex items-center justify-center gap-2 py-4 text-zinc-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />{_copy("copy.3084651a3386", { defaultValue: "Searching users..." })}</div>
            )}
            </div>
          </div>
          {picking && (
            <BulkChatBar
              count={bulkCount}
              deletableCount={bulkChats.length}
              chatIds={bulkChats.map(c => c.id)}
              allUnread={bulkAllUnread}
              onToggleUnread={bulkToggleUnread}
              allArchived={bulkAllArchived}
              onToggleArchive={phonePill && !guest && !inRequests && !bulkChats.some(c => c.isRequest) ? bulkToggleArchive : undefined}
              onDelete={bulkDelete}
              onReply={bulkReply}
              onCancel={() => setBulkIds(null)}
              touch={phonePill || (!richList && typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches)}
              // Phones: on /chat the bar takes the bottom menu's place while
              // picking; on /messages it sits above the app's floating menu.
              className={richList ? undefined : phonePill ? 'mb-[calc(env(safe-area-inset-bottom)+8px)]' : 'mb-[84px] lg:mb-2'}
            />
          )}
        </div>
      </div>
  );

  const dialogs = (
    <>
      <DeleteMessageDialog
        subject="chat"
        open={!!confirmChatDelete}
        onOpenChange={(open) => { if (!open) setConfirmChatDelete(null); }}
        canDeleteForEveryone={!!confirmChatDelete && !confirmChatDelete.isGroup && !confirmChatDelete.id.startsWith('new_')}
        oneToOne
        peerName={confirmChatDelete ? (confirmChatDelete.otherUser?.displayName || confirmChatDelete.otherUser?.username || null) : null}
        onDelete={(scope) => { const conv = confirmChatDelete; setConfirmChatDelete(null); if (conv) deleteConversationNow(conv, scope); }}
      />
      <AlertDialog open={!!clearTarget} onOpenChange={(open) => { if (!open) setClearTarget(null); }}>
        <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{_copy('chatMenu.clearTitle', { defaultValue: 'Clear history?' })}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">{_copy('chatMenu.clearBody', { defaultValue: 'Every message in this chat disappears for you. The other person keeps their copy.' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (clearTarget) void clearHistory(clearTarget); setClearTarget(null); }}>{_copy('chatMenu.clearHistory', { defaultValue: 'Clear history' })}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Message Type Selector */}
      <NewMessageSelector
        open={showMessageSelector}
        onOpenChange={setShowMessageSelector}
        onSelectDM={() => setShowNewConversation(true)}
        onSelectNote={openNotesSheet}
        onSelectGroup={() => setNewChatKind('group')}
        onSelectChannel={() => setNewChatKind('channel')}
      />

      {!guest && walletAddress && (
        <NotesSheetHost onMessage={(author, reply) => {
          // A reply to a note is sent as soon as the chat with them is ready.
          if (reply) pendingAutoSendRef.current = { peerAddress: author.address.toLowerCase(), body: reply };
          handleSelectSearchUser({ ...author, _id: author.address } as unknown as DeHubUser);
        }} />
      )}

      <NewGroupChannelSheet
        kind={newChatKind ?? 'group'}
        open={!!newChatKind}
        onOpenChange={(open) => { if (!open) setNewChatKind(null); }}
      />

      <NewConversationModal
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        onConversationCreated={(conversation) => {
          setShowPublicChat(false);
          setSelectedConversation(conversation);
        }}
      />
      {newMessageDrawer}
    </>
  );

  if (fullscreen) {
    return (
      <FullScreenChatShell
        style={shellKeyboardStyle}
        chatOpen={chatOpen}
        chat={settingsPane ?? publicChatPane ?? roomPane ?? dmPane}
        list={<>{chatSeo}{listColumn}{dialogs}{phonePill && !chatOpen && !picking && <Suspense fallback={null}><MobileBottomNav /></Suspense>}</>}
      />
    );
  }

  return (
    <div style={keyboardStyle} className={`${mobileChatHeight} pt-1 lg:h-full lg:pt-2 lg:pb-3 overflow-hidden`}>
      <SEOHead title={_copy("copy.3875aefdf8b8", { defaultValue: "Messages: Direct & Group Chat" })} description={_copy("copy.a058b8f54f71", { defaultValue: "Send direct messages, create group chats, share media and connect with other users privately on Riftn, your inbox on the user-owned social platform." })} url="https://riftn.com/app/messages" />
      <h1 className="sr-only">{_copy("copy.6b5c348f0adc", { defaultValue: "Riftn Messages — Decentralised Social Media, Censorship Resistant & Freedom of Speech" })}</h1>
      {listColumn}
      {dialogs}
    </div>
  );
}
