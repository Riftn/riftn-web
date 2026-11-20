import { outsideImage } from '@/lib/outside-image';
import { useTranslation as _useCopy } from 'react-i18next';
import { InPlaceEditField, editOnClick } from './InPlaceEdit';
import { cn } from '@/lib/utils';
import { useState, useCallback, useRef, memo } from 'react';
import { toast } from 'sonner';
import Copy from '@/components/ui/cut-icons/copy';
import SearchIcon from '@/components/ui/cut-icons/search';
import { useHoldMenu } from '@/hooks/use-hold-menu';
import { useSwipeReply } from '@/hooks/use-swipe-reply';
import { dblClickReply } from '@/lib/dblclick-reply';
import { ChatHoldSheet, isTouchHold, type ChatHoldAction } from './ChatHoldSheet';
import { MessageMenu, type MessageMenuAction } from './MessageMenu';
import { copyLinkLabel } from '@/lib/chat-message-link';
import { menuIcons, messageMenuMeta, keepBrowserMenu, useMenuPoint, MessageMoreButton, copyMediaWithToast } from './message-menu-kit';
import { copyableMediaUrl } from '@/lib/copy-media';
import Images from '@/components/ui/cut-icons/images';
import { ShieldBan, Loader2, RotateCcw, CornerDownRight } from "lucide-react";
import ShieldCheck from "@/components/ui/cut-icons/security";
import Languages from "@/components/ui/cut-icons/language";
import Reply from "@/components/ui/cut-icons/reply";
import Trash2 from "@/components/ui/cut-icons/delete";
import Pencil from "@/components/ui/cut-icons/edit";

import X from "@/components/ui/cut-icons/close";

import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { TranslatableText, renderTextWithLinks } from '../TranslatableText';
import { ChatLinkPreviews } from './ChatLinkPreviews';
import { DehubLinkEmbeds, useDehubLinks } from '@/components/app/cards/DehubLinkEmbedsLazy';
import { AssetRefCards, useAssetRefsInText } from '@/components/app/cards/AssetRefCards';
import { useTranslation as useTextTranslation } from '../TranslatableText';
import { useTranslateUp } from '@/hooks/use-translate-up';
import { useStableNavigate } from '@/hooks/use-stable-navigate';
import { useQueryClient } from '@tanstack/react-query';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { useProfileLocalTime } from '@/hooks/use-profile-local-time';
import { seedProfileCache } from '@/lib/profile-cache-seed';
import type { BadgeLock } from '@/lib/staking-badges';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { VoiceWaveformPlayer } from './VoiceWaveformPlayer';
import { QUICK_CHAT_REACTIONS } from './reaction-options';
import { ReactionGlyph, RollingCount, useReactionHost } from './ReactionArrival';
import { ChatReactorsDrawer } from './ChatReactorsDrawer';
import { SendStatus } from './SendStatus';
import { FullscreenImageViewerLazy } from '@/components/app/cards/FullscreenImageViewerLazy';
import { profilePath } from '@/lib/profile-path';

