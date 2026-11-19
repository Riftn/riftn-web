import { outsideImage } from '@/lib/outside-image';
import { FullscreenImageViewerLazy } from '@/components/app/cards/FullscreenImageViewerLazy';
import CornerDownRight from "@/components/ui/cut-icons/reply";
import { useTranslation as _useCopy } from 'react-i18next';
import { useDraftState } from '@/hooks/use-draft-state';
import { useDraft } from '@/hooks/use-draft';
import { useStickToBottom } from '@/hooks/use-stick-to-bottom';
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';
import { Loader2 } from "lucide-react";
import Reply from "@/components/ui/cut-icons/reply";

import Send from "@/components/ui/cut-icons/send";
import Mic from "@/components/ui/cut-icons/mic";
import Attach from "@/components/ui/cut-icons/attach";
import Fullscreen from "@/components/ui/cut-icons/fullscreen";
import X from "@/components/ui/cut-icons/close";

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { TranslatableText, replaceLinksWithEmoji, SharedTranslationContext } from '../TranslatableText';

import { EmojiGifPicker } from '../chat/EmojiGifPicker';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useLiveChatRooms, useLiveChatMessages, useLiveChatPresence, type SupabaseLiveChatMessage } from '@/hooks/use-livechat';
import { getMediaUrl, getAuthToken, uploadLiveChatVoice, uploadChatImage } from '@/lib/api/dehub';
import { PUBLIC_CHAT_IMAGE_TYPES, validatePublicChatMedia } from '@/lib/public-chat-media';
import { SendStatus } from '@/components/app/chat/SendStatus';
import { sendPublicChatImage } from '@/lib/public-chat-attachment';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { usePublicChatReading } from '@/hooks/use-public-chat-unread';
import { dblClickReply } from '@/lib/dblclick-reply';
import { supabase } from '@/integrations/supabase/client';
import { useStableNavigate } from '@/hooks/use-stable-navigate';
import { useQueryClient } from '@tanstack/react-query';
import { seedProfileCache } from '@/lib/profile-cache-seed';
import { preloadRoute } from '@/lib/route-preload';
import { expandChat, forgetChatOrigin } from '@/lib/chat-expand';
import { Skeleton } from '@/components/ui/skeleton';
import { AppState } from '@/components/app/AppState';
import { VoiceRecorder } from '@/components/app/chat/VoiceRecorder';
import { VoiceWaveformPlayer } from '../chat/VoiceWaveformPlayer';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import type { BadgeLock } from '@/lib/staking-badges';
import { toast } from 'sonner';
import { wasShownToUser } from '@/lib/chat-refusal';
import type { ReactionData } from '../chat/ChatMessage';
import { useBuyAlerts, type BuyAlertMessage } from '@/hooks/use-buy-alerts';
import { BuyAlertCard } from '../chat/BuyAlertCard';
import { useBuyBotHidden } from '@/hooks/use-buy-bot-hidden';
import { ASSISTANT_AVATAR as assistantAvatar, isAssistantAddress } from '@/lib/assistant';
import { useAssistantReplies, useAssistantReplyEngine, type AssistantReply } from '@/hooks/use-assistant-replies';
import Sparkles from "@/components/ui/cut-icons/assistant";

import { DehubLinkEmbeds, useDehubLinks } from '@/components/app/cards/DehubLinkEmbedsLazy';
import { ChatLinkPreviews } from '../chat/ChatLinkPreviews';

import { QUICK_CHAT_REACTIONS } from '@/components/app/chat/reaction-options';
import { ChatReactorsDrawer } from '@/components/app/chat/ChatReactorsDrawer';
import { MessageMenu, type MessageMenuAction } from '@/components/app/chat/MessageMenu';
import { menuIcons, messageMenuMeta, keepBrowserMenu, useMenuPoint, MessageMoreButton, copyMediaWithToast } from '@/components/app/chat/message-menu-kit';
import { copyableMediaUrl } from '@/lib/copy-media';
import { LiveChatOnlineCount } from '@/components/app/chat/LiveChatOnlineCount';
import { ChatTextSizeButton } from '@/components/app/chat/ChatTextSizeButton';

/**
 * A text message in the side panel, with the same cards every other chat
 * surface gives it: a native entity card for our own links, an OG preview for
 * an outside one. The panel was the last surface still printing a bare URL —
 * paste a store or a stage link into live chat and it read as a 🔗 with nothing
 * behind it, while the identical message carded up in a DM.
 *
 * `useDehubLinks` strips exactly the links being carded out of the printed
 * text, which is why the paragraph is skipped when nothing survives stripping.
 * The cards navigate in-app (see `DehubLinkEmbed`), so opening one keeps the
 * panel and the socket alive instead of reloading the page.
 */
/** Lines the side chat opens on, and reads back per press of Load older. */
const SIDE_CHAT_PAGE = 30;

function SidebarMessageBody({ content }: { content: string }) {
  const { links, displayText } = useDehubLinks(content);
  return (
    <>
      {displayText.trim() && (
        <TranslatableText text={displayText} className="chat-body text-xs text-zinc-300 break-words" as="p" auto="chat" />
      )}
      <DehubLinkEmbeds links={links} compact />
      <ChatLinkPreviews content={displayText} />
    </>
  );
}

/** Avatar with cascading fallback: primary → CDN → initials */
function SidebarAvatar({ src, address, name }: { src?: string | null; address?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);
  const cdnUrl = address ? buildAvatarCdnFallbackUrl(address, src ?? undefined) : undefined;
  const activeSrc = failed ? cdnUrl : (src ?? undefined);
  return (
    <Avatar className="w-6 h-6">
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

/** Sidebar chat badge */
function SidebarChatBadge({ badgeBalance, badgeLock, username }: { badgeBalance?: number | null; badgeLock?: BadgeLock | null; username?: string | null }) {
  return <BadgeIcon badgeBalance={badgeBalance} badgeLock={badgeLock} username={username} className="w-[1em] h-[1em]" />;
}

/** Compact reaction pills for sidebar */
function SidebarReactions({
  reactions,
  currentUserAddress,
  onReact,
  onRemoveReaction,
  messageId,
  ownLine,
}: {
  reactions: ReactionData;
  currentUserAddress?: string;
  onReact: (id: string, emoji: string) => void;
  onRemoveReaction: (id: string, emoji: string) => void;
  messageId: string;
  /** Your own line: a reaction opens the list of who left it. */
  ownLine?: boolean;
}) {
  const [showWho, setShowWho] = useState(false);
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
            data-chat-reaction-chip
            onClick={() => ownLine ? setShowWho(true) : mine ? onRemoveReaction(messageId, emoji) : onReact(messageId, emoji)}
            className={`group/reaction inline-flex items-center gap-0.5 text-[10px] px-0.5 py-0.5 transition-colors ${
              mine
                ? 'text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span className="text-xs inline-flex items-center"><InlineEmoji value={emoji} className="h-4 m-0" /></span>
            {mine && !ownLine ? (
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
      {showWho && <ChatReactorsDrawer messageId={messageId} reactions={reactions} onClose={() => setShowWho(false)} />}
    </div>
  );
}

interface SidebarChatProps {
  isActive: boolean;
}

export function SidebarChat({ isActive }: SidebarChatProps) {
  const { t: _copy } = _useCopy();
  // A tapped photo opens full screen, with Download.
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  // Back beside the feed (by any route): the full page's back arrow no longer
  // owes a trip back here.
  useEffect(() => { forgetChatOrigin(); }, []);
  const [replyTo, setReplyTo] = useState<SupabaseLiveChatMessage | null>(null);
  // Edits happen in the row itself rather than in the composer at the foot of
  // the rail — the composer is a 169-character single line shared with the
  // mention picker, and hijacking it would strand a half-typed message.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInitial, setEditInitial] = useState('');
  const [editDraft, setEditDraft] = useDraftState(editingId ? `chat:edit:${editingId}` : null, editInitial);
  const commitDraftEdit = async (id: string) => {
    if (!editDraft.trim()) return;
    try {
      const result = await editMessage(id, editDraft);
      if (result !== false && setEditDraft.complete(editDraft, editDraft)) setEditingId(current => current === id ? null : current);
    } catch { /* Keep the edit available for retry. */ }
  };

  const translateSignal = 0;
  const originalSignal = 0;
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  usePublicChatReading(isActive, scrollContainerRef);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const mediaSendInFlight = useRef(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  useEffect(() => {
    if (!imageFile) { setImagePreview(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);
  const navigate = useStableNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();

  const { rooms, isLoading: roomsLoading } = useLiveChatRooms();
  const roomId = rooms[0]?.id || null;
  const [newMessage, setNewMessage] = useDraft(roomId ? `room:${roomId}` : null);

  const mention = useMention({
    inputRef: textareaRef,
    onMentionInsert: (_user, newText) => setNewMessage(newText.slice(0, 169)),
  });

  // Auto-resize writes a fixed inline height while the user types. Clearing
  // the controlled value after send does not clear that style, so a composer
  // that reached several lines otherwise stays tall with an empty value.
  useLayoutEffect(() => {
    if (!newMessage && textareaRef.current) {
      textareaRef.current.style.height = '';
    }
  }, [newMessage]);

  const {
    messages, isLoading: messagesLoading, isSending, send, retrySend, discardSend, addReaction, removeReaction, editMessage, deleteMessage,
    hasOlder, loadingOlder, loadOlder: loadOlderPage, signInWall,
  } = useLiveChatMessages(roomId, { pageSize: SIDE_CHAT_PAGE });
  const { onlineCount } = useLiveChatPresence(roomId);

  // Buy alerts
  const buyAlerts = useBuyAlerts();
  const { isHidden: buyBotHidden, hide: hideBuyBot } = useBuyBotHidden();

  // Assistant replies are real chat messages from the API now, so they already
  // arrive inside `messages`. The local engine is a fallback for deployments
  // where the API side is not live yet, and stands down once a real one lands.
  useAssistantReplyEngine(messages);
  const localAssistantReplies = useAssistantReplies();

  // Merge livechat messages + buy alerts + any local fallback replies
  type MergedItem =
    | { type: 'message'; data: typeof messages[0] }
    | { type: 'buy_alert'; data: BuyAlertMessage }
    | { type: 'assistant'; data: AssistantReply };
  const mergedItems: MergedItem[] = useMemo(() => {
    const items: MergedItem[] = [
      ...messages.map((m) => ({ type: 'message' as const, data: m })),
      // Buy alerts sit beside the history that is loaded, never further back.
      ...(buyBotHidden ? [] : buyAlerts
        .filter((a) => !messages.length || a.created_at >= messages[0].created_at)
        .map((a) => ({ type: 'buy_alert' as const, data: a }))),
      ...localAssistantReplies.map((a) => ({ type: 'assistant' as const, data: a })),
    ];
    const tsOf = (it: MergedItem) =>
      it.type === 'assistant' ? it.data.timestamp.getTime() : new Date(it.data.created_at).getTime();
    items.sort((a, b) => tsOf(a) - tsOf(b));
    return items;
  }, [messages, buyAlerts, localAssistantReplies, buyBotHidden]);

  // The rail is only 400px tall. Mount recent rows first so old link previews,
  // badges and media do not compete with the feed at startup.
  const [visibleCount, setVisibleCount] = useState(SIDE_CHAT_PAGE);
  const olderAnchor = useRef<{ top: number; height: number } | null>(null);
  /** Set while older rows are being added above, so the list does not jump to the newest line. */
  const addingOlder = useRef(false);
  const visibleItems = mergedItems.slice(-visibleCount);
  const hiddenLoaded = mergedItems.length > visibleCount;
  // Rows already loaded are shown first; after that each press reads the next
  // page of history from the server, all the way back to the first message.
  const loadOlder = async () => {
    if (addingOlder.current) return;
    const el = scrollContainerRef.current;
    if (el) olderAnchor.current = { top: el.scrollTop, height: el.scrollHeight };
    addingOlder.current = true;
    if (!hiddenLoaded) await loadOlderPage();
    setVisibleCount(count => count + SIDE_CHAT_PAGE);
  };
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const anchor = olderAnchor.current;
    if (el && anchor) el.scrollTop = anchor.top + el.scrollHeight - anchor.height;
    olderAnchor.current = null;
    // Released after this commit's other effects have run, so none of them
    // reads the longer list as a new message and jumps to the bottom.
    const release = window.setTimeout(() => { addingOlder.current = false; }, 60);
    return () => window.clearTimeout(release);
  }, [visibleCount]);

  // Scroll to bottom (jump, not animated). For initial load we retry a few times
  // because async content (avatars, link previews, GIFs) keeps growing scrollHeight
  // after the initial paint.
  const scrollToBottom = useCallback((retry = false) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (retry) {
      // Retry after async images/link previews settle.
      [50, 150, 350, 800].forEach((ms) => {
        setTimeout(() => {
          const node = scrollContainerRef.current;
          if (node) node.scrollTop = node.scrollHeight;
        }, ms);
      });
    }
  }, []);

  // First time messages become available — jump to bottom synchronously before paint
  // so the user never sees a "starts at top then jumps" flash.
  const didInitialScrollRef = useRef(false);
  useLayoutEffect(() => {
    if (didInitialScrollRef.current) return;
    if (mergedItems.length === 0) return;
    const el = scrollContainerRef.current;
    // Tab may be hidden (clientHeight 0) on initial mount — defer until visible.
    if (!el || el.clientHeight === 0) return;
    didInitialScrollRef.current = true;
    scrollToBottom(true);
  }, [mergedItems.length, scrollToBottom]);

  // CSS-hidden tabs do not reliably produce a ResizeObserver transition, and
  // browsers can reset a hidden scroll container to the top. The tab owner
  // knows exactly when Chat becomes visible, so re-anchor on every activation.
  useLayoutEffect(() => {
    if (!isActive || mergedItems.length === 0 || addingOlder.current) return;
    didInitialScrollRef.current = true;
    scrollToBottom(true);
  }, [isActive, mergedItems.length, scrollToBottom]);

  // Rows keep growing after they land (images, reply quotes, reactions), so
  // keep the newest line fully in view while the reader is at the bottom.
  const followLatest = useRef(true);
  useStickToBottom(scrollContainerRef, () => followLatest.current && !addingOlder.current && !olderAnchor.current, isActive);

  // When subsequent new messages arrive, smooth-scroll to bottom.
  useEffect(() => {
    if (!didInitialScrollRef.current || addingOlder.current) return;
    if (mergedItems.length > 0) {
      scrollToBottom();
    }
  }, [mergedItems.length, scrollToBottom]);


  const handleVoiceRecordingComplete = useCallback(async (blob: Blob, _duration: number) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const toastId = 'sidebarchat-voice-upload';
    toast.loading(_copy("copy.97a0afff525e", { defaultValue: "Uploading voice note..." }), { id: toastId });
    try {
      const { url, duration } = await uploadLiveChatVoice(blob);
      await send('', 'audio', undefined, replyTo?.id, url, duration);
      toast.success(_copy("copy.690c816e9745", { defaultValue: "Voice note sent!" }), { id: toastId });
    } catch (err: any) {
      console.error('[SidebarChat] Voice upload failed:', err);
      if (wasShownToUser(err)) toast.dismiss(toastId);
      else toast.error(err?.message || _copy("copy.615d555f779c", { defaultValue: "Failed to send voice note" }), { id: toastId });
    }
  }, [isAuthenticated, openLoginModal, send, replyTo, _copy]);

  const handleSend = async () => {
    if (!isAuthenticated) { openLoginModal(); return; }
    const trimmed = newMessage.trim();
    if ((!trimmed && !imageFile) || !roomId || mediaSendInFlight.current) return;
    mediaSendInFlight.current = true;
    const pendingImage = imageFile;
    const replyToId = replyTo?.id;
    try {
      if (pendingImage) {
        setUploadingImage(true);
        await sendPublicChatImage(pendingImage, trimmed, replyToId, uploadChatImage, send);
        setImageFile(current => current === pendingImage ? null : current);
      } else {
        // The line shows in the list at once (with a small ring until it
        // lands, Retry if it fails), so the box lets go of it straight away.
        setNewMessage(current => current === newMessage ? '' : current);
        setReplyTo(current => current?.id === replyToId ? null : current);
        await send(trimmed, 'text', undefined, replyToId);
      }
      setReplyTo(current => current?.id === replyToId ? null : current);
      setNewMessage(current => current === newMessage ? '' : current);
    } catch (err) {
      console.error('[SidebarChat] Send failed:', err);
      if (!wasShownToUser(err)) toast.error(_copy("copy.66b8e077d85f", { defaultValue: "Failed to send message" }));
    } finally {
      mediaSendInFlight.current = false;
      setUploadingImage(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  const handleGifSelect = async (gifUrl: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    if (mediaSendInFlight.current) return;
    const replyToId = replyTo?.id;
    setReplyTo(null);
    try {
      // The URL belongs in the attachment: passed as the body it arrived with
      // no image_url at all, so the row below fell through to the text branch
      // and the GIF rendered as a link on every client.
      await send('', 'gif', gifUrl, replyToId);
    } catch (err) {
      console.error('[SidebarChat] GIF send failed:', err);
      if (!wasShownToUser(err)) toast.error(_copy("copy.f59dcbd274a8", { defaultValue: "Failed to send GIF" }));
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
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReact = useCallback((messageId: string, emoji: string) => {
    if (!isAuthenticated) { openLoginModal(); return; }
    // Toggle: remove if already reacted
    const msg = messages.find((m) => m.id === messageId);
    const myReaction = walletAddress && msg?.reactions?.[emoji]?.some(
      (a) => a.toLowerCase() === walletAddress.toLowerCase()
    );
    if (myReaction) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
    }
  }, [isAuthenticated, walletAddress, messages, addReaction, removeReaction]);

  // Right-click a line: the same message menu as the full chat, with who reacted.
  const menuPoint = useMenuPoint();
  const [menuMsg, setMenuMsg] = useState<SupabaseLiveChatMessage | null>(null);
  const openLineMenu = (e: React.MouseEvent<HTMLDivElement>, msg: SupabaseLiveChatMessage) => {
    if (msg.client_key && msg.send_state === 'failed') return;
    if (keepBrowserMenu(e.target as Element, e.currentTarget)) return;
    e.preventDefault();
    setMenuMsg(msg);
    menuPoint.openAt({ x: e.clientX, y: e.clientY });
  };
  const menuMine = menuMsg && walletAddress
    ? Object.entries(menuMsg.reactions ?? {}).filter(([, who]) => who.some((a) => a.toLowerCase() === walletAddress.toLowerCase())).map(([emoji]) => emoji)
    : [];
  const menuActions: MessageMenuAction[] = [];
  if (menuMsg) {
    const own = !!walletAddress && menuMsg.sender_address?.toLowerCase() === walletAddress.toLowerCase();
    if (isAuthenticated) menuActions.push({ key: 'reply', icon: menuIcons.reply, label: _copy('copy.c253f451bdd5', { defaultValue: 'Reply' }), onSelect: () => setReplyTo(menuMsg), hint: 'R' });
    if (own && (!menuMsg.message_type || menuMsg.message_type === 'text')) menuActions.push({ key: 'edit', icon: menuIcons.edit, label: _copy('copy.464c4ffd019e', { defaultValue: 'Edit' }), onSelect: () => { setEditingId(menuMsg.id); setEditInitial(menuMsg.content || ''); }, hint: 'E' });
    if (menuMsg.content?.trim() && (!menuMsg.message_type || menuMsg.message_type === 'text')) menuActions.push({
      key: 'copy', icon: menuIcons.copy, label: _copy('msgMenu.copyText', { defaultValue: 'Copy Text' }), hint: 'C',
      onSelect: () => { void navigator.clipboard?.writeText(menuMsg.content).then(() => toast.success(_copy('chatHold.copied', { defaultValue: 'Copied' })), () => undefined); },
    });
    const sideMediaUrl = menuMsg.message_type === 'image' ? copyableMediaUrl(getMediaUrl(menuMsg.image_url) || menuMsg.image_url)
      : menuMsg.message_type === 'gif' ? copyableMediaUrl(menuMsg.image_url || menuMsg.content) : null;
    if (sideMediaUrl) menuActions.push({ key: 'copy-media', icon: menuIcons.copyMedia, label: _copy('msgMenu.copyMedia', { defaultValue: 'Copy Media' }), onSelect: () => copyMediaWithToast(sideMediaUrl, menuMsg.message_type === 'gif' ? 'gif' : 'image', _copy) });
    if (own) menuActions.push({ key: 'delete', divided: true, destructive: true, icon: menuIcons.delete, label: _copy('copy.e2d0a54968ea', { defaultValue: 'Delete' }), onSelect: () => void deleteMessage(menuMsg.id) });
  }
  const lineMenu = menuPoint.mounted && menuMsg ? (
    <MessageMenu
      point={menuPoint.point}
      onClose={menuPoint.close}
      quickReactions={QUICK_CHAT_REACTIONS}
      mine={menuMine}
      onReact={(emoji) => handleReact(menuMsg.id, emoji)}
      actions={menuActions}
      reactors={menuMsg.reactions ? { reactions: menuMsg.reactions, remoteMessageId: menuMsg.id } : null}
      meta={messageMenuMeta(menuMsg.created_at, menuMsg.is_edited)}
    />
  ) : null;

  const isLoading = roomsLoading || messagesLoading;

  return (
    <div data-sidebar-chat className="flex flex-col h-full pl-px">
      {lineMenu}
      <SharedTranslationContext.Provider value={{ translateSignal, originalSignal, requestTranslate: () => {}, requestOriginal: () => {} }}>
      <div className="relative flex-1">
        <div
          ref={scrollContainerRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            followLatest.current = el.scrollHeight - el.clientHeight - el.scrollTop < 120;
          }}
          className="absolute inset-0 chat-text-zone overflow-y-auto overflow-x-hidden py-2 space-y-2"
        >
          {!isLoading && (hiddenLoaded || hasOlder) && !signInWall && (
            <button type="button" data-side-chat-older onClick={loadOlder} disabled={loadingOlder} className="w-full py-2 text-xs text-zinc-400 hover:text-white disabled:opacity-60">
              {_copy("copy.f17671d83db0", { defaultValue: "Load older messages" })}
            </button>
          )}
          {!isLoading && !hiddenLoaded && signInWall && (
            <button type="button" data-side-chat-sign-in onClick={() => openLoginModal()} className="w-full py-2 text-xs text-zinc-400 hover:text-white">
              {_copy("copy.27c26a5a38b3", { defaultValue: "Sign in to see older messages" })}
            </button>
          )}
          {!isLoading && !hiddenLoaded && !hasOlder && !signInWall && messages.length > 0 && (
            <p data-side-chat-start className="py-2 text-center text-[11px] text-zinc-500">
              {_copy("copy.feaf753f6557", { defaultValue: "Start of the chat" })}
            </p>
          )}
          {isLoading ? (
            <>
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2"
                  style={{ paddingLeft: '10px', paddingRight: '10px' }}
                >
                  <Skeleton className="w-6 h-6 rounded-full bg-white/[0.06] flex-shrink-0" />
                  <div className="space-y-1 flex-1 min-w-0">
                    <Skeleton className="h-3 w-16 bg-white/[0.06]" />
                    <Skeleton className="h-3 w-32 bg-white/[0.06]" />
                  </div>
                </div>
              ))}
            </>
          ) : mergedItems.length === 0 ? (
            <AppState icon="messages" title={_copy("copy.f42e0f66017d", { defaultValue: "No messages yet" })} description={_copy("copy.937510f750fd", { defaultValue: "Be the first to say hello." })} size="compact" className="h-full" />
          ) : (
            visibleItems.map((item, index) => {
              if (item.type === 'buy_alert') {
                if (buyBotHidden) return null;
                return (
                  <BuyAlertCard
                    key={`buy-alert-${item.data.id}`}
                    content={item.data.content}
                    timestamp={item.data.created_at}
                    onHide={hideBuyBot}
                  />
                );
              }
              // Both shapes render identically: a real assistant message from
              // the API, or a local fallback reply while the API side is not
              // live. Normalise first so the markup stays single-source.
              const assistantView =
                item.type === 'assistant'
                  ? {
                      id: `assistant-${item.data.id}`,
                      content: item.data.content,
                      replyToName: item.data.replyToName,
                      at: item.data.timestamp.toISOString(),
                    }
                  : isAssistantAddress(item.data.sender_address)
                    ? {
                        id: item.data.id,
                        content: item.data.content,
                        replyToName: item.data.reply_to?.sender_name,
                        at: item.data.created_at,
                      }
                    : null;

              if (assistantView) {
                return (
                  <div
                    key={assistantView.id}
                    data-message-id={assistantView.id}
                    className="group relative"
                    style={{ paddingLeft: '10px', paddingRight: '10px' }}
                  >
                    <div className="flex items-start gap-2">
                      <Avatar className="w-6 h-6 flex-shrink-0">
                        <AvatarImage src={assistantAvatar} alt={_copy("copy.a39a7ffad4a3", { defaultValue: "assistant" })} />
                        <AvatarFallback className="bg-primary/20 text-primary">
                          <Sparkles className="w-3 h-3" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        {assistantView.replyToName && (
                          <div className="flex items-center gap-1 text-[10px] text-zinc-500 mb-0.5">
                            <CornerDownRight className="w-2.5 h-2.5" />
                            <span className="font-medium">{assistantView.replyToName}</span>
                          </div>
                        )}
                        <span className="inline-flex items-baseline gap-1.5">
                          <span className="text-xs font-semibold text-white">{_copy("copy.a39a7ffad4a3", { defaultValue: "assistant" })}</span>
                          <span className="text-[8px] uppercase tracking-wide px-1 py-px rounded bg-primary/20 text-primary border border-primary/30">
                            AI
                          </span>
                          <span className="text-zinc-600 text-[10px]">{formatTimeAgo(assistantView.at)}</span>
                        </span>
                        <p className="chat-body text-xs text-zinc-300 break-words whitespace-pre-wrap">{assistantView.content}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              // Unreachable — a local fallback reply always matched above.
              if (item.type !== 'message') return null;

              const msg = item.data;
              // Telegram-style runs: a second line from the same person within
              // a few minutes drops the repeated face and name, so a back and
              // forth reads as a conversation instead of a list of cards. The
              // name stays for screen readers.
              const prev = index > 0 ? visibleItems[index - 1] : null;
              const continued = !msg.reply_to
                && prev?.type === 'message'
                && !!msg.sender_address
                && prev.data.sender_address === msg.sender_address
                && Math.abs(new Date(msg.created_at).getTime() - new Date(prev.data.created_at).getTime()) < 5 * 60_000;
              const showSendState = !!msg.client_key && msg.send_state === 'failed';
              const avatarUrl = buildAvatarUrl(msg.sender_address || '', msg.sender_avatar_url);
              const name = msg.sender_display_name || msg.sender_username || msg.sender_address?.slice(0, 8) || _copy("copy.90395d452a30", { defaultValue: "Anon" });
              const handle = msg.sender_username;
              const goToProfile = handle ? () => {
                // Seed what the row already shows, so the profile opens with
                // this person's photo and name instead of a blank placeholder.
                seedProfileCache(queryClient, { address: msg.sender_address || undefined, username: handle, displayName: name, avatarUrl }, walletAddress || undefined);
                navigate(`/${handle}`);
              } : undefined;
              return (
                <div key={msg.client_key ?? msg.id} data-message-id={msg.id} data-chat-own={(!!walletAddress && msg.sender_address?.toLowerCase() === walletAddress.toLowerCase()) || undefined} data-chat-continued={continued || undefined} data-msg-menu-open={menuPoint.point && menuMsg?.id === msg.id ? '' : undefined} onContextMenu={(e) => openLineMenu(e, msg)} onDoubleClick={(e) => dblClickReply(e, isAuthenticated && (() => setReplyTo(msg)))} className={`group relative transition-colors duration-500${continued ? ' -mt-1.5' : ''}`} style={{ paddingLeft: '10px', paddingRight: '10px' }}>
                  {/* Reply indicator – click to scroll to original */}
                  {msg.reply_to && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = scrollContainerRef.current?.querySelector(`[data-message-id="${msg.reply_to!.id}"]`);
                        if (target) {
                          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          (target as HTMLElement).classList.add('bg-white/10');
                          setTimeout(() => (target as HTMLElement).classList.remove('bg-white/10'), 1500);
                        }
                      }}
                      className="flex max-w-[calc(100%-2rem)] overflow-hidden items-center gap-1 text-[10px] text-zinc-500 ml-8 mb-0.5 hover:text-zinc-300 transition-colors cursor-pointer"
                    >
                      <CornerDownRight className="w-2.5 h-2.5" />
                      <span className="font-medium">{msg.reply_to.sender_name}</span>
                      <span className="truncate max-w-[120px]">{msg.reply_to.content}</span>
                    </button>
                  )}
                  <div className="relative flex items-start gap-2">
                    {continued ? (
                      <span aria-hidden="true" className="w-6 flex-shrink-0" />
                    ) : (
                    <button onClick={goToProfile} onPointerEnter={handle ? () => preloadRoute('/app/profile') : undefined} disabled={!handle} className={`flex-shrink-0 ${handle ? 'cursor-pointer' : 'cursor-default'}`}>
                      <SidebarAvatar src={avatarUrl} address={msg.sender_address} name={name} />
                    </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className={continued && !showSendState ? 'sr-only' : 'inline-flex items-baseline gap-1.5'}>
                        <span className="relative inline-flex items-baseline gap-1 shrink min-w-0 pr-3">
                          <button onClick={goToProfile} disabled={!handle} className={`text-xs font-semibold text-white truncate ${handle ? 'hover:underline cursor-pointer' : 'cursor-default'}`}>{name}</button>
                          <SidebarChatBadge badgeBalance={msg.sender_badge_balance} badgeLock={msg.sender_badge_lock} username={msg.sender_username} />
                        </span>
                        <span className="text-zinc-600 text-[10px]">{formatTimeAgo(msg.created_at)}</span>
                        {msg.client_key && (
                          <SendStatus
                            state={msg.send_state}
                            className="self-center text-zinc-500"
                            onRetry={() => retrySend(msg.client_key!)}
                            onDiscard={() => discardSend(msg.client_key!)}
                          />
                        )}
                      </span>
                      {editingId === msg.id ? (
                        <div className="mt-0.5">
                          <textarea
                            autoFocus
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void commitDraftEdit(msg.id);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingId(null);
                              }
                            }}
                            rows={2}
                            maxLength={169}
                            className="w-full resize-none rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1 text-xs text-white outline-none focus:border-white/30"
                          />
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                            <button
                              onClick={() => {
                                void commitDraftEdit(msg.id);
                              }}
                              className="text-white hover:underline"
                            >{_copy("copy.1509f561f241", { defaultValue: "Save" })}</button>
                            <button onClick={() => setEditingId(null)} className="hover:text-zinc-300">{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</button>
                          </div>
                        </div>
                      ) : msg.message_type === 'image' && msg.image_url ? (
                        <img src={getMediaUrl(msg.image_url)} alt="" className="max-w-full max-h-24 rounded mt-0.5 cursor-zoom-in" onClick={() => setViewingImage(getMediaUrl(msg.image_url) || msg.image_url)} />
                      ) : msg.message_type === 'gif' && (msg.image_url || msg.content) ? (
                        <img src={outsideImage(msg.image_url || msg.content)} alt="GIF" className="max-w-full max-h-20 rounded mt-0.5" />
                      ) : (msg.message_type === 'audio' || msg.message_type === 'voice') && (msg.audio_url || msg.image_url) ? (
                        <div className="mt-1">
                          <VoiceWaveformPlayer src={msg.audio_url || msg.image_url || ''} />
                        </div>
                      ) : (
                        <SidebarMessageBody content={msg.content} />
                      )}
                      {/* Reactions */}
                      {msg.reactions && (
                        <SidebarReactions
                          reactions={msg.reactions}
                          currentUserAddress={walletAddress || undefined}
                          onReact={addReaction}
                          onRemoveReaction={removeReaction}
                          messageId={msg.id}
                          ownLine={!!walletAddress && msg.sender_address?.toLowerCase() === walletAddress.toLowerCase()}
                        />
                      )}
                    </div>
                    {/* Every action lives in the line's menu (right-click, or this
                        "..." on hover for keyboard users). */}
                    {editingId !== msg.id && !(msg.client_key && msg.send_state === 'failed') && (
                      <div data-sidebar-chat-actions className="pointer-events-none absolute right-0 top-0 z-10 rounded-l-md bg-zinc-900/90 pl-0.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                        <MessageMoreButton
                          className="h-5 w-5"
                          onOpen={(point) => { setMenuMsg(msg); menuPoint.openAt(point); }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      </SharedTranslationContext.Provider>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-1.5 mx-3 mb-1 px-2 py-1 bg-zinc-800/70 rounded-lg">
          <Reply className="w-3 h-3 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-white">
              {replyTo.sender_display_name || replyTo.sender_username || _copy("copy.b512d97e7cbf", { defaultValue: "User" })}
            </span>
            <p className="text-[10px] text-zinc-400 truncate">{replyTo.content || _copy("copy.d357175cfe89", { defaultValue: "Media" })}</p>
          </div>
          <button aria-label={_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })} onClick={() => setReplyTo(null)} className="flex-shrink-0 p-0.5 text-zinc-500 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Input */}
      <div data-sidebar-chat-composer className="pl-3 pr-[14px] py-3">
        {imagePreview && (
          <div className="relative mb-2 w-fit">
            <img src={imagePreview} alt={imageFile?.name || ''} className="h-16 max-w-full rounded-lg object-contain" />
            <button type="button" disabled={uploadingImage} onClick={() => setImageFile(null)} aria-label={_copy("copy.595b066a8838", { defaultValue: "Remove attachment" })} className="absolute -right-1 -top-1 rounded-full bg-zinc-800 p-1 text-white">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <input ref={imageInputRef} type="file" accept={PUBLIC_CHAT_IMAGE_TYPES.join(',')} className="hidden" aria-label={_copy("copy.21298c62c8e5", { defaultValue: "Attach a file" })} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const check = validatePublicChatMedia(file);
          if (!check.ok) { toast.error(check.error); return; }
          setImageFile(file);
        }} />
        <div>
          <Textarea
            ref={textareaRef}
            placeholder={_copy("copy.69518e684f06", { defaultValue: "Type a message..." })}
            value={newMessage}
            onChange={(e) => {
              const val = e.target.value;
              if (val.length <= 500) {
                setNewMessage(val);
                mention.handleInput(val, e.target.selectionStart);
              }
              // Auto-resize — deferred to avoid forced synchronous reflow
              const ta = e.target;
              requestAnimationFrame(() => {
                ta.style.height = 'auto';
                ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
              });
            }}
            onKeyDown={handleKeyDown}
            maxLength={169}
            className="chat-text-input min-h-[36px] max-h-32 resize-none text-sm bg-transparent border-none text-white placeholder:text-zinc-500 p-0 pt-1 pr-1 focus-visible:ring-0 focus-visible:ring-offset-0 leading-[1.35]"
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
          <div data-live-chat-toolbar className="flex items-center justify-end gap-2 pt-1">
            {roomId && (
              <div className="mr-auto flex items-center gap-3">
                <LiveChatOnlineCount count={onlineCount} />
                <ChatTextSizeButton />
                {/* Opens the full chat page in this tab: it slides in over the
                    feed (lib/chat-expand), and back / Esc returns here. */}
                <button
                  type="button"
                  data-chat-fullscreen
                  aria-label={_copy('copy.c461dbb2bab7', { defaultValue: 'Fullscreen' })}
                  title={_copy('copy.c461dbb2bab7', { defaultValue: 'Fullscreen' })}
                  onClick={expandChat}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-white"
                >
                  <Fullscreen className="h-4 w-4" />
                </button>
              </div>
            )}
            <Button type="button" data-chat-composer-action variant="ghost" size="icon" disabled={uploadingImage || isSending} aria-label={_copy("copy.21298c62c8e5", { defaultValue: "Attach a file" })} title={_copy("copy.21298c62c8e5", { defaultValue: "Attach a file" })} onClick={() => {
              if (!isAuthenticated) { openLoginModal(); return; }
              imageInputRef.current?.click();
            }} className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700">
              <Attach className="h-5 w-5" />
            </Button>
            <VoiceRecorder
              onRecordingComplete={handleVoiceRecordingComplete}
              disabled={isSending || uploadingImage}
            />
            <EmojiGifPicker
              onEmojiSelect={handleEmojiSelect}
              onGifSelect={handleGifSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSend}
              data-chat-composer-action
              disabled={(!newMessage.trim() && !imageFile) || isSending || uploadingImage}
              className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
            >
              {isSending || uploadingImage ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
      <FullscreenImageViewerLazy
        images={viewingImage ? [viewingImage] : []}
        initialIndex={0}
        isOpen={!!viewingImage}
        onClose={() => setViewingImage(null)}
        downloadable
      />
    </div>
  );
}