/** Avatar with cascading fallback: primary → CDN → initials */
function ChatAvatar({ src, address, name, className }: { src?: string; address?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [cdnFailed, setCdnFailed] = useState(false);
  const cdnUrl = address ? buildAvatarCdnFallbackUrl(address, src) : undefined;
  const activeSrc = failed ? cdnUrl : src;
  return (
    <Avatar className={className}>
      {activeSrc && !cdnFailed && (
        <AvatarImage
          src={activeSrc}
          onError={() => failed ? setCdnFailed(true) : setFailed(true)}
        />
      )}
      <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
        {name.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Reaction data: emoji → list of addresses who reacted */
export interface ReactionData {
  [emoji: string]: string[];
}

export interface ReplyToData {
  id: string;
  content: string;
  senderName: string;
}

export interface Message {
  id: string;
  userId: string;
  userName: string;
  userHandle?: string;
  userAvatar?: string;
  badgeBalance?: number | null;
  /** Grandfathered tier, when the payload carries one. */
  badgeLock?: BadgeLock | null;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'gif' | 'audio';
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  reactions?: ReactionData;
  replyTo?: ReplyToData;
  /** Rewritten after it was posted — labelled so nobody is quoted on words they replaced. */
  isEdited?: boolean;
  /** A moderator pinned it for the room. */
  isPinned?: boolean;
  /** Local only: the id your own line was first drawn under (kept as the React key). */
  clientKey?: string;
  /** Local only: your line is still going out, or failed to. */
  sendState?: 'sending' | 'failed';
}

interface ChatMessageProps {
  message: Message;
  showActions?: boolean;
  moderators?: string[];
  currentUserAddress?: string;
  onBan?: (userId: string, userName: string) => void;
  onUnban?: (userId: string, userName: string) => void;
  onDelete?: (messageId: string) => void;
  /** Save a rewritten body. Only offered on your own text messages. */
  onEdit?: (messageId: string, content: string) => void | Promise<void | boolean>;
  onReact?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
  onReply?: (message: Message) => void;
  /** Resend / drop one of your own lines that failed, by its client key. */
  onRetrySend?: (clientKey: string) => void;
  onDiscardSend?: (clientKey: string) => void;
  /** Open the room's search on everything this line's sender has said. */
  onSeeMessages?: (message: Message) => void;
  /** "Copy link": a riftn.com link that opens this chat on this line. */
  onCopyLink?: (message: Message) => void;
  /** Live chat on phones: frame the held line, and outline the line being answered. */
  holdFrame?: boolean;
  replying?: boolean;
  /** Moderators: pin or unpin this line for the room. */
  onTogglePin?: (message: Message) => void;
  isPinned?: boolean;
}

/** Inline moderator badge shown next to the username */
function ModeratorBadge({ address, moderators }: { address: string; moderators?: string[] }) {
  const { t: _copy } = _useCopy();
  const isMod = moderators?.some(
    (mod) => mod.toLowerCase() === address.toLowerCase()
  );
  if (!isMod) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Same quiet grey chip as the app's live chat (see index.css
            [data-chat-mod-badge]); one look for every theme. */}
        <span data-chat-mod-badge className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none">
          {_copy("copy.a4d1abed0b2b", { defaultValue: "MOD" })}</span>
      </TooltipTrigger>
      <TooltipContent>{_copy("copy.6748ec8b7668", { defaultValue: "Moderator" })}</TooltipContent>
    </Tooltip>
  );
}

/** Inline staking badge for chat messages */
function StakingBadgeInline({ badgeBalance, badgeLock, username }: { badgeBalance?: number | null; badgeLock?: BadgeLock | null; username?: string }) {
  return <BadgeIcon badgeBalance={badgeBalance} badgeLock={badgeLock} username={username} className="w-[1em] h-[1em]" />;
}

/** Reaction pills displayed below a message */
function ReactionBar({
  reactions,
  currentUserAddress,
  onReact,
  onRemoveReaction,
  messageId,
  ownLine,
}: {
  reactions: ReactionData;
  currentUserAddress?: string;
  onReact?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
  messageId: string;
  /** Your own line: a reaction opens the list of who left it. */
  ownLine?: boolean;
}) {
  useReactionHost(messageId);
  const [showWho, setShowWho] = useState(false);
  const entries = Object.entries(reactions).filter(([, addrs]) => addrs.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {entries.map(([emoji, addresses]) => {
        const myReaction = currentUserAddress
          ? addresses.some((a) => a.toLowerCase() === currentUserAddress.toLowerCase())
          : false;
        return (
          <button
            key={emoji}
            data-chat-reaction-chip
            onClick={() => {
              if (ownLine) {
                setShowWho(true);
              } else if (myReaction) {
                onRemoveReaction?.(messageId, emoji);
              } else {
                onReact?.(messageId, emoji);
              }
            }}
            className={`group/reaction inline-flex items-center gap-1 text-xs px-1 py-0.5 transition-colors ${
              myReaction
                ? 'text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ReactionGlyph messageId={messageId} emoji={emoji} addresses={addresses} me={currentUserAddress} className="h-4 m-0" />
            {myReaction && !ownLine ? (
              <>
                <RollingCount value={addresses.length} className="text-[10px] group-hover/reaction:hidden" />
                <X className="w-3 h-3 hidden group-hover/reaction:block text-white" />
              </>
            ) : (
              <RollingCount value={addresses.length} className="text-[10px]" />
            )}
          </button>
        );
      })}
      {showWho && <ChatReactorsDrawer messageId={messageId} reactions={reactions} onClose={() => setShowWho(false)} />}
    </div>
  );
}

// memo: the public-chat list re-renders on every incoming message / composer
// keystroke in the parent — without this every visible message re-renders too.
export const ChatMessage = memo(function ChatMessage({
  message,
  showActions,
  moderators,
  currentUserAddress,
  onBan,
  onUnban,
  onDelete,
  onEdit,
  onReact,
  onRemoveReaction,
  onReply,
  onRetrySend,
  onDiscardSend,
  onSeeMessages,
  onCopyLink,
  holdFrame,
  replying,
  onTogglePin,
  isPinned = false,
}: ChatMessageProps) {
  // Your own line carries a small ring while it is going out; when it lands
  // the ring stops in its fixed box, so the line never shifts.
  const sendMark = message.clientKey ? (
    <SendStatus
      state={message.sendState}
      className="text-zinc-500"
      onRetry={onRetrySend && (() => onRetrySend(message.clientKey!))}
      onDiscard={onDiscardSend && (() => onDiscardSend(message.clientKey!))}
    />
  ) : null;
  const { t: _copy } = _useCopy();
  const navigate = useStableNavigate();
  const queryClient = useQueryClient();
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaret, setEditCaret] = useState<number | null>(null);

  const isMine = !!currentUserAddress && message.userId.toLowerCase() === currentUserAddress.toLowerCase();
  // Only the words are editable. A caption swap under an image or a voice note
  // changes what people think they are looking at, so those are delete-only.
  const canEdit = isMine && !!onEdit && message.type === 'text';
  const canDelete = isMine && !!onDelete;

  const startEditing = useCallback((caret: number | null = null) => {
    setEditCaret(caret);
    setIsEditing(true);
  }, []);
  const saveEdit = useCallback((next: string) => onEdit?.(message.id, next), [message.id, onEdit]);
  const stopEditing = useCallback(() => setIsEditing(false), []);
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslateLoading,
    error: translateError,
    isTooShort,
    handleTranslate,
    handleShowOriginal,
  } = useTextTranslation(message.content, 'chat');
  // Translate also translates every message above this one that still needs it.
  const translateUp = useTranslateUp(
    'room',
    String(message.id),
    message.timestamp,
    !isTranslated && !isTranslateLoading && !isTooShort && !!message.content?.trim(),
    handleTranslate,
  );

  // Community chat used to card up community links and nothing else — a store
  // item or an event dropped into a channel arrived as a bare URL.
  const { links: chatDehubLinks, displayText: chatLinkFreeText } = useDehubLinks(
    isTranslated ? translatedText : message.content,
  );
  const { refs: chatAssetRefs, displayText: chatDisplayText } = useAssetRefsInText(chatLinkFreeText);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };

  const handleProfileClick = () => {
    if (message.userHandle) {
      seedProfileCache(queryClient, { address: message.userId, username: message.userHandle, displayName: message.userName, avatarUrl: message.userAvatar }, currentUserAddress || undefined);
      navigate(profilePath(message.userHandle));
    }
  };

  const handleQuickReact = useCallback((emoji: string) => {
    // Toggle: if already reacted with this emoji, remove it
    const myReactions = message.reactions?.[emoji] || [];
    const alreadyReacted = currentUserAddress && myReactions.some(
      (a) => a.toLowerCase() === currentUserAddress.toLowerCase()
    );
    if (alreadyReacted) {
      onRemoveReaction?.(message.id, emoji);
    } else {
      onReact?.(message.id, emoji);
    }
  }, [message.id, message.reactions, currentUserAddress, onReact, onRemoveReaction]);

  const isClickable = !!message.userHandle;

  // Hold the line on a phone: a sheet with reactions and actions. Safari never
  // shows the hover buttons on a tap and a long press there only selected the
  // text, so on an iPhone there was no way to reply or react at all.
  const rowRef = useRef<HTMLDivElement>(null);
  useSwipeReply(rowRef, onReply ? () => onReply(message) : undefined);
  const [holdOpen, setHoldOpen] = useState(false);
  // Right-click with a mouse: the menu opens where the pointer is.
  const menuPoint = useMenuPoint();
  const authorLookup = holdOpen || menuPoint.mounted ? message.userId : undefined;
  const { data: author } = useDeHubProfile({ userId: authorLookup, address: currentUserAddress || undefined, enabled: !!authorLookup });
  const authorLocalTime = useProfileLocalTime(author?.customs?.publicTimeZone);
  const localTimeLabel = authorLocalTime
    ? _copy('profile.localTime', { defaultValue: 'Local time {{time}}', time: authorLocalTime })
    : undefined;
  const canHold = !message.sendState;
  const hold = useHoldMenu((point, target) => {
    if (isEditing) return false;
    if (isTouchHold()) { setHoldOpen(true); return; }
    if (keepBrowserMenu(target, rowRef.current)) return false;
    menuPoint.openAt(point);
  }, canHold);

  const holdActions: ChatHoldAction[] = [];
  if (onReply) holdActions.push({ key: 'reply', prime: true, icon: <Reply />, label: _copy('copy.c253f451bdd5', { defaultValue: 'Reply' }), onSelect: () => onReply(message) });
  if (message.content?.trim()) holdActions.push({
    key: 'copy', icon: <Copy />, label: _copy('chatHold.copy', { defaultValue: 'Copy' }),
    onSelect: () => {
      void navigator.clipboard?.writeText(message.content).then(
        () => toast.success(_copy('chatHold.copied', { defaultValue: 'Copied' })),
        () => undefined,
      );
    },
  });
  // A photo or GIF can be copied as itself, not just its caption.
  const mediaUrl = (message.type === 'image' || message.type === 'gif') ? copyableMediaUrl(message.imageUrl) : null;
  const copyMediaNow = mediaUrl ? () => copyMediaWithToast(mediaUrl, message.type === 'gif' ? 'gif' : 'image', _copy) : null;
  if (onCopyLink) holdActions.push({ key: 'copy-link', icon: menuIcons.link, label: copyLinkLabel(), onSelect: () => onCopyLink(message) });
  if (copyMediaNow) holdActions.push({ key: 'copy-media', icon: <Images />, label: _copy('chatHold.copyMedia', { defaultValue: 'Copy media' }), onSelect: copyMediaNow });
  if (message.type === 'text' && message.content?.trim() && !isTooShort) holdActions.push(
    isTranslated
      ? { key: 'original', icon: <Languages />, label: _copy('chatHold.showOriginal', { defaultValue: 'Original' }), onSelect: handleShowOriginal }
      : { key: 'translate', icon: <Languages />, label: _copy('chatHold.translate', { defaultValue: 'Translate' }), onSelect: translateUp },
  );
  if (onSeeMessages) holdActions.push({ key: 'their-messages', icon: <SearchIcon />, label: _copy('chatSearch.theirMessages', { defaultValue: 'Their messages' }), onSelect: () => onSeeMessages(message) });
  if (canEdit) holdActions.push({ key: 'edit', icon: <Pencil />, label: _copy('copy.464c4ffd019e', { defaultValue: 'Edit' }), onSelect: () => startEditing() });
  if ((canDelete || showActions) && onDelete) holdActions.push({ key: 'delete', destructive: true, secondary: true, icon: <Trash2 />, label: _copy('copy.e2d0a54968ea', { defaultValue: 'Delete' }), onSelect: () => onDelete(message.id) });
  if (showActions && !isMine && onBan) holdActions.push({ key: 'ban', destructive: true, secondary: true, icon: <ShieldBan />, label: _copy('chatHold.ban', { defaultValue: 'Ban' }), onSelect: () => onBan(message.userId, message.userName) });
  if (showActions && !isMine && onUnban) holdActions.push({ key: 'unban', secondary: true, icon: <ShieldCheck />, label: _copy('chatHold.unban', { defaultValue: 'Unban' }), onSelect: () => onUnban(message.userId, message.userName) });
  const mineReactions = currentUserAddress
    ? Object.entries(message.reactions ?? {})
        .filter(([, addrs]) => addrs?.some((a) => a.toLowerCase() === currentUserAddress.toLowerCase()))
        .map(([emoji]) => emoji)
    : [];

  // The same actions as the phone sheet, in Telegram's order, for the
  // right-click menu on a computer.
  const copyText = () => {
    void navigator.clipboard?.writeText(message.content).then(
      () => toast.success(_copy('chatHold.copied', { defaultValue: 'Copied' })),
      () => undefined,
    );
  };
  const menuActions: MessageMenuAction[] = [];
  if (onReply) menuActions.push({ key: 'reply', icon: menuIcons.reply, label: _copy('copy.c253f451bdd5', { defaultValue: 'Reply' }), onSelect: () => onReply(message), hint: 'R' });
  if (canEdit) menuActions.push({ key: 'edit', icon: menuIcons.edit, label: _copy('copy.464c4ffd019e', { defaultValue: 'Edit' }), onSelect: () => startEditing(), hint: 'E' });
  if (showActions && onTogglePin) menuActions.push({ key: 'pin', icon: isPinned ? menuIcons.unpin : menuIcons.pin, label: isPinned ? _copy('copy.ee3c71613054', { defaultValue: 'Unpin' }) : _copy('chatHold.pin', { defaultValue: 'Pin' }), onSelect: () => onTogglePin(message), hint: 'P' });
  if (message.content?.trim()) menuActions.push({ key: 'copy', icon: menuIcons.copy, label: _copy('msgMenu.copyText', { defaultValue: 'Copy Text' }), onSelect: copyText, hint: 'C' });
  if (onCopyLink) menuActions.push({ key: 'copy-link', icon: menuIcons.link, label: copyLinkLabel(), onSelect: () => onCopyLink(message), hint: 'L' });
  if (copyMediaNow) menuActions.push({ key: 'copy-media', icon: menuIcons.copyMedia, label: _copy('msgMenu.copyMedia', { defaultValue: 'Copy Media' }), onSelect: copyMediaNow });
  if (message.type === 'text' && message.content?.trim() && !isTooShort) menuActions.push(
    isTranslated
      ? { key: 'original', icon: menuIcons.translate, label: _copy('chatHold.showOriginal', { defaultValue: 'Original' }), onSelect: handleShowOriginal }
      : { key: 'translate', icon: menuIcons.translate, label: _copy('chatHold.translate', { defaultValue: 'Translate' }), onSelect: translateUp, hint: 'T' },
  );
  if (onSeeMessages) menuActions.push({ key: 'their-messages', icon: menuIcons.search, label: _copy('chatSearch.theirMessages', { defaultValue: 'Their messages' }), onSelect: () => onSeeMessages(message) });
  if ((canDelete || showActions) && onDelete) menuActions.push({ key: 'delete', divided: true, destructive: true, icon: menuIcons.delete, label: _copy('copy.e2d0a54968ea', { defaultValue: 'Delete' }), onSelect: () => onDelete(message.id) });
  if (showActions && !isMine && onBan) menuActions.push({ key: 'ban', divided: !((canDelete || showActions) && onDelete), destructive: true, icon: menuIcons.ban, label: _copy('chatHold.ban', { defaultValue: 'Ban' }), onSelect: () => onBan(message.userId, message.userName) });
  if (showActions && !isMine && onUnban) menuActions.push({ key: 'unban', icon: menuIcons.unban, label: _copy('chatHold.unban', { defaultValue: 'Unban' }), onSelect: () => onUnban(message.userId, message.userName) });
  if (showActions && onTogglePin) holdActions.splice(Math.min(1, holdActions.length), 0, {
    key: 'pin', icon: isPinned ? menuIcons.unpin : menuIcons.pin,
    label: isPinned ? _copy('copy.ee3c71613054', { defaultValue: 'Unpin' }) : _copy('chatHold.pin', { defaultValue: 'Pin' }),
    onSelect: () => onTogglePin(message),
  });
  const reactors = message.reactions ? { reactions: message.reactions, remoteMessageId: message.id } : null;

  // The sheet sits beside the row, not in it: its taps would otherwise bubble
  // through React into the row's hold handlers.
  const holdSheet = (
    <ChatHoldSheet
      open={holdOpen}
      onOpenChange={setHoldOpen}
      anchor={holdOpen ? rowRef.current : null}
      quickReactions={onReact ? QUICK_CHAT_REACTIONS.slice(0, 6) : null}
      mine={mineReactions}
      onReact={handleQuickReact}
      actions={holdActions}
      frame={holdFrame}
      reactors={reactors}
      meta={localTimeLabel}
    />
  );
  const menu = menuPoint.mounted ? (
    <MessageMenu
      point={menuPoint.point}
      onClose={menuPoint.close}
      quickReactions={onReact ? QUICK_CHAT_REACTIONS : null}
      mine={mineReactions}
      onReact={handleQuickReact}
      actions={menuActions}
      reactors={reactors}
      meta={[messageMenuMeta(message.timestamp, message.isEdited), localTimeLabel].filter(Boolean).join(' · ')}
    />
  ) : null;

  return (
    <>
    {holdSheet}
    {menu}
    <div
      ref={rowRef}
      onDoubleClick={(e) => dblClickReply(e, !isEditing && onReply && (() => onReply(message)))}
      data-msg-menu-open={menuPoint.point ? '' : undefined}
      id={`chat-msg-${message.id}`}
      data-chat-row
      data-chat-own={isMine || undefined}
      data-chat-replying={replying || undefined}
      // Your own lines sit on a soft filled card, as in group chats, so they
      // stand out from everyone else's. Same text position as other rows.
      className={`flex gap-3 py-2 transition-colors group ${isMine ? 'mx-1.5 my-0.5 rounded-2xl px-2.5' : 'px-4 hover:bg-zinc-800/30'}`}
      {...hold}
    >
      <button
        onClick={handleProfileClick}
        disabled={!isClickable}
        className={`flex-shrink-0 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <ChatAvatar
          src={message.userAvatar}
          address={message.userId}
          name={message.userName}
          className="w-8 h-8"
        />
      </button>
      
      <div className="flex-1 min-w-0">
        {/* Reply indicator */}
        {message.replyTo && (
          <button
            onClick={() => {
              const el = document.getElementById(`chat-msg-${message.replyTo!.id}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-1', 'ring-white/40');
                setTimeout(() => el.classList.remove('ring-1', 'ring-white/40'), 2000);
              }
            }}
            className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 mb-0.5 transition-colors"
          >
            <CornerDownRight className="w-3 h-3" />
            <span className="font-medium">{message.replyTo.senderName}</span>
            <span className="truncate max-w-[200px]">{message.replyTo.content}</span>
          </button>
        )}

        <div className="flex items-baseline gap-2">
          <span className="relative inline-flex items-baseline gap-1 shrink min-w-0 pr-3">
            <button
              onClick={handleProfileClick}
              disabled={!isClickable}
              className={`font-semibold text-white text-sm truncate ${isClickable ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
            >
              {message.userName}
            </button>
            <StakingBadgeInline badgeBalance={message.badgeBalance} badgeLock={message.badgeLock} username={message.userHandle} />
          </span>
          <ModeratorBadge address={message.userId} moderators={moderators} />

          {/* Everything lives in the message menu (right-click, or this "..." for keyboard). */}
          {canHold && !isEditing && (
            <MessageMoreButton className="ml-auto self-center" onOpen={menuPoint.openAt} />
          )}
        </div>
        
        {message.type === 'text' && isEditing && (
          <InPlaceEditField
            draftKey={`chat:edit:${message.id}`}
            text={message.content}
            caret={editCaret}
            onSave={saveEdit}
            onDone={stopEditing}
            maxLength={500}
            className="text-zinc-300 text-sm whitespace-pre-wrap"
          />
        )}

        {message.type === 'text' && !isEditing && (
            <div>
              {chatDisplayText && (
                <p
                  className={cn("text-zinc-300 text-sm break-words whitespace-pre-wrap", canEdit && !isTranslated && "cursor-text")}
                  onClick={canEdit && !isTranslated ? editOnClick((caret) => startEditing(chatDisplayText === message.content ? caret : null)) : undefined}
                >
                  {renderTextWithLinks(chatDisplayText)}
                </p>
              )}
              <DehubLinkEmbeds links={chatDehubLinks} />
              <AssetRefCards refs={chatAssetRefs} />
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-zinc-500 text-[10px] whitespace-nowrap">{formatDate(message.timestamp)} {formatTime(message.timestamp)}</span>
                {sendMark}
                {!isTooShort && (
                  isTranslateLoading ? (
                    <Loader2 className="w-2.5 h-2.5 text-zinc-500 animate-spin" />
                  ) : isTranslated ? (
                    <button onClick={handleShowOriginal} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
                      <RotateCcw className="w-2.5 h-2.5" />
                    </button>
                  ) : (
                    <button onClick={translateUp} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
                      <Languages className="w-3 h-3" />
                    </button>
                  )
                )}
                {translateError && (
                  <span className="text-zinc-500 text-[10px]">{translateError}</span>
                )}
              </div>
            </div>
        )}
        
        {message.type === 'image' && message.imageUrl && (
          <div className="mt-1">
            <img 
              src={message.imageUrl} 
              alt={_copy("copy.f9c984552075", { defaultValue: "Shared image" })} 
              className="max-w-xs max-h-64 rounded-lg object-cover cursor-zoom-in"
              onClick={() => setViewingImage(message.imageUrl!)}
            />
            <FullscreenImageViewerLazy
              images={viewingImage ? [viewingImage] : []}
              initialIndex={0}
              isOpen={!!viewingImage}
              onClose={() => setViewingImage(null)}
              downloadable
            />
            {message.content && (
              <p className="text-zinc-300 text-sm mt-1 whitespace-pre-wrap">
                {renderTextWithLinks(isTranslated ? translatedText : message.content)}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-zinc-500 text-[10px] whitespace-nowrap">{formatDate(message.timestamp)} {formatTime(message.timestamp)}</span>
                {sendMark}
              {message.content && !isTooShort && (
                isTranslateLoading ? (
                  <Loader2 className="w-2.5 h-2.5 text-zinc-500 animate-spin" />
                ) : isTranslated ? (
                  <button onClick={handleShowOriginal} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
                    <RotateCcw className="w-2.5 h-2.5" />
                  </button>
                ) : (
                  <button onClick={translateUp} className="flex items-center text-zinc-500 hover:text-zinc-300 transition-colors">
                    <Languages className="w-3 h-3" />
                  </button>
                )
              )}
            </div>
          </div>
        )}
        
        {message.type === 'gif' && message.imageUrl && (
          <div className="mt-1">
            <img 
              src={outsideImage(message.imageUrl)} 
              alt="GIF" 
              className="max-w-xs max-h-48 rounded-lg"
            />
          </div>
        )}

        {message.type === 'audio' && message.audioUrl && (
          <div className="mt-1 flex flex-col gap-1">
            <VoiceWaveformPlayer src={message.audioUrl} />
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-zinc-500 text-[10px] whitespace-nowrap">{formatDate(message.timestamp)} {formatTime(message.timestamp)}</span>
                {sendMark}
            </div>
          </div>
        )}

        {/* Link preview cards for URLs in message */}
        {message.type === 'text' && message.content && (
          <ChatLinkPreviews content={message.content} />
        )}

        {/* Reactions display */}
        <ReactionBar
          reactions={message.reactions ?? {}}
          currentUserAddress={currentUserAddress}
          onReact={onReact}
          onRemoveReaction={onRemoveReaction}
          ownLine={isMine}
          messageId={message.id}
        />
      </div>
    </div>
    </>
  );
});
