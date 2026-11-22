import { formatMessageTime } from '@/i18n/date-locale';
import { openNotesSheet, useNotesSheetAvailable } from './NotesRow';
import { outsideImage } from '@/lib/outside-image';
import { useSwipeReply } from '@/hooks/use-swipe-reply';
import { useDoubleTap } from '@/hooks/use-double-tap';
import { dblClickReply } from '@/lib/dblclick-reply';
import { useTranslation as _useCopy, Trans } from 'react-i18next';
import { useDraftState } from '@/hooks/use-draft-state';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * DirectMessageChat Component
 * ===========================
 * Full-screen 1:1 direct message chat view.
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, useReducer, memo, Fragment, type ReactNode } from 'react';
import { DhbAmount, DhbCoin } from '@/components/app/DhbAmount';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MoreVertical, Loader2, ArrowDown, ShieldBan, AlertCircle, RotateCcw, Pin, FileText, Unlock, LockOpen, Hourglass } from "lucide-react";
import Trash2 from "@/components/ui/cut-icons/delete";
import ShieldCheck from "@/components/ui/cut-icons/security";
import RefreshCw from "@/components/ui/cut-icons/refresh";
import Gift from "@/components/ui/cut-icons/gifts";
import Languages from "@/components/ui/cut-icons/language";
import Check from "@/components/ui/cut-icons/check";
import Lock from "@/components/ui/cut-icons/privacy";
import Reply from "@/components/ui/cut-icons/reply";

import ArrowLeft from "@/components/ui/cut-icons/back";
import Settings from "@/components/ui/cut-icons/settings";
import Play from "@/components/ui/cut-icons/play";
import Search from "@/components/ui/cut-icons/search";
import X from "@/components/ui/cut-icons/close";
import Gem from "@/components/ui/cut-icons/diamond";
import Download from "@/components/ui/cut-icons/download";

import { TipGemIcon } from '@/components/app/cards/TipGemIcon';
import { useTranslation as useI18n } from 'react-i18next';
import { useDmEncryption } from '@/hooks/use-dm-encryption';
import { prepareOutgoing } from '@/lib/dm-e2ee/keys';
import { encodeMediaDescriptor, type MediaDescriptor } from '@/lib/dm-e2ee/media';
import { encryptedMediaLabel } from '@/lib/dm-e2ee/media-label';
import { loadDecryptedBlob, loadDecryptedMedia } from '@/lib/dm-e2ee/media-cache';
import { MAX_ENVELOPE_CHARS, uploadDmMedia } from '@/lib/dm-e2ee/media-send';
import { useDecryptedMedia } from '@/hooks/use-decrypted-media';
import dehubCoin from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChatInput, type ChatInputSendArgs } from './ChatInput';
import { DmVideoBubble } from './DmVideo';
import type { DmVideoOptions } from '@/lib/dm-video-options';
import type { DmDestruct, DmDestructChoice } from '@/lib/dm-destruct';
import { markDmMessageViewed } from '@/lib/api/dehub/dm';
import { DmOpenTimerMedia } from './DmOpenTimerMedia';
import { DmUndecryptableMessages } from './DmLockedState';
import { useChatPrefs } from '@/hooks/use-chat-prefs';
import { DehubLinkEmbed } from '@/components/app/cards/DehubLinkEmbed';
import { AssetRefCards, useAssetRefsInText } from '@/components/app/cards/AssetRefCards';
import { MomentReplyPreview } from './MomentReplyPreview';
import { parseMomentReply } from '@/lib/moment-reply';
import { findDehubLinks, stripDehubLinkMatches } from '@/lib/dehub-links';
import { conversationIdentity } from '@/lib/conversation-identity';
import { useTranslation, renderChatTextWithLinks } from '../TranslatableText';
import { useTranslateUp } from '@/hooks/use-translate-up';
import { useMessages, useSendMessage, useDeleteConversation, useCreateAndStart, messagesKeys, registerOpenConversation, createTransientBlobUrl, peerAddressForConversation, failedSendRetry, discardFailedSend } from '@/hooks/use-messages';
import { SendStatus } from './SendStatus';
import { UnreadMarker, UnreadJumpButton } from './UnreadJump';
import { findUnreadAnchor, type UnreadAnchor } from '@/lib/chat-unread-anchor';
import { anchorFromReadSpot, newestLineOnScreen } from '@/lib/chat-read-position';
import { useChatReadPosition } from '@/hooks/use-chat-read-position';
import { countLinesBelow, glideToBottom } from '@/lib/chat-lines-below';
import { useAuth } from '@/contexts/AuthContext';
import { useDmSettings } from '@/hooks/use-dm-settings';
import { useBannedAccount } from '@/hooks/use-banned-account';
import { getMediaUrl, forwardDmMessage, blockConversation, unblockConversation, getDMPlanSettings, grantFreeDmAccess, revokeFreeDmAccess, getAccountInfo, pinDmMessage, unpinDmMessage, type DMMessageType, type DeHubConversation, type DmMessage, type DmFee } from '@/lib/api/dehub';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { localTimeLine, useProfileLocalTime } from '@/hooks/use-profile-local-time';
import { apiCall, getAuthToken, DEHUB_API_BASE } from '@/lib/api/dehub/core';
import { buildAvatarUrl } from '@/lib/media-url';
import { BadgedName } from '@/components/app/BadgedName';
import { NewMemberChip } from '@/components/app/NewMemberChip';
import { OnlineDot } from '@/components/app/chat/OnlineDot';
import { LastSeenLine } from '@/components/app/chat/LastSeenLine';
import { formatAttachmentSize, getAttachmentLabel, isAllowedAttachment } from '@/lib/attachments';
import { GroupSettingsDrawer } from './GroupSettingsDrawer';
import { FullscreenImageViewerLazy } from '@/components/app/cards/FullscreenImageViewerLazy';
import { AppState } from '@/components/app/AppState';
import { DmTipDialog } from './DmTipDialog';
import { DmPollDialog } from './DmPollDialog';
import { ScheduledMessagesDrawer, ScheduledStrip, scheduledDmKey, useScheduledDms, useWhenLabel } from './ScheduledMessages';
import { ScheduleSheet } from '@/features/post/components/ScheduleSheet';
import { scheduleDm } from '@/lib/api/dehub/dm-scheduled';
import { PollCard } from '@/components/app/cards/PollCard';
import { DmFeeInfoBanner } from './DmFeeInfoBanner';
import { DmSafetyBanner } from './DmSafetyBanner';
import { MessageRequestBar } from './MessageRequestBar';
import { LockedMediaBubble } from './LockedMediaBubble';
import { formatDistanceToNow } from 'date-fns';
import {
  getERC20Balance,
  checkDHBPaused,
  looksLikePausedRevert,
} from '@/lib/contracts/aa-utils';
import { toastTxError } from '@/lib/tx-error-toast';
import { getChainConfig, BASE_CHAIN_ID, BNB_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { sendTip } from '@/lib/contracts/stream-controller';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CHAT_MENU_CONTENT, ChatOptionsDropdownItems, type ChatOptionsHandlers } from '@/components/app/chat/ChatOptionsMenu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { downloadMedia, messageImageDownloadName } from '@/lib/download-media';
import { dhbText } from '@/lib/dhb-toast';
import {
  emitReadReceipt,
  emitForwardMessage,
  emitEditMessage,
  emitDeleteMessage,
  emitHideMessage,
  emitSendMessage,
  waitForDmSocket,
  onConversationDeleted,
  onDmSendMessage,
  onForwardMessage,
  onDmError,
} from '@/lib/api/dehub/dm-socket';
import { ForwardMessageDialog } from './ForwardMessageDialog';
import { DeleteMessageDialog, type DeleteScope } from './DeleteMessageDialog';
import { ReportModal } from '@/components/app/modals/ReportModal';
import { MessagePickTick, MessageSelectBar } from './MessageSelectBar';
import { useRowLongPress } from '@/hooks/use-row-long-press';
import { ChatHoldSheet, isTouchHold, type ChatHoldAction } from './ChatHoldSheet';
import { MessageMenu, type MessageMenuAction } from './MessageMenu';
import { canLinkMessage, copyChatMessageLink, copyLinkLabel, useLinkedMessage } from '@/lib/chat-message-link';
import { menuIcons, messageMenuMeta, keepBrowserMenu, useMenuPoint, MessageMoreButton, copyMediaWithToast } from './message-menu-kit';
import { copyableMediaUrl } from '@/lib/copy-media';
import { DmVoiceCallButton } from '@/components/app/chat/calls/DmVoiceCallButton';
import { DmVideoCallButton } from '@/components/app/chat/calls/DmVideoCallButton';
import { useCallActions } from '@/contexts/CallContext';
import { dismissKeyboard } from '@/hooks/use-keyboard-open';
import { formatUnreadCount } from '@/lib/unread-count';
import { isDmCallNotice } from '@/lib/dm-call-notice';
import { CallNoteCard } from './calls/CallNoteCard';
import { VoiceStripPlayer } from '@/components/app/audio/VoiceStripPlayer';
import { QUICK_CHAT_REACTIONS } from './reaction-options';
import { ReactionGlyph, RollingCount, useReactionHost } from './ReactionArrival';
import { profilePath } from '@/lib/profile-path';
import { isAssistantAddress } from '@/lib/assistant';
import { assistantActionIds, withoutAssistantActionLinks } from '@/lib/assistant-action-links';
import { AssistantActionCard } from '@/components/app/assistant/AssistantActionCard';
import { AssistantDmMenu } from './AssistantDmMenu';

// Picking messages: only the ticked rows are shaded, the rest stay clear and
// only hint on hover. Mixed from the text colour rather than bg-white/..., which
// light themes repaint grey on every row whatever its state.
const PICKED_ROW = 'bg-[color-mix(in_srgb,currentColor_8%,transparent)]';
const PICKABLE_ROW = 'hover:bg-[color-mix(in_srgb,currentColor_4%,transparent)]';

interface DirectMessageChatProps {
  conversation: DeHubConversation;
  onBack: () => void;
  /** Pre-fill the composer (shared-post text for fee-gated chats). */
  initialComposerText?: string;
  /**
   * Rendered inside a floating dock panel rather than as the page. Drops the
   * back arrow and the search toggle — there is no list to go back to, and the
   * window controls need the room at 380px wide.
   */
  dock?: boolean;
  /** Window controls (minimise/close) for dock mode, pinned to the header end. */
  headerActions?: ReactNode;
  /** Opened from the New message drawer: the composer takes the caret at once. */
  focusComposer?: boolean;
  /**
   * The full-screen chat at /chat: back-to-back messages from one person
   * group into one block (tight corners, one avatar, one time line), a day
   * pill between days, a soft wallpaper behind, and the thread held to a
   * readable width on wide screens.
   */
  cozy?: boolean;
  /**
   * The full chat options (new window, archive, pin, mute, mark unread,
   * clear history) for the three-dot menu. Block and delete stay this
   * component's own.
   */
  options?: Omit<ChatOptionsHandlers, 'onBlock' | 'isBlocked' | 'onDelete'>;
}

/** Where a message sits in a run from one sender, for the cozy layout. */
export type CozyGroupPos = { first: boolean; last: boolean };

const COZY_GROUP_GAP_MS = 5 * 60_000;
const COZY_GROUPABLE = new Set(['msg', 'media', 'gif']);

const COZY_POS: Record<string, CozyGroupPos> = {
  tt: { first: true, last: true },
  tf: { first: true, last: false },
  ft: { first: false, last: true },
  ff: { first: false, last: false },
};
/** Shared objects, so a bubble's memo sees the same `cozy` prop each render. */
function cozyPosFor(first: boolean, last: boolean): CozyGroupPos {
  return COZY_POS[`${first ? 't' : 'f'}${last ? 't' : 'f'}`];
}

function cozyDayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today", "Yesterday", "Nov 5", or "Nov 5, 2025" for another year. */
function cozyDayLabel(iso: string, copy: (key: string, opts: Record<string, unknown>) => string) {
  const d = new Date(iso);
  const now = new Date();
  const key = cozyDayKey(iso);
  if (key === cozyDayKey(now.toISOString())) return copy('fullscreenChat.today', { defaultValue: 'Today' });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (key === cozyDayKey(y.toISOString())) return copy('fullscreenChat.yesterday', { defaultValue: 'Yesterday' });
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear()
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A tip that just arrived or was just sent plays its diamond swirl; history stays still. */
const isFreshTip = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < 15_000;

function VoiceMessagePlayer({
  audioUrl,
  duration,
  isPending,
}: {
  audioUrl?: string;
  duration?: number | null;
  isPending: boolean;
}) {
  const { t: _copy } = _useCopy();

  if (isPending) {
    return (
      <div className="flex items-center gap-2 min-w-[120px] py-2 px-3 rounded-lg bg-zinc-700/50">
        <Loader2 className="w-4 h-4 animate-spin text-zinc-400 flex-shrink-0" />
        <span className="text-sm text-zinc-400">{_copy("copy.1d6631af3074", { defaultValue: "Uploading voice..." })}</span>
      </div>
    );
  }

  if (!audioUrl) return null;
  return <VoiceStripPlayer src={audioUrl} duration={duration ?? undefined} className="min-w-[220px]" />;
}

/** Bubble size for an attachment of w×h, inside the 280×256 a plain image gets. */
function encryptedMediaBox(w?: number, h?: number): { width: number; height: number } {
  if (!w || !h) return { width: 220, height: 165 };
  const scale = Math.min(1, 280 / w, 256 / h);
  return { width: Math.max(80, Math.round(w * scale)), height: Math.max(60, Math.round(h * scale)) };
}

function EncryptedMediaPlaceholder({
  media,
  status,
  onRetry,
  children,
}: {
  media: MediaDescriptor;
  status: 'idle' | 'loading' | 'ready' | 'error';
  onRetry: () => void;
  children?: ReactNode;
}) {
  const { t: _copy } = _useCopy();
  const { t: tr } = useI18n();
  const box = encryptedMediaBox(media.w, media.h);
  return (
    <div
      className="relative overflow-hidden rounded-lg bg-zinc-800 max-w-full"
      style={{ width: box.width, height: box.height }}
    >
      {media.thumb && (
        <img src={media.thumb} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover blur-lg scale-110" />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/20">
        {status === 'error' ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            className="flex flex-col items-center gap-1 rounded-lg bg-black/60 px-3 py-2 text-xs text-white/90 hover:bg-black/70"
            title={tr('messages.tryAgain')}
          >
            <AlertCircle className="h-4 w-4" />
            <span>{_copy("copy.ca1844969742", { defaultValue: "Unavailable" })}</span>
            <span className="inline-flex items-center gap-1 text-white/60"><RotateCcw className="h-3 w-3" />{tr('messages.tryAgain')}</span>
          </button>
        ) : status === 'loading' ? (
          <Loader2 className="h-6 w-6 animate-spin text-white/80" />
        ) : children}
      </div>
    </div>
  );
}

/**
 * An end-to-end encrypted attachment: fetched as ciphertext, opened here and
 * shown from a local blob. Photos and voice open as soon as they render;
 * videos and files wait for a tap, so scrolling past them downloads nothing.
 */
function EncryptedMediaBody({
  messageId,
  media,
  mediaUrl,
  voiceDuration,
  onOpenImage,
  isOwn,
  destruct,
}: {
  messageId: string;
  isOwn?: boolean;
  destruct?: DmDestruct | null;
  media: MediaDescriptor;
  mediaUrl?: string;
  voiceDuration?: number | null;
  onOpenImage?: (url: string) => void;
}) {
  const { t: _copy } = _useCopy();
  const eager = media.kind === 'image' || media.kind === 'audio';
  const { url, status, load, retry } = useDecryptedMedia(mediaUrl, media, { messageId, enabled: eager });
  const [fileBusy, setFileBusy] = useState(false);
  const [fileFailed, setFileFailed] = useState(false);
  // A video only starts by itself once the viewer has tapped it.
  const [requested, setRequested] = useState(false);
  const uploading = !mediaUrl && !url;

  // Gone a few seconds after the first open: a closed tile until tapped.
  if (destruct?.mode === 'open' && !isOwn && (media.kind === 'image' || media.kind === 'video')) {
    return (
      <DmOpenTimerMedia messageId={messageId} mine={false} destruct={destruct} kind={media.kind} src={url} onNeedSource={load}>
        {null}
      </DmOpenTimerMedia>
    );
  }

  if (media.kind === 'audio') {
    if (status === 'error') {
      return (
        <button type="button" onClick={retry} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-700/50 hover:bg-zinc-600/50 text-sm text-zinc-300">
          <AlertCircle className="w-4 h-4" />
          <span>{_copy("copy.ca1844969742", { defaultValue: "Unavailable" })}</span>
          <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      );
    }
    return <VoiceMessagePlayer audioUrl={url} duration={voiceDuration ?? media.dur ?? null} isPending={uploading} />;
  }

  if (media.kind === 'file') {
    const download = async () => {
      if (fileBusy) return;
      setFileFailed(false);
      setFileBusy(true);
      try {
        const objectUrl = url ?? (mediaUrl ? await loadDecryptedMedia(mediaUrl, media, messageId) : undefined);
        if (!objectUrl) return;
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = media.name || 'file';
        a.click();
      } catch (err) {
        console.warn('[DM] Could not open encrypted file:', err);
        setFileFailed(true);
      } finally {
        setFileBusy(false);
      }
    };
    return (
      <button
        type="button"
        onClick={() => void download()}
        disabled={uploading}
        className="group flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08] max-w-[280px] disabled:cursor-default"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
          {fileFailed ? <AlertCircle className="h-4 w-4 text-white" /> : <FileText className="h-4 w-4 text-white" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-white" title={media.name}>
            {media.name || _copy("copy.040d2b3689dd", { defaultValue: "Attachment" })}
          </span>
          <span className="block text-xs text-white/50">
            {fileFailed
              ? _copy("copy.ca1844969742", { defaultValue: "Unavailable" })
              : uploading
                ? _copy("copy.c62cd2cb247c", { defaultValue: "Uploading file..." })
                : <>{getAttachmentLabel(media.name || '')}{media.size ? ` · ${formatAttachmentSize(media.size)}` : ''}</>}
          </span>
        </span>
        {fileBusy || uploading
          ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-white/60" />
          : fileFailed
            ? <RotateCcw className="h-4 w-4 flex-shrink-0 text-white/60" />
            : <Download className="h-4 w-4 flex-shrink-0 text-white/40 transition-colors group-hover:text-white/80" />}
      </button>
    );
  }

  if (media.kind === 'video' && status !== 'error') {
    return (
      <DmVideoBubble
        messageId={messageId}
        src={status === 'ready' ? url : undefined}
        poster={media.thumb}
        width={media.w}
        height={media.h}
        duration={media.dur}
        options={media.opts}
        mine={!!isOwn}
        destruct={destruct}
        onViewed={() => { void markDmMessageViewed(messageId).catch(() => undefined); }}
        autoPlay={requested}
        loading={uploading || status === 'loading'}
        onNeedSource={() => { if (uploading) return; setRequested(true); load(); }}
      />
    );
  }

  if (media.kind === 'video') {
    return (
      <EncryptedMediaPlaceholder media={media} status={uploading ? 'loading' : status} onRetry={retry}>
        <button
          type="button"
          onClick={load}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/70"
          aria-label={_copy("copy.d534be829e32", { defaultValue: "Video" })}
        >
          <Play className="h-5 w-5" />
        </button>
        {media.dur != null && (
          <span className="absolute bottom-1.5 right-2 rounded bg-black/60 px-1.5 text-[10px] tabular-nums text-white">
            {Math.floor(media.dur / 60)}:{String(Math.round(media.dur % 60)).padStart(2, '0')}
          </span>
        )}
      </EncryptedMediaPlaceholder>
    );
  }

  if (status === 'ready' && url) {
    return (
      <img
        src={url}
        alt={_copy("copy.f9c984552075", { defaultValue: "Shared image" })}
        className="max-w-full max-h-64 rounded-lg object-cover cursor-zoom-in"
        onClick={() => onOpenImage?.(url)}
      />
    );
  }
  return <EncryptedMediaPlaceholder media={media} status={uploading || status === 'idle' ? 'loading' : status} onRetry={retry} />;
}

// memo: every DirectMessageChat state change (scroll-position toggles, search
// keystrokes, incoming messages) used to re-render EVERY bubble — each parsing
// dates via formatDistanceToNow. Handler props are useCallback'd by the
// parent, so only bubbles whose message/highlight actually changed re-render.
/**
 * An image that keeps showing what it has until the next source is ready.
 *
 * A photo you just sent is drawn from the local file; when the send lands its
 * address becomes the uploaded copy. Swapping `src` straight away blanked the
 * picture while the upload downloaded, so the photo seemed to vanish and come
 * back. The new address is loaded off screen first and swapped in once decoded.
 */
function SettledImg({ src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [shown, setShown] = useState(src);
  useEffect(() => {
    if (src === shown) return;
    let live = true;
    const next = new Image();
    next.onload = () => { if (live) setShown(src); };
    next.onerror = () => { if (live) setShown(src); };
    next.src = src;
    return () => { live = false; };
  }, [src, shown]);
  return <img src={shown} {...rest} />;
}

/** The day marker between days in the cozy thread; sticks to the top while scrolling. */
export function CozyDayPill({ iso }: { iso: string }) {
  const { t: _copy } = _useCopy();
  return (
    <div data-chat-day-pill className="sticky top-2 z-10 flex justify-center py-2 pointer-events-none">
      <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur-md">
        {cozyDayLabel(iso, _copy)}
      </span>
    </div>
  );
}

/** What moderators see with a reported chat message. Same lines as the app sends. */
function messageReportContext(message: DmMessage, where: string): string {
  const text = (message.content || '').trim().slice(0, 500);
  return [
    `Reported message (${where})`,
    message._id ? `Message id: ${message._id}` : null,
    text ? `Text: ${text}` : null,
  ].filter(Boolean).join('\n');
}

const MessageBubble = memo(function MessageBubble({
  message,
  isOwnMessage,
  highlightText,
  txConfirmed = false,
  isEditing = false,
  onPin,
  onForward,
  onReply,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onOpenImage,
  currentUserAddress,
  onReact,
  onRemoveReaction,
  onRetrySend,
  onDiscardSend,
  cozy,
  callPeerAddress,
  allowDoubleTapLike = true,
  selecting = false,
  picked = false,
  onTogglePick,
  onStartPick,
  onCopyLink,
  onDelete,
  onReport,
  canPin = true,
  isPinned = false,
  onUnpin,
}: {
  message: DmMessage;
  isOwnMessage: boolean;
  /** Delete one message (asks first: for me, or for everyone when it is yours). */
  onDelete?: (message: DmMessage) => void;
  /** Report a message someone else sent, with its text attached for moderators. */
  onReport?: (message: DmMessage) => void;
  /** Pin rights: anyone in a one-to-one chat, the owner in a group. */
  canPin?: boolean;
  isPinned?: boolean;
  onUnpin?: () => void;
  /** Picking several messages: a click or tap toggles this one instead of acting on it. */
  selecting?: boolean;
  picked?: boolean;
  onTogglePick?: (message: DmMessage) => void;
  /** Start picking with this message (Select on hover, Ctrl/Cmd-click, or a hold on a phone). */
  onStartPick?: (message: DmMessage) => void;
  /** "Copy link": a riftn.com link that opens this chat on this message, for people in it. */
  onCopyLink?: (message: DmMessage) => void;
  /** The other person in a one-to-one chat, so a call card can call them back. */
  callPeerAddress?: string;
  allowDoubleTapLike?: boolean;
  /** Set in the cozy layout: where this bubble sits in its sender's run. */
  cozy?: CozyGroupPos;
  highlightText?: string;
  /** Locally-confirmed payment tx for this message (prop, not ref — memo-safe). */
  txConfirmed?: boolean;
  /** True while this message's text is being edited inline. */
  isEditing?: boolean;
  onPin?: (messageId: string) => void;
  onForward?: (message: DmMessage) => void;
  onReply?: (message: DmMessage) => void;
  onEdit?: (message: DmMessage) => void;
  onSaveEdit?: (messageId: string, content: string) => Promise<boolean>;
  onCancelEdit?: () => void;
  onOpenImage?: (url: string) => void;
  currentUserAddress?: string;
  onReact?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
  onRetrySend?: (clientKey: string) => void;
  onDiscardSend?: (clientKey: string) => void;
}) {
  const { t: _copy } = _useCopy();
  useReactionHost(message._id);
  // Cozy layout: the avatar and the time line belong to the run, so only its
  // last bubble carries them. A failed or sending bubble keeps its line, since
  // that is where Retry and the spinner live.
  const cozyShowMeta = !cozy || cozy.last || message.sendState === 'failed' || message.sendState === 'sending';
  const pickable = !!onStartPick && !message.isDeleted && message.sendState !== 'sending' && message.sendState !== 'failed';
  const cozyShowAvatar = !cozy || cozy.last;
  // Payment-pending spinner: memo means no incidental re-renders, so the 90s
  // "give up waiting" fallback schedules its own re-render at the boundary
  // instead of relying on unrelated parent state changes to sweep it away.
  const [, forcePendingTick] = useReducer((v: number) => v + 1, 0);
  const pendingAgeMs = Date.now() - new Date(message.createdAt).getTime();
  const showPaymentPending =
    isOwnMessage &&
    message.paymentStatus === 'pending' &&
    !txConfirmed &&
    pendingAgeMs < 90_000;
  useEffect(() => {
    if (!showPaymentPending) return;
    const remaining = Math.max(250, 90_000 - pendingAgeMs);
    const timer = setTimeout(forcePendingTick, remaining);
    return () => clearTimeout(timer);
    // pendingAgeMs is time-derived; the timer only needs scheduling while visible
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaymentPending, message._id]);
  // Call message — detect by emoji prefix in content (📞/📹/📵). The branch
  // it drives lives below the hooks; see the note there.
  const isCallMessage = message.msgType === 'msg' && isDmCallNotice(message.content);

  const avatarUrl = buildAvatarUrl(message.sender?.address || '', message.sender?.avatarImageUrl);
  const displayName = message.sender?.displayName || message.sender?.username ||
    (message.sender?.address
      ? `${message.sender.address.slice(0, 6)}...${message.sender.address.slice(-4)}`
      : _copy("copy.b512d97e7cbf", { defaultValue: "User" }));
  const senderProfilePath = message.sender?.username
    ? profilePath(message.sender.username)
    : message.sender?.address
      ? profilePath(message.sender.address)
      : null;

  const primaryMedia = message.mediaUrls?.[0];
  const primaryMediaUrl = primaryMedia?.url;
  // Documents and images share msgType 'media', so the entry's own type is what
  // separates them. Optimistic sends carry it too, so the pending bubble reads
  // "Uploading file…" rather than promising an image that never arrives.
  const isFileMedia = primaryMedia?.type === 'file';
  // An encrypted attachment opens only through its descriptor. Ciphertext
  // without one (sealed to a key this device lacks) is never rendered; the
  // "can't be opened" line below stands in for it.
  const encMedia = message.encMedia;
  const isLockedMedia = !encMedia && !!primaryMedia?.encrypted;

  // A plain photo, video or document can be saved from the hover actions.
  // Paid and end-to-end encrypted attachments are left out: one is a blurred
  // preview, the other downloads from its own tap.
  const downloadTarget = useMemo(() => {
    if (message.msgType !== 'media' || message.lock || encMedia || isLockedMedia || !primaryMediaUrl) return null;
    const url = getMediaUrl(primaryMediaUrl) || primaryMediaUrl;
    if (!/^(https?:|blob:)/.test(url)) return null;
    const name = isFileMedia
      ? (primaryMedia?.name || 'file')
      : primaryMedia?.type === 'video' || primaryMedia?.mimeType?.startsWith('video/')
        ? `dehub-chat-${message._id}.mp4`
        : messageImageDownloadName(url);
    return { url, name };
  }, [message.msgType, message.lock, message._id, encMedia, isLockedMedia, primaryMediaUrl, isFileMedia, primaryMedia?.name, primaryMedia?.type, primaryMedia?.mimeType]);
  const handleDownloadMedia = useCallback(async () => {
    if (!downloadTarget) return;
    const toastId = `dm-download-${message._id}`;
    toast.loading(_copy("copy.757726036c1c", { defaultValue: "Preparing download..." }), { id: toastId });
    try {
      await downloadMedia(downloadTarget.url, downloadTarget.name);
      toast.success(_copy("copy.efece5dd1933", { defaultValue: "Download started" }), { id: toastId });
    } catch {
      // A host that refuses the fetch still serves the file to a plain link.
      window.open(downloadTarget.url, '_blank', 'noopener,noreferrer');
      toast.dismiss(toastId);
    }
  }, [downloadTarget, message._id, _copy]);

  // A shared entity: a text message whose content contains a link to something
  // inside Riftn. Rendered as a rich, tappable card instead of a raw link.
  //
  // This used to recognise posts only, which is why sending someone a shop item
  // or a community from the app produced a naked URL in their inbox while a post
  // produced a card.
  // @assistant offers to do things (react, follow, read your chats) with a
  // link in its reply. In its DM, as on the Assistant page, that link is drawn
  // as a confirm card and left out of the text.
  const assistantActions = useMemo(
    () => (!isOwnMessage && message.msgType === 'msg' && isAssistantAddress(message.sender?.address)
      ? assistantActionIds(message.content)
      : []),
    [isOwnMessage, message.msgType, message.sender?.address, message.content],
  );
  const bodyContent = assistantActions.length > 0
    ? withoutAssistantActionLinks(message.content || '')
    : message.content;
  const momentReply = useMemo(() => message.msgType === 'msg' && !message.isDeleted
    ? parseMomentReply(message.content, typeof window === 'undefined' ? undefined : window.location.origin) : null, [message.msgType, message.isDeleted, message.content]);
  const sharedLink = useMemo(
    () => (message.msgType === 'msg' && !momentReply ? findDehubLinks(bodyContent)[0] ?? null : null),
    [message.msgType, bodyContent, momentReply],
  );
  const isPostShare = !!sharedLink;

  // Editing is restricted to plain text messages — an entity share's raw
  // content carries the link the embed card is built from, so letting someone
  // edit the visible caption alone would silently drop that link on save.
  const canEdit = isOwnMessage && message.msgType === 'msg' && !isPostShare && !momentReply && !message.isDeleted;
  /*
   * A message still on its way out is on screen under a local id the API has
   * never seen, so an edit, forward or pin aimed at it reached the server as an
   * id it could not resolve and died there without a word — the row is held
   * back until the send comes back with a real one.
   */
  const isUnsent = !!message.sendState || message._id.startsWith('temp-');
  const [draftText, setDraftText] = useDraftState(`dm:edit:${message._id}`, message.content || '');
  const editPending = useRef(false);
  // Drives the Save button's spinner/disabled state. A confirmed edit can take
  // up to 15s (confirmChatDelivery's socket round-trip) and the ref above never
  // triggers a re-render, so with nothing else watching it the button used to
  // sit there looking inert the whole time — indistinguishable from broken.
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const saveEdit = async () => {
    if (editPending.current || !onSaveEdit) return;
    editPending.current = true;
    setIsSavingEdit(true);
    try { if (await onSaveEdit(message._id, draftText) && setDraftText.complete(draftText, '')) onCancelEdit?.(); }
    finally { editPending.current = false; setIsSavingEdit(false); }
  };
  useEffect(() => {
    if (isEditing) setDraftText.initialize(message.content || '');
  }, [isEditing, message.content, setDraftText]);
  // Grows the edit box to fit the actual wrapped content instead of guessing
  // rows from newline count (a long single-paragraph message has none, so that
  // guess never got past its 2-row floor and clipped most of the text). Capped
  // at 40% of the viewport; past that it scrolls rather than pushing Save off-screen.
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = editTextareaRef.current;
    if (!el || !isEditing) return;
    el.style.height = 'auto';
    const full = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    const max = Math.round(window.innerHeight * 0.4);
    el.style.height = `${Math.min(full, max)}px`;
    el.style.overflowY = full > max ? 'auto' : 'hidden';
  }, [isEditing, draftText]);

  // Entity shares translate their caption (link stripped) — feeding the raw URL to the
  // translator garbles it and previously the translate control was hidden entirely.
  const shareCaption = useMemo(
    () => (sharedLink ? stripDehubLinkMatches(message.content || '', [sharedLink]) : ''),
    [sharedLink, message.content],
  );
  const textContent = momentReply?.text ?? (isPostShare ? shareCaption : (bodyContent || ''));
  const {
    isTranslated,
    translatedText,
    isLoading: isTranslating,
    isTooShort,
    handleTranslate,
    handleShowOriginal,
    // Messages you receive translate themselves, the same way room chats do:
    // 'chat' rules, so slang and names stay as typed and only lines that plainly
    // read as another language change. Sent as private text (never a training
    // tier), and the Auto-translate setting turns it off. Your own messages
    // stay as you wrote them.
  } = useTranslation(textContent, isOwnMessage ? false : 'chat');
  const { t: tr } = useI18n();

  // A contract address or a $TICKER in a plain message cards up the same way it
  // does in a post. Entity shares are left alone — they already have a card, and
  // stacking a second one under a 280px bubble reads as a bug.
  const { refs: dmAssetRefs, displayText: dmDisplayText } = useAssetRefsInText(
    isPostShare || momentReply ? '' : (isTranslated ? translatedText : bodyContent) || '',
    1,
  );

  /*
   * The message menu: hold with a finger (the sheet), right-click with a
   * mouse (the menu at the pointer). Same actions, Telegram's order. While
   * picking several messages a hold or click ticks instead.
   */
  const rowRef = useRef<HTMLDivElement>(null);
  useSwipeReply(rowRef, onReply ? () => onReply(message) : undefined, !selecting);
  const [holdOpen, setHoldOpen] = useState(false);
  const menuPoint = useMenuPoint();
  const menuable = !message.isDeleted && !isUnsent && !isEditing && !isCallMessage;
  const hold = useRowLongPress(pickable || menuable ? () => {
    if (selecting) { if (pickable) onTogglePick?.(message); return; }
    if (menuable) setHoldOpen(true);
    else onStartPick?.(message);
  } : undefined);
  const viewer = currentUserAddress?.toLowerCase();
  const myReactions = viewer
    ? Object.entries(message.reactions ?? {}).filter(([, who]) => who?.some((a) => a.toLowerCase() === viewer)).map(([emoji]) => emoji)
    : [];
  const canDoubleTap = allowDoubleTapLike && !!viewer && !!onReact && menuable && !selecting && !isOwnMessage
    && message.msgType === 'msg' && !message.undecryptable && !!textContent.trim();
  const doubleTap = useDoubleTap(canDoubleTap ? () => {
    if (!myReactions.includes('❤️')) onReact(message._id, '❤️');
  } : undefined);
  const toggleReact = (emoji: string) => {
    if (myReactions.includes(emoji)) onRemoveReaction?.(message._id, emoji);
    else onReact?.(message._id, emoji);
  };
  const copyable = !message.undecryptable && !!(isPostShare ? message.content : textContent)?.trim();
  const copyText = () => {
    void navigator.clipboard?.writeText((message.content || '').trim()).then(
      () => toast.success(_copy('chatHold.copied', { defaultValue: 'Copied' })),
      () => undefined,
    );
  };
  // A photo, GIF or video can be copied as itself, not just its caption.
  // Paid and encrypted attachments stay out, like Download.
  const copyMediaTarget = (() => {
    if ((message.msgType !== 'media' && message.msgType !== 'gif') || message.undecryptable || message.lock || encMedia || isLockedMedia || isFileMedia) return null;
    const url = copyableMediaUrl(getMediaUrl(primaryMediaUrl) || primaryMediaUrl);
    if (!url) return null;
    const kind = message.msgType === 'gif' || primaryMedia?.mimeType === 'image/gif' ? 'gif' as const
      : primaryMedia?.type === 'video' || primaryMedia?.mimeType?.startsWith('video/') ? 'video' as const
      : 'image' as const;
    return { url, kind };
  })();
  const copyMediaNow = () => { if (copyMediaTarget) copyMediaWithToast(copyMediaTarget.url, copyMediaTarget.kind, _copy); };
  const canTranslate = !isOwnMessage && message.msgType === 'msg' && !!textContent.trim() && !isTooShort;
  // Translate also translates every message above this one that still needs it.
  const translateUp = useTranslateUp('dm', message._id, message.createdAt, canTranslate && !isTranslated && !isTranslating, handleTranslate);
  const menuActions: MessageMenuAction[] = [];
  const holdActions: ChatHoldAction[] = [];
  if (menuable && message.msgType !== 'tip') {
    const L = {
      reply: tr('messages.reply'),
      edit: tr('messages.edit'),
      pin: isPinned ? _copy('copy.ee3c71613054', { defaultValue: 'Unpin' }) : tr('messages.pin'),
      copy: _copy('msgMenu.copyText', { defaultValue: 'Copy Text' }),
      forward: tr('messages.forward'),
      download: _copy('copy.d6eafe823591', { defaultValue: 'Download' }),
      translate: isTranslated ? _copy('chatHold.showOriginal', { defaultValue: 'Original' }) : _copy('chatHold.translate', { defaultValue: 'Translate' }),
      del: _copy('copy.e2d0a54968ea', { defaultValue: 'Delete' }),
      select: _copy('msgSelect.select', { defaultValue: 'Select' }),
    };
    const pinAction = canPin && (isPinned ? onUnpin : onPin)
      ? () => (isPinned ? onUnpin?.() : onPin?.(message._id))
      : null;
    if (onReply) {
      menuActions.push({ key: 'reply', icon: menuIcons.reply, label: L.reply, onSelect: () => onReply(message), hint: 'R' });
      holdActions.push({ key: 'reply', prime: true, icon: menuIcons.reply, label: L.reply, onSelect: () => onReply(message) });
    }
    if (onEdit && canEdit) {
      menuActions.push({ key: 'edit', icon: menuIcons.edit, label: L.edit, onSelect: () => onEdit(message), hint: 'E' });
      holdActions.push({ key: 'edit', icon: menuIcons.edit, label: L.edit, onSelect: () => onEdit(message) });
    }
    if (pinAction) {
      menuActions.push({ key: 'pin', icon: isPinned ? menuIcons.unpin : menuIcons.pin, label: L.pin, onSelect: pinAction, hint: 'P' });
      holdActions.push({ key: 'pin', icon: isPinned ? menuIcons.unpin : menuIcons.pin, label: L.pin, onSelect: pinAction });
    }
    if (copyable) {
      menuActions.push({ key: 'copy', icon: menuIcons.copy, label: L.copy, onSelect: copyText, hint: 'C' });
      holdActions.push({ key: 'copy', icon: menuIcons.copy, label: _copy('chatHold.copy', { defaultValue: 'Copy' }), onSelect: copyText });
    }
    if (onCopyLink && canLinkMessage(message._id)) {
      menuActions.push({ key: 'copy-link', icon: menuIcons.link, label: copyLinkLabel(), onSelect: () => onCopyLink(message), hint: 'L' });
      holdActions.push({ key: 'copy-link', icon: menuIcons.link, label: copyLinkLabel(), onSelect: () => onCopyLink(message) });
    }
    if (copyMediaTarget) {
      menuActions.push({ key: 'copy-media', icon: menuIcons.copyMedia, label: _copy('msgMenu.copyMedia', { defaultValue: 'Copy Media' }), onSelect: copyMediaNow });
      holdActions.push({ key: 'copy-media', icon: menuIcons.copyMedia, label: _copy('chatHold.copyMedia', { defaultValue: 'Copy media' }), onSelect: copyMediaNow });
    }
    if (canTranslate) {
      const go = isTranslated ? handleShowOriginal : translateUp;
      menuActions.push({ key: 'translate', icon: menuIcons.translate, label: L.translate, onSelect: go, hint: 'T' });
      holdActions.push({ key: 'translate', icon: menuIcons.translate, label: L.translate, onSelect: go });
    }
    if (onForward) {
      menuActions.push({ key: 'forward', icon: menuIcons.forward, label: L.forward, onSelect: () => onForward(message), hint: 'F' });
      holdActions.push({ key: 'forward', icon: menuIcons.forward, label: L.forward, onSelect: () => onForward(message) });
    }
    if (downloadTarget) {
      menuActions.push({ key: 'download', icon: menuIcons.download, label: L.download, onSelect: () => void handleDownloadMedia() });
      holdActions.push({ key: 'download', icon: menuIcons.download, label: L.download, onSelect: () => void handleDownloadMedia() });
    }
    // Every line can be deleted for yourself; your own can also go for everyone.
    const canDeleteThis = !!onDelete;
    if (canDeleteThis && onDelete) {
      menuActions.push({ key: 'delete', divided: true, destructive: true, icon: menuIcons.delete, label: L.del, onSelect: () => onDelete(message) });
      holdActions.push({ key: 'delete', secondary: true, destructive: true, icon: menuIcons.delete, label: L.del, onSelect: () => onDelete(message) });
    }
    if (pickable) {
      menuActions.push({ key: 'select', divided: !canDeleteThis, icon: menuIcons.select, label: L.select, onSelect: () => onStartPick?.(message), hint: 'S' });
      holdActions.push({ key: 'select', secondary: true, icon: menuIcons.select, label: L.select, onSelect: () => onStartPick?.(message) });
    }
    // Anyone can report a message they were sent, the same as in the app.
    if (onReport && !isOwnMessage && !message.isDeleted && (message.sender?.address || message.sender?.username)) {
      const label = _copy('dm.reportMessage', { defaultValue: 'Report message' });
      menuActions.push({ key: 'report', destructive: true, icon: menuIcons.report, label, onSelect: () => onReport(message) });
      holdActions.push({ key: 'report', secondary: true, destructive: true, icon: menuIcons.report, label, onSelect: () => onReport(message) });
    }
  }
  const hasReactions = !!message.reactions && Object.values(message.reactions).some((who) => who?.length);
  const reactors = hasReactions ? { reactions: message.reactions } : null;
  const reactable = !!onReact && message.msgType !== 'tip';
  const menus = menuable ? (
    <>
      <ChatHoldSheet
        open={holdOpen}
        onOpenChange={setHoldOpen}
        anchor={holdOpen ? rowRef.current : null}
        quickReactions={reactable ? QUICK_CHAT_REACTIONS.slice(0, 6) : null}
        mine={myReactions}
        onReact={toggleReact}
        actions={holdActions}
        reactors={reactors}
      />
      {menuPoint.mounted && (
        <MessageMenu
          point={menuPoint.point}
          onClose={menuPoint.close}
          quickReactions={reactable ? QUICK_CHAT_REACTIONS : null}
          mine={myReactions}
          onReact={toggleReact}
          actions={menuActions}
          reactors={reactors}
          meta={messageMenuMeta(message.createdAt, !!(message as { isEdited?: boolean }).isEdited)}
        />
      )}
    </>
  ) : null;

  // A call notice: a centred pill, none of the bubble chrome.
  //
  // This return sits below every hook above deliberately. It used to sit right
  // after the payment-pending effect, which left this component calling two
  // hooks for a call notice and eight for anything else — and `isCallMessage`
  // is read off `message.content`, which now changes in place when someone
  // edits or deletes a message. The same React key flipping branch is
  // "Rendered more hooks than during the previous render", i.e. the whole
  // thread white-screens. Keep it here.
  if (isCallMessage) {
    return (
      <div id={`dm-msg-${message._id}`} className="flex justify-center py-2">
        <CallNoteCard
          content={message.content}
          time={formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          isOwn={isOwnMessage}
          peerAddress={callPeerAddress}
        />
      </div>
    );
  }

  return (
    <>
    {menus}
    <div
      ref={rowRef}
      onDoubleClick={(e) => dblClickReply(e, !selecting && onReply && (() => onReply(message)))}
      id={`dm-msg-${message._id}`}
      data-chat-row
      data-cozy-first={cozy?.first ? '' : undefined}
      data-cozy-last={cozy?.last ? '' : undefined}
      data-msg-picked={selecting && pickable ? (picked ? 'true' : 'false') : undefined}
      data-msg-menu-open={menuPoint.point ? '' : undefined}
      {...hold.handlers}
      onContextMenu={(e) => {
        hold.handlers.onContextMenu?.(e);
        if (e.defaultPrevented || selecting || !menuable || isTouchHold()) return;
        if (!e.currentTarget.contains(e.target as Node)) return;
        if (keepBrowserMenu(e.target as Element, e.currentTarget)) return;
        e.preventDefault();
        menuPoint.openAt({ x: e.clientX, y: e.clientY });
      }}
      onClickCapture={(e) => {
        if (hold.consumeClick()) { e.preventDefault(); e.stopPropagation(); return; }
        if (!pickable) return;
        // Picking: a click anywhere on the row toggles it, never opens media or links.
        if (selecting) { e.preventDefault(); e.stopPropagation(); onTogglePick?.(message); return; }
        if (e.metaKey || e.ctrlKey || e.shiftKey) { e.preventDefault(); e.stopPropagation(); onStartPick?.(message); }
      }}
      className={`flex ${cozy ? `gap-2 items-end ${cozy.first ? 'pt-2' : 'pt-0.5'} ${cozy.last ? 'pb-1' : 'pb-0'}` : 'gap-3 py-2'} ${isOwnMessage ? 'flex-row-reverse' : ''} group relative rounded-lg transition-colors ${selecting && pickable ? `my-0.5 cursor-pointer select-none ${picked ? PICKED_ROW : PICKABLE_ROW}` : ''}`}
    >
      {selecting && pickable && (
        <span className={`flex ${isOwnMessage ? 'order-last mr-auto pr-1' : 'pr-1'} self-center`}><MessagePickTick checked={picked} /></span>
      )}
      {!isOwnMessage && !cozyShowAvatar && <div aria-hidden className="w-8 flex-shrink-0" />}
      {!isOwnMessage && cozyShowAvatar && (() => {
        const avatar = (
          <Avatar className="w-8 h-8 flex-shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} />}
            <AvatarFallback className="bg-zinc-700 text-white text-xs font-medium">
              {(displayName.startsWith('0x') ? displayName.charAt(2) : displayName.charAt(0)).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        );
        return senderProfilePath ? (
          <Link
            to={senderProfilePath}
            className={`flex-shrink-0 ${cozy ? 'self-end mb-6' : 'self-start'}`}
            aria-label={_copy("copy.648c99c43631", { defaultValue: "View {{value1}}'s profile", value1: displayName })}
            onClick={(e) => e.stopPropagation()}
          >
            {avatar}
          </Link>
        ) : avatar;
      })()}

      {/* Shrinks to the bubble rather than filling 75% of the row, so the hover
          toolbar pinned to its side lands next to a short message instead of at
          the far edge of the thread. The calc() keeps room for that toolbar. */}
      <div className={`min-w-0 ${cozy
        // Cozy: phones give a bubble most of the row (the hover toolbar is a
        // computer thing); wide screens keep room for it.
        ? (isOwnMessage ? 'max-w-[85%] md:max-w-[min(75%,calc(100%_-_9rem))] text-right' : 'max-w-[85%] md:max-w-[min(75%,calc(100%_-_12rem))]')
        : (isOwnMessage ? 'max-w-[min(75%,calc(100%_-_9rem))] text-right' : 'max-w-[min(75%,calc(100%_-_12rem))]')}`}>
        {/* Reply preview */}
        {message.replyTo && (
          <div>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById(`dm-msg-${message.replyTo!._id}`);
                if (!el) return;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-white/40', 'bg-white/10');
                setTimeout(() => el.classList.remove('ring-2', 'ring-white/40', 'bg-white/10'), 2000);
              }}
              className="mb-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/60 text-xs text-zinc-400 max-w-full overflow-hidden transition-colors"
            >
              <Reply className="w-3 h-3 flex-shrink-0" />
              <span className="text-zinc-300 font-medium flex-shrink-0">{message.replyTo.sender?.displayName || message.replyTo.sender?.username || _copy("copy.b512d97e7cbf", { defaultValue: "User" })}</span>
              <span className="min-w-0 truncate">{message.replyTo.content || (message.replyTo.encMedia ? encryptedMediaLabel(message.replyTo.encMedia, _copy) : _copy("copy.2bc85f36b3e4", { defaultValue: "📎 Media" }))}</span>
            </button>
          </div>
        )}

        <div className="relative inline-block max-w-full align-top">
        {/* Tip message — system-style bubble. Monochrome, as on mobile: the amber
            was the last colour left in a thread whose palette is black and white. */}
        {message.msgType === 'tip' && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.16] text-zinc-200 text-sm">
            <TipGemIcon tipped burstKey={isFreshTip(message.createdAt) ? 1 : 0} className="w-4 h-4" />
            <span>{_copy("copy.b74733d38668", { defaultValue: "Tip: " })}<DhbAmount amount={message.tipAmount} currency={message.tipSymbol} />
            </span>
          </div>
        )}

        {/* Poll message — the same card a post's poll uses; members vote in place. */}
        {message.msgType === 'poll' && message.poll && !message.isDeleted && (
          <div className="w-[300px] max-w-full text-left">
            <PollCard tokenId={message.poll.tokenId} autoTranslate={false} />
          </div>
        )}

        {/* Regular message bubble */}
        {message.msgType !== 'tip' && !(message.msgType === 'poll' && message.poll) && !message.isDeleted && (
          <div
            {...doubleTap}
            style={canDoubleTap ? { touchAction: 'manipulation' } : undefined}
            /* Mine vs theirs is carried by fill-vs-outline rather than by a
               glass stack: a filled block with no border for own messages, a
               hairline block with no fill for theirs. Geometry matches the
               mobile app — 12px with the tail corner squared to 2px. */
            className={`inline-block rounded-xl ${isEditing ? 'max-w-full ' : ''}${
              message.msgType === 'media' || message.msgType === 'gif' || isPostShare
                ? 'text-white'
                : `px-4 py-2 ${
                    isOwnMessage
                      ? 'bg-white/[0.11] text-white rounded-br-sm'
                      : 'border border-white/[0.16] text-zinc-100 rounded-bl-sm'
                  }${cozy && !cozy.first ? (isOwnMessage ? ' rounded-tr-md' : ' rounded-tl-md') : ''}${
                    cozy && !cozy.last ? (isOwnMessage ? ' !rounded-br-md' : ' !rounded-bl-md') : ''
                  }`
            }`}
          >
            {/* Text message — or a shared post rendered as a rich card */}
            {message.msgType === 'msg' && (
              isEditing ? (
                <div className="flex flex-col gap-1.5 items-stretch">
                  <textarea
                    ref={editTextareaRef}
                    autoFocus
                    dir="auto"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void saveEdit();
                      } else if (e.key === 'Escape') {
                        onCancelEdit?.();
                      }
                    }}
                    maxLength={5000}
                    rows={1}
                    disabled={isSavingEdit}
                    className="w-[28rem] max-w-full text-sm text-white bg-white/[0.08] border border-white/20 rounded-lg px-3 py-1.5 outline-none focus:border-white/40 resize-none disabled:opacity-60"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => onCancelEdit?.()}
                      disabled={isSavingEdit}
                      className="p-1 text-zinc-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none"
                      title={_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={isSavingEdit}
                      className="p-1 text-white hover:text-zinc-300 disabled:opacity-60 disabled:pointer-events-none"
                      title={_copy("copy.1509f561f241", { defaultValue: "Save" })}
                    >
                      {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ) : momentReply ? (
                <div className="flex w-52 max-w-full flex-col gap-2 text-start">
                  <MomentReplyPreview id={momentReply.id} />
                  {textContent && <p dir="auto" className="whitespace-pre-wrap break-words text-sm">{renderChatTextWithLinks(isTranslated ? translatedText : textContent)}</p>}
                </div>
              ) : isPostShare && sharedLink!.kind !== 'post' ? (
                /* One bubble, card first and caption after, like a photo with a
                   caption. The card is inset 4px with an 8px radius under the
                   bubble's 12px so the corners share a centre; its own outline
                   and top margin are dropped, or it reads as a box in a box.
                   Fixed width because the bubble is inline-block and a w-full
                   card has nothing definite to resolve against. */
                <div className={`w-[288px] max-w-full flex flex-col rounded-xl p-1 text-left ${
                  isOwnMessage
                    ? 'bg-white/[0.11] text-white rounded-br-sm'
                    : 'border border-white/[0.16] text-zinc-100 rounded-bl-sm'
                }`}>
                  <div className="[&>*]:!mt-0 [&>*]:!rounded-lg [&>*]:!border-0">
                    <DehubLinkEmbed link={sharedLink!} compact />
                  </div>
                  {shareCaption ? (
                    <p dir="auto" className="text-sm break-words whitespace-pre-wrap px-3 pt-2 pb-1.5">
                      {renderChatTextWithLinks(isTranslated ? translatedText : shareCaption)}
                    </p>
                  ) : null}
                </div>
              ) : isPostShare ? (
                <div className={`flex flex-col gap-1.5 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                  {shareCaption ? (
                    <p dir="auto" className={`text-sm break-words whitespace-pre-wrap text-left rounded-xl px-4 py-2 ${
                      isOwnMessage
                        ? 'bg-white/[0.11] text-white'
                        : 'border border-white/[0.16] text-zinc-100'
                    }`}>
                      {renderChatTextWithLinks(isTranslated ? translatedText : shareCaption)}
                    </p>
                  ) : null}
                  {/* The bubble is inline-block, so it has no definite width for
                      a `w-full` card to resolve against — the entity cards would
                      collapse to their content. Give them the same 280px the
                      post card already pins itself to. */}
                  <div className="w-[280px] max-w-full text-left">
                    <DehubLinkEmbed link={sharedLink!} compact />
                  </div>
                </div>
              ) : (
                <div className={`flex flex-col gap-1.5 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
                  {/* An address-only message strips to nothing, and an empty
                      paragraph still takes a line inside the bubble. */}
                  {dmDisplayText?.trim() ? (
                    <p dir="auto" className="text-sm break-words whitespace-pre-wrap text-left">
                      {renderChatTextWithLinks(dmDisplayText)}
                    </p>
                  ) : null}
                  {/* Same 280px as the entity card above, and for the same
                      reason: the bubble is inline-block, so a w-full card has
                      nothing definite to resolve against. */}
                  {dmAssetRefs.length > 0 && (
                    <div className="w-[280px] max-w-full text-left">
                      <AssetRefCards refs={dmAssetRefs} className="mt-0" />
                    </div>
                  )}
                  {assistantActions.map((id) => (
                    <div key={id} className="w-[280px] max-w-full text-left">
                      <AssistantActionCard actionId={id} />
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Media (image or document) — loading state while mediaUrls is empty */}
            {message.msgType === 'media' && encMedia && (
              <div>
                {message.destruct?.mode === 'open' && isOwnMessage ? (
                  <DmOpenTimerMedia messageId={message._id} mine destruct={message.destruct} kind={encMedia.kind === 'video' ? 'video' : 'image'}>
                    <EncryptedMediaBody
                      messageId={message._id}
                      isOwn={isOwnMessage}
                      destruct={message.destruct}
                      media={encMedia}
                      mediaUrl={primaryMediaUrl}
                      onOpenImage={onOpenImage}
                    />
                  </DmOpenTimerMedia>
                ) : (
                <EncryptedMediaBody
                  messageId={message._id}
                  isOwn={isOwnMessage}
                  destruct={message.destruct}
                  media={encMedia}
                  mediaUrl={primaryMediaUrl}
                  onOpenImage={onOpenImage}
                />
                )}
                {message.content && (
                  <p dir="auto" className="text-sm mt-1 break-words whitespace-pre-wrap text-left">
                    {renderChatTextWithLinks(isTranslated ? translatedText : message.content)}
                  </p>
                )}
              </div>
            )}
            {/* Pay-to-unlock photo or video: its own card, never the plain media path. */}
            {message.msgType === 'media' && message.lock && (
              <LockedMediaBubble message={message} onOpenImage={onOpenImage} />
            )}
            {message.msgType === 'media' && !message.lock && !encMedia && !isLockedMedia && (
              <div>
                {primaryMediaUrl && isFileMedia ? (
                  <>
                    <a
                      href={getMediaUrl(primaryMediaUrl)!}
                      download={primaryMedia?.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 transition-colors hover:bg-white/[0.08] max-w-[280px]"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                        <FileText className="h-4 w-4 text-white" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white" title={primaryMedia?.name}>
                          {primaryMedia?.name || _copy("copy.040d2b3689dd", { defaultValue: "Attachment" })}
                        </span>
                        <span className="block text-xs text-white/50">
                          {getAttachmentLabel(primaryMedia?.name || '')}
                          {primaryMedia?.size ? ` · ${formatAttachmentSize(primaryMedia.size)}` : ''}
                        </span>
                      </span>
                      <Download className="h-4 w-4 flex-shrink-0 text-white/40 transition-colors group-hover:text-white/80" />
                    </a>
                    {message.content && (
                      <p dir="auto" className="text-sm mt-1 break-words whitespace-pre-wrap text-left">
                        {renderChatTextWithLinks(isTranslated ? translatedText : message.content)}
                      </p>
                    )}
                  </>
                ) : primaryMediaUrl ? (
                  <>
                    {message.destruct?.mode === 'open' && !(primaryMedia?.type === 'audio' || primaryMedia?.mimeType?.startsWith('audio/')) && !isOwnMessage ? (
                      <DmOpenTimerMedia
                        messageId={message._id}
                        mine={false}
                        destruct={message.destruct}
                        kind={primaryMedia?.type === 'video' || primaryMedia?.mimeType?.startsWith('video/') ? 'video' : 'image'}
                        src={getMediaUrl(primaryMediaUrl) || primaryMediaUrl}
                      >
                        {null}
                      </DmOpenTimerMedia>
                    ) : message.destruct?.mode === 'open' && isOwnMessage && !(primaryMedia?.type === 'audio' || primaryMedia?.mimeType?.startsWith('audio/')) ? (
                      <DmOpenTimerMedia messageId={message._id} mine destruct={message.destruct} kind={primaryMedia?.type === 'video' || primaryMedia?.mimeType?.startsWith('video/') ? 'video' : 'image'}>
                        {primaryMedia?.type === 'video' || primaryMedia?.mimeType?.startsWith('video/') ? (
                          <DmVideoBubble
                            messageId={message._id}
                            src={getMediaUrl(primaryMediaUrl) || primaryMediaUrl}
                            options={message.mediaOptions}
                            mine
                            destruct={message.destruct}
                          />
                        ) : (
                          <SettledImg
                            src={getMediaUrl(primaryMediaUrl)!}
                            alt={_copy("copy.f9c984552075", { defaultValue: "Shared image" })}
                            className="max-w-full max-h-64 rounded-lg object-cover cursor-zoom-in"
                            onClick={() => onOpenImage?.(getMediaUrl(primaryMediaUrl)!)}
                          />
                        )}
                      </DmOpenTimerMedia>
                    ) : primaryMedia?.type === 'video' || primaryMedia?.mimeType?.startsWith('video/') ? (
                      <DmVideoBubble
                        messageId={message._id}
                        src={getMediaUrl(primaryMediaUrl) || primaryMediaUrl}
                        options={message.mediaOptions}
                        mine={isOwnMessage}
                        destruct={message.destruct}
                        onViewed={() => { void markDmMessageViewed(message._id).catch(() => undefined); }}
                      />
                    ) : primaryMedia?.type === 'audio' || primaryMedia?.mimeType?.startsWith('audio/') ? (
                      <VoiceMessagePlayer
                        audioUrl={getMediaUrl(primaryMediaUrl) || primaryMediaUrl}
                        duration={message.voiceDuration}
                        isPending={false}
                      />
                    ) : (
                    <SettledImg
                      src={getMediaUrl(primaryMediaUrl)!}
                      alt={_copy("copy.f9c984552075", { defaultValue: "Shared image" })}
                      className="max-w-full max-h-64 rounded-lg object-cover cursor-zoom-in"
                      onClick={() => onOpenImage?.(getMediaUrl(primaryMediaUrl)!)}
                    />
                    )}
                    {/* Driven by the same hook as a text message, not by
                        <TranslatableText>, so a caption follows the chat rules
                        above instead of the post rules. textContent is
                        message.content here: isPostShare can only be true for
                        msgType 'msg'. */}
                    {message.content && (
                      <p dir="auto" className="text-sm mt-1 break-words whitespace-pre-wrap text-left">
                        {renderChatTextWithLinks(isTranslated ? translatedText : message.content)}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 min-w-[120px] py-4 px-3 rounded-lg bg-zinc-700/50">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-400 flex-shrink-0" />
                    <span className="text-sm text-zinc-400">
                      {isFileMedia ? _copy("copy.c62cd2cb247c", { defaultValue: "Uploading file..." }) : _copy("copy.1b7dbc58638c", { defaultValue: "Uploading image..." })}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* GIF */}
            {message.msgType === 'gif' && primaryMediaUrl && (
              <img
                src={outsideImage(primaryMediaUrl)}
                alt={tr('emojiPicker.tabGif', 'GIF')}
                className="max-w-full max-h-48 rounded-lg"
              />
            )}

            {/* Voice message — show player when mediaUrls available, else pending */}
            {message.msgType === 'voice' && encMedia && (
              <EncryptedMediaBody
                messageId={message._id}
                media={encMedia}
                mediaUrl={primaryMediaUrl}
                voiceDuration={message.voiceDuration}
              />
            )}
            {message.msgType === 'voice' && !encMedia && !isLockedMedia && (
              <VoiceMessagePlayer
                audioUrl={primaryMediaUrl ? (getMediaUrl(primaryMediaUrl) || primaryMediaUrl) : undefined}
                duration={message.voiceDuration}
                isPending={!primaryMediaUrl}
              />
            )}


            {/* Tip badge on regular messages */}
            {message.tipAmount != null && (message.msgType as string) !== 'tip' && (
              <div className="inline-flex items-center gap-1 mt-1 text-xs text-zinc-300">
                <TipGemIcon tipped burstKey={isFreshTip(message.createdAt) ? 1 : 0} className="w-3 h-3" />
                <DhbAmount amount={message.tipAmount} currency={message.tipSymbol} />
              </div>
            )}
          </div>
        )}

        {/* Deleted message */}
        {message.isDeleted && (
          <div className={`inline-block rounded-xl px-4 py-2 border border-white/[0.10] text-zinc-500 text-sm italic ${isOwnMessage ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>{_copy("copy.7e94d4b9a46b", { defaultValue: "Message deleted" })}</div>
        )}

        {/* Encrypted on another device's key — never show the envelope */}
        {!message.isDeleted && message.undecryptable && (
          <div className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 border border-white/[0.10] text-zinc-500 text-sm italic ${isOwnMessage ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            {tr('messages.cannotDecrypt')}
          </div>
        )}

          {/* Every action lives in the message menu: right-click, a hold on a
              phone, or this one "..." for keyboard and mouse users. */}
          {!selecting && menuable && message.msgType !== 'tip' && (
            <div className={`absolute top-1/2 -translate-y-1/2 ${isOwnMessage ? 'right-full mr-1' : 'left-full ml-1'} z-10`}>
              <MessageMoreButton onOpen={menuPoint.openAt} />
            </div>
          )}
        </div>

        {!message.isDeleted && message.reactions && Object.entries(message.reactions).some(([, addresses]) => addresses.length > 0) && (
          <div className={`mt-1 flex flex-wrap gap-1 ${isOwnMessage ? 'justify-end' : ''}`}>
            {Object.entries(message.reactions).filter(([, addresses]) => addresses.length > 0).map(([emoji, addresses]) => {
              const mine = !!currentUserAddress && addresses.some(address => address.toLowerCase() === currentUserAddress.toLowerCase());
              return (
                <button
                  type="button"
                  key={emoji}
                  data-chat-reaction-chip
                  onClick={() => mine ? onRemoveReaction?.(message._id, emoji) : onReact?.(message._id, emoji)}
                  className={`group/reaction inline-flex items-center gap-1 px-1 py-0.5 text-xs ${mine ? 'text-white' : 'text-zinc-400 hover:text-white'}`}
                >
                  <ReactionGlyph messageId={message._id} emoji={emoji} addresses={addresses} me={currentUserAddress} className="h-4 m-0" />
                  {mine ? (
                    <><RollingCount value={addresses.length} className="text-[10px] group-hover/reaction:hidden" /><X className="hidden w-3 h-3 group-hover/reaction:block" /></>
                  ) : <RollingCount value={addresses.length} className="text-[10px]" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Forwarded label */}
        {message.isForwarded && (
          <div className={`text-xs text-zinc-500 mb-0.5 ${isOwnMessage ? 'text-right' : ''}`}>{_copy("copy.2345d3702d65", { defaultValue: "↪ Forwarded" })}</div>
        )}

        {cozyShowMeta && (
        <div data-cozy-meta={cozy ? '' : undefined} className={`text-xs text-zinc-500 mt-1 flex items-center gap-1 ${isOwnMessage ? 'justify-end' : ''}`}>
          <span>{cozy
            ? formatMessageTime(new Date(message.createdAt))
            : formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</span>
          {/* Image captions get the control too. They had none: the gate was
              msgType === 'msg', so a caption was auto-translated on mount and
              could not be put back. */}
          {!isTooShort && !message.isDeleted &&
            (message.msgType === 'msg' || (message.msgType === 'media' && !!message.content)) && (
            <button
              type="button"
              onClick={isTranslated ? handleShowOriginal : translateUp}
              disabled={isTranslating}
              className="inline-flex items-center gap-0.5 p-1.5 -m-1 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
              title={isTranslated ? _copy("copy.16194a69c43d", { defaultValue: "Show original" }) : _copy("copy.8fe147696fbf", { defaultValue: "Translate" })}
            >
              {isTranslating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isTranslated ? (
                <RotateCcw className="w-3.5 h-3.5" />
              ) : (
                <Languages className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          {message.encrypted && (
            <Lock className="w-3 h-3 text-zinc-600" aria-label={tr('messages.encrypted')} />
          )}
          {showPaymentPending && (
            <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
          )}
          {isOwnMessage && !showPaymentPending && message.sendState === 'failed' && (
            <SendStatus
              state="failed"
              onRetry={onRetrySend && (() => onRetrySend(message.clientKey ?? message._id))}
              onDiscard={onDiscardSend && (() => onDiscardSend(message.clientKey ?? message._id))}
            />
          )}
          {isOwnMessage && !showPaymentPending && message.sendState !== 'failed' && (
            // One fixed slot: a spinning ring while the send is out, the tick
            // once it lands. Same box either way, so nothing on the line moves.
            <span className={`relative inline-flex items-center justify-end gap-0.5 min-w-[14px] ${message.isRead ? "text-white" : "text-zinc-500"}`}>
              {/* Sent for when they're next online: stays until it is read,
                  never when it is delivered, so it says nothing about when
                  they were online. */}
              {message.whenOnline && !message.isRead && message.sendState !== 'sending' && (
                <Hourglass
                  data-when-online-tick
                  className="w-3 h-3"
                  aria-label={tr('dmSchedule.whenOnlineTick', { defaultValue: 'Waiting for them to come online. Turns into two ticks when read.' })}
                />
              )}
              {message.sendState === 'sending'
                ? <SendStatus state="sending" />
                : (message.isRead ? "✓✓" : "✓")}
            </span>
          )}
        </div>
        )}
      </div>
    </div>
    </>
  );
});

/** Exported for the state gallery, which lays out a cozy thread by hand. */
export { MessageBubble as DmMessageBubble };

function MessagesSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
          {i % 2 === 0 && (
            <div className="w-8 h-8 rounded-xl theme-skeleton animate-pulse flex-shrink-0" />
          )}
          <div className={`flex-1 max-w-[75%] ${i % 2 !== 0 ? 'text-right' : ''}`}>
            <div
              className={`inline-block h-12 w-48 rounded-2xl theme-skeleton animate-pulse ${
                i % 2 !== 0 ? 'rounded-br-md' : 'rounded-bl-md'
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The per-message fee banner has to paint before the API answers or it flashes
 * in half a second after the composer. It is a *hint*, so it expires: the other
 * side can raise, drop or waive their fee at any time, and an entry with no
 * clock on it kept showing the old number for as long as the browser lived.
 */
const DM_FEE_CACHE_TTL = 6 * 60 * 60 * 1000;

/** Set once the user has confirmed the "messages cost DHB" warning — never shown again on this browser. */
export const DM_FEE_WARNING_SEEN_KEY = 'dehub-dm-fee-warning-seen';

function readCachedDmFee(key: string): DmFee | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; t?: number; fee?: DmFee };
    // Pre-TTL entries were the bare DmFee. Drop them rather than trust them.
    if (parsed?.v !== 1 || typeof parsed.t !== 'number' || !parsed.fee) {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.t > DM_FEE_CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.fee;
  } catch {
    return null;
  }
}

function writeCachedDmFee(key: string, fee: DmFee): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: 1, t: Date.now(), fee }));
  } catch { /* quota — the banner just waits for the API */ }
}

function useDmPin(conversationId: string, address: string | undefined, conversation: DeHubConversation) {
  const serverPinned = conversation.pinnedMessages?.length
    ? conversation.pinnedMessages[conversation.pinnedMessages.length - 1]
    : null;

  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(serverPinned);

  useEffect(() => {
    setPinnedMessageId(serverPinned);
  }, [serverPinned]);

  const pinMessage = useCallback(async (messageId: string) => {
    setPinnedMessageId(messageId);
    if (address) {
      try {
        await pinDmMessage(conversationId, messageId, address);
      } catch {
        setPinnedMessageId(serverPinned);
      }
    }
  }, [conversationId, address, serverPinned]);

  const unpinMessage = useCallback(async () => {
    const previous = pinnedMessageId;
    setPinnedMessageId(null);
    if (address && previous) {
      try {
        await unpinDmMessage(conversationId, previous, address);
      } catch {
        setPinnedMessageId(previous);
      }
    }
  }, [conversationId, address, pinnedMessageId]);

  return { pinnedMessageId, pinMessage, unpinMessage };
}

/** History pages (30 lines each) a chat may pull in at open to reach where you left off. */
const MAX_READ_SPOT_PAGES = 10;
/** Room above the unread line when a chat opens on it, so the sticky day pill doesn't cover it. */
const UNREAD_MARKER_TOP_GAP = 48;

export function DirectMessageChat({ conversation, onBack, initialComposerText, dock = false, headerActions, focusComposer = false, cozy = false, options }: DirectMessageChatProps) {
  const { t: _copy } = _useCopy();
  const { user, walletAddress, openLoginModal } = useAuth();
  // The note button shows only where the Notes sheet can open (Messages).
  const notesAvailable = useNotesSheetAvailable() && !dock;
  const { isBanned: accountBanned } = useBannedAccount();
  const { setCallMessageHandler } = useCallActions();
  const queryClient = useQueryClient();
  const { t: tr } = useI18n();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  // "Unread messages" marker: fixed at open, before the read receipt clears
  // the flags. The conversation's count is read here, on the first render,
  // because opening the chat zeroes it in the list cache right after.
  const unreadAtOpenRef = useRef(conversation.unreadCount ?? 0);
  const [unreadAnchor, setUnreadAnchor] = useState<UnreadAnchor | null>(null);
  // Once the marker has been on screen the jump button stops pointing at it.
  const [unreadMarkerSeen, setUnreadMarkerSeen] = useState(false);
  const [unreadMarkerAbove, setUnreadMarkerAbove] = useState(false);
  const [unreadBelow, setUnreadBelow] = useState(0);
  // Every line below the fold: the number on the scroll-down button.
  const [linesBelow, setLinesBelow] = useState(0);
  const unreadPlacedRef = useRef(false);
  // The _id of the message that was last when this effect last ran, so an
  // append can be told apart from prepended history.
  const prevLastMessageIdRef = useRef<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isBlocked, setIsBlocked] = useState(conversation.isBlocked ?? false);
  const [isBlockProcessing, setIsBlockProcessing] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showTipDialog, setShowTipDialog] = useState(false);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useSurfaceDraft("components/app/chat/DirectMessageChat.tsx:searchQuery", '');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [forwardMessageTarget, setForwardMessageTarget] = useState<DmMessage | null>(null);
  // Several messages forwarded at once from the Select bar.
  const [bulkForward, setBulkForward] = useState<DmMessage[] | null>(null);
  // Picking several messages: Select on one (hover button, Ctrl/Cmd-click, or
  // a hold on a phone), then click or tap others. null = not picking.
  const [pickedMsgs, setPickedMsgs] = useState<Set<string> | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dmGateChecked, setDmGateChecked] = useState(false);
  const [dmGated, setDmGated] = useState(false);
  const [planRules, setPlanRules] = useState<Awaited<ReturnType<typeof getDMPlanSettings>> | null>(null);
  /**
   * Stable for the life of the thread. Keyed on conversation.id this wrote to
   * "…-new_0x<addr>" for the first few seconds of a brand new chat and to the
   * ObjectId ever after, so the entry it saved could never be read back — one
   * orphaned key per person you ever messaged.
   */
  const draftScope = conversationIdentity(conversation);
  const [replyTarget, setReplyTarget] = useDraftState<DmMessage | null>(`${draftScope}:reply`, null);
  const dmFeeCacheKey = `dehub-dm-fee-${draftScope}`;
  const [dmFee, setDmFeeRaw] = useState<DmFee | null>(() => {
    // A fee the other side has since changed must not be believed forever —
    // the cache is here to paint the banner before the API answers, not to
    // replace it.
    const cached = readCachedDmFee(dmFeeCacheKey);
    if (cached) return cached;
    if (conversation.dmFee) return conversation.dmFee;
    // Detect fee immediately from otherUser search data so banner shows before any API call
    const otherRaw = (conversation.otherUser || conversation.participants?.[0]) as any;
    const dmS = otherRaw?.dmSettings || otherRaw?.dmSetting;
    const settings = Array.isArray(dmS) ? dmS[0] : dmS;
    const pmFee = settings?.perMessageFee;
    if (pmFee && pmFee > 0) return { required: true, fee: pmFee, hasFreeAccess: false };
    return null;
  });
  const setDmFee: React.Dispatch<React.SetStateAction<DmFee | null>> = (valOrFn) => {
    setDmFeeRaw(prev => {
      const next = typeof valOrFn === 'function' ? (valOrFn as (p: DmFee | null) => DmFee | null)(prev) : valOrFn;
      if (next) writeCachedDmFee(dmFeeCacheKey, next);
      return next;
    });
  };
  const [isFreeAccessGranted, setIsFreeAccessGranted] = useState(false);
  const [isFreeAccessProcessing, setIsFreeAccessProcessing] = useState(false);
  const [resolvedConversationId, setResolvedConversationId] = useState(conversation.id);
  const { pinnedMessageId, pinMessage: handlePinMessage, unpinMessage: handleUnpinMessage } = useDmPin(conversation.id, walletAddress ?? undefined, conversation);
  const [initError, setInitError] = useState(false);
  const { messageFee: myMessageFee } = useDmSettings();
  const isInitialMount = useRef(true);
  const hasInitialized = useRef(false);
  /** Tracks which identifier we tried for createAndStart — on retry, try the other */
  const lastTriedUserId = useRef<string | null>(null);

  // Fee-related state
  const [customTipAmount, setCustomTipAmount] = useState('');
  const [feeBalanceBase, setFeeBalanceBase] = useState<number | null>(null);
  const [feeBalanceBnb, setFeeBalanceBnb] = useState<number | null>(null);
  const [feeBalanceLoading, setFeeBalanceLoading] = useState(false);
  const [isSendingFee, setIsSendingFee] = useState(false);
  // Track tx hashes we've confirmed on-chain so we can override 'pending' paymentStatus from API
  const confirmedTxHashes = useRef<Set<string>>(new Set());
  /**
   * A DM fee paid on-chain for a message that then failed to send, together
   * with the message it was paid for. Held so the retry rides the same payment
   * — without it the user is charged twice for one message, which is the worst
   * version of a silent send failure.
   *
   * The content is part of it so the payment can only be spent on the message
   * it was bought for. Reusing it for whatever the user happens to type next
   * would let a second, different message travel free.
   *
   * A ref, not persisted: it only has to survive until the retry, and a hash
   * carried across a reload could be replayed against something unrelated.
   */
  const paidTxHashRef = useRef<{ hash: string; content: string } | null>(null);
  // Version tick: incremented when a tx confirms so the (memoized) bubbles
  // re-render and pick up the new txConfirmed prop.
  const [txConfirmations, bumpTxConfirmations] = useReducer((v: number) => v + 1, 0);

  // Determine if fee is required
  const feeRequired = dmFee?.required && !dmFee.hasFreeAccess;
  const activeFee = feeRequired ? (customTipAmount ? parseFloat(customTipAmount) || dmFee!.fee : dmFee!.fee) : 0;
  // Best balance across both chains for send-disable check.
  // Only disable when balances have loaded AND both are insufficient.
  // While loading (both null), keep enabled so the payment attempt does its own live balance check.
  const bestFeeBalance = Math.max(feeBalanceBase ?? -1, feeBalanceBnb ?? -1);
  const balancesLoaded = feeBalanceBase !== null || feeBalanceBnb !== null;
  const feeSendDisabled = feeRequired && balancesLoaded && (bestFeeBalance < activeFee);

  /**
   * First paid send in this browser gets a one-time "this costs DHB, are you
   * sure?" confirmation — a lot of people don't expect messaging to cost
   * anything and the fee banner lives up in the scroll history, out of view
   * once a conversation has any length to it.
   */
  const [showFeeWarning, setShowFeeWarning] = useState(false);
  const feeWarningResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const confirmFeeSend = useCallback((): Promise<boolean> => {
    try {
      if (localStorage.getItem(DM_FEE_WARNING_SEEN_KEY) === '1') return Promise.resolve(true);
    } catch {
      /* storage unavailable: show the warning */
    }
    return new Promise<boolean>((resolve) => {
      feeWarningResolveRef.current = resolve;
      setShowFeeWarning(true);
    });
  }, []);
  const handleFeeWarningOpenChange = (open: boolean) => {
    setShowFeeWarning(open);
    if (!open && feeWarningResolveRef.current) {
      feeWarningResolveRef.current(false);
      feeWarningResolveRef.current = null;
    }
  };
  const handleFeeWarningConfirm = () => {
    try {
      localStorage.setItem(DM_FEE_WARNING_SEEN_KEY, '1');
    } catch {
      /* not remembering the warning must never block the send */
    }
    feeWarningResolveRef.current?.(true);
    feeWarningResolveRef.current = null;
    setShowFeeWarning(false);
  };

  // Check DHB balance on both Base and BNB when fee is required
  useEffect(() => {
    if (!feeRequired) return;
    const addr = walletAddress;
    if (!addr) return;
    setFeeBalanceLoading(true);
    const baseConfig = getChainConfig(BASE_CHAIN_ID);
    const bnbConfig = getChainConfig(BNB_CHAIN_ID);
    Promise.all([
      getERC20Balance(baseConfig.dhbToken, addr, BASE_CHAIN_ID).catch(() => null),
      getERC20Balance(bnbConfig.dhbToken, addr, BNB_CHAIN_ID).catch(() => null),
    ]).then(([baseBal, bnbBal]) => {
      setFeeBalanceBase(baseBal !== null ? Number(baseBal) / 1e18 : null);
      setFeeBalanceBnb(bnbBal !== null ? Number(bnbBal) / 1e18 : null);
      setFeeBalanceLoading(false);
    });
  }, [feeRequired, walletAddress]);

  // When parent upgrades conversation to one with real dmId (e.g. after getContacts returns Riftn data), use it
  useEffect(() => {
    const convId = conversation.id;
    const isRealId = !convId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(convId);
    if (isRealId && convId !== resolvedConversationId) {
      setResolvedConversationId(convId);
      setInitError(false);
    }
  }, [conversation.id, resolvedConversationId]);

  const isGroupChat = conversation.isGroup || !!conversation.groupInfo;
  // Pinning: either person in a one-to-one chat; in a group, whoever runs it.
  const canPinHere = !isGroupChat
    || (!!walletAddress && conversation.groupInfo?.creatorAddress?.toLowerCase() === walletAddress.toLowerCase());

  // Get the other participant
  const otherUser = conversation.otherUser ||
    conversation.participants?.find(p =>
      (p.address || p._id) !== (user?.address || user?._id)
    ) ||
    conversation.participants?.[0];

  const avatarUrl = buildAvatarUrl(otherUser?.address || '', otherUser?.avatarImageUrl || otherUser?.avatarUrl);
  const displayName = otherUser?.displayName || otherUser?.display_name || otherUser?.username ||
    (otherUser?.address ? `${otherUser.address.slice(0, 6)}...${otherUser.address.slice(-4)}` : _copy("copy.b512d97e7cbf", { defaultValue: "User" }));
  const profileLink = otherUser?.username ? profilePath(otherUser.username) : otherUser?.address ? profilePath(otherUser.address) : '#';
  const { data: peerProfile } = useDeHubProfile({ userId: otherUser?.address, address: walletAddress || undefined, enabled: !isGroupChat && !!otherUser?.address });
  const peerLocalTime = useProfileLocalTime(isGroupChat ? undefined : peerProfile?.customs?.publicTimeZone);

  // ── Scheduled messages ────────────────────────────────────────────────
  // One-to-one chats that already exist and are free to message. A paid chat
  // needs its fee paid at the moment of sending, which a later send cannot do.
  const canSchedule = !isGroupChat && !feeRequired && !accountBanned
    && !resolvedConversationId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(resolvedConversationId);
  const scheduled = useScheduledDms(canSchedule ? resolvedConversationId : null, otherUser?.address);
  const whenLabel = useWhenLabel();
  const [showScheduled, setShowScheduled] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<{ text: string; clear: () => void } | null>(null);
  const handleScheduleClick = ({ text, hasAttachment, clear }: { text: string; hasAttachment: boolean; clear: () => void }) => {
    if (hasAttachment) {
      toast(tr('dmSchedule.textOnly', { defaultValue: 'Only text messages can be scheduled for now.' }));
      return;
    }
    // Nothing typed: the clock shows what is already waiting.
    if (!text) { setShowScheduled(true); return; }
    setScheduleDraft({ text, clear });
  };
  const confirmSchedule = async (date: Date | null) => {
    const draft = scheduleDraft;
    if (!date || !draft) return;
    try {
      // Sealed for this chat now, the same as a message sent by hand.
      const wire = await prepareOutgoing(otherUser?.address, draft.text);
      await scheduleDm({ dmId: resolvedConversationId, content: wire.content, sendAt: date, replyTo: replyTarget?._id });
      draft.clear();
      if (replyTarget) setReplyTarget.complete(replyTarget, null);
      queryClient.invalidateQueries({ queryKey: scheduledDmKey(resolvedConversationId) });
      toast.success(tr('dmSchedule.scheduledToast', { defaultValue: 'Scheduled for {{when}}', when: whenLabel(date) }), {
        action: { label: tr('dmSchedule.view', { defaultValue: 'View' }), onClick: () => setShowScheduled(true) },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr('dmSchedule.error', { defaultValue: 'That did not work. Try again.' }));
    }
  };

  // "When they're next online": sent now as a normal line (one tick and an
  // hourglass for the sender), held by the server until they next open the
  // app or site. Same rules as scheduling: free one-to-one text.
  const sendWhenOnline = () => {
    const draft = scheduleDraft;
    if (!draft) return;
    draft.clear();
    // handleSendMessage is declared further down; this only runs on a tap, long after.
    void handleSendMessage({ content: draft.text, type: 'msg', whenOnline: true });
  };

  // createAndStart — get/create conversation + dmFee
  const createAndStart = useCreateAndStart();

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Skip createAndStart when we already have a real conversation ID — backend returns error for existing convos
    const convId = conversation.id;
    const hasRealConvId = !convId.startsWith('new_') && !/^0x[0-9a-fA-F]{40}$/i.test(convId);
    if (hasRealConvId) return;

    const address = otherUser?.address;
    const knownId = otherUser?._id;

    const run = async () => {
      // Backend createAndStart requires MongoDB ObjectId — fetch profile if we only have address
      let userId = knownId;
      if (!userId && address) {
        try {
          const profile = await getAccountInfo(address);
          userId = profile._id || address;
        } catch {
          userId = address;
        }
      }
      if (!userId) return;

      lastTriedUserId.current = userId;
      createAndStart.mutate(userId, {
      onSuccess: (data) => {
        console.log('[DM] createAndStart success:', data);
        setInitError(false);
        if (data._id) setResolvedConversationId(data._id);
        if (data.dmFee) {
          console.log('[DM] dmFee detected:', data.dmFee);
          setDmFee(data.dmFee);
        } else {
          // Fallback: use dmSettings from search result when server doesn't return dmFee
          const otherUserData = otherUser as any;
          const perMessageFee = otherUserData?.dmSettings?.perMessageFee;
          if (perMessageFee && perMessageFee > 0) {
            console.log('[DM] Using fallback dmFee from otherUser.dmSettings:', perMessageFee);
            setDmFee({ required: true, fee: perMessageFee, hasFreeAccess: false });
          }
        }
      },
      onError: (err) => {
        console.warn('[DM] createAndStart failed (non-critical):', err);
        // Don't show error banner for timeout — server creates the conversation
        // asynchronously and getContacts polling will pick it up within ~5s.
        // Only show error for non-timeout failures (e.g. auth error).
        const isTimeout = err?.message?.includes('timeout');
        if (!isTimeout) setInitError(true);
        // Fallback: use dmSettings from the search result / otherUser data
        const otherUserData = otherUser as any;
        const perMessageFee = otherUserData?.dmSettings?.perMessageFee;
        if (perMessageFee && perMessageFee > 0 && !dmFee) {
          console.log('[DM] Using fallback dmFee from search result:', perMessageFee);
          setDmFee({
            required: true,
            fee: perMessageFee,
            hasFreeAccess: false,
          });
        }
      },
      });
    };

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check DM plan gating
  useEffect(() => {
    const otherUserData = otherUser as any;
    const planId = otherUserData?.dmPlanId;
    if (!planId) {
      setPlanRules(null);
      setDmGateChecked(true);
      return;
    }
    getDMPlanSettings(planId)
      .then((settings) => {
        setDmGated(!settings.enabled);
        setPlanRules(settings);
        setDmGateChecked(true);
      })
      .catch(() => setDmGateChecked(true));
  }, [otherUser]);

  // Beyond switching DMs off, a creator's plan can narrow which kinds of
  // message go through and set a floor on tips.
  const planMinTip = planRules?.minTipDhb ?? 0;
  const planAllows = (kind: DMMessageType): boolean => {
    const allowed = planRules?.allowedMessageTypes;
    return !Array.isArray(allowed) || allowed.length === 0 || allowed.includes(kind);
  };
  /** False (and says why) when the peer's plan does not take this send. */
  const planAllowsSend = ({ type, mediaFile }: Pick<ChatInputSendArgs, 'type' | 'mediaFile'>): boolean => {
    const kind: DMMessageType =
      type === 'msg' ? 'text'
      : type === 'gif' ? 'gif'
      : type === 'voice' ? 'audio'
      : mediaFile?.type.startsWith('video/') ? 'video'
      : mediaFile?.type.startsWith('audio/') ? 'audio'
      : 'image';
    if (!planAllows(kind)) {
      toast.warning(tr('dm.planTypeNotAllowed'));
      return false;
    }
    return true;
  };
  const openTipDialog = () => {
    if (!planAllows('tip')) {
      toast.warning(tr('dm.planTypeNotAllowed'));
      return;
    }
    setShowTipDialog(true);
  };

  const {
    messages,
    isLoading,
    isError: messagesError,
    refetch: refetchMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    markAsRead,
    addReaction,
    removeReaction,
  } = useMessages(resolvedConversationId);

  // Silent when this device already holds the key; one wallet signature the
  // first time. Opening a chat is the moment to ask, not page load.
  //
  // The status is rendered. Discarding it was half the reason this failed
  // quietly: a locked vault set `locked`, nothing showed it, and the thread
  // went on sending in the clear.
  const { status: encryptionStatus, retry: retryEncryption, needsWalletConnection: encryptionNeedsWalletConnection } = useDmEncryption();

  // Lets handleSaveEdit read current content without depending on `messages` —
  // that array changes on every incoming socket message, and putting it in a
  // useCallback dep list would break the bubble-level memoization documented
  // above MessageBubble (every bubble's onSaveEdit prop would change identity
  // on every new message, not just the one being edited).
  // Encryption is per chat and off unless "Encrypt chat" is on. Nothing here
  // asks for the wallet on its own: older encrypted lines collapse into one
  // row each, and the banner offers Unlock for anyone who wants to read them.
  const hasUndecryptable = encryptionStatus !== 'ready'
    && messages.some(m => m.undecryptable && !m.isDeleted);
  const { byId: chatPrefsById, update: updateChatPref } = useChatPrefs();
  const canToggleEncryption = !isGroupChat && /^[0-9a-f]{24}$/i.test(conversation.id || '');
  const chatEncrypted = canToggleEncryption && !!chatPrefsById.get(conversation.id)?.encryptedAt;
  const toggleEncryption = useCallback(() => {
    const on = !chatEncrypted;
    void updateChatPref(conversation.id, { encrypted: on });
    if (on) toast.success(tr('messages.encrypted', { defaultValue: 'End-to-end encrypted' }));
    // Turning it on is the deliberate moment to set up this device's key.
    if (on && encryptionStatus !== 'ready') void retryEncryption();
  }, [chatEncrypted, conversation.id, updateChatPref, tr, encryptionStatus, retryEncryption]);

  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Where you left off (server-saved, same on every device). Real chats only:
  // a chat that is still being created has nothing to come back to.
  const readChatId = /^[0-9a-f]{24}$/i.test(resolvedConversationId || '') ? resolvedConversationId : null;
  const readSpot = useChatReadPosition(readChatId);
  // History pages pulled in at open to reach the spot (30 lines a page).
  const readSpotPagesRef = useRef(0);
  // Saving starts once the chat has been placed, so the jump to the bottom on
  // open never counts as having read everything.
  const readTrackingRef = useRef(false);

  const pinnedMessage = pinnedMessageId ? messages.find(m => m._id === pinnedMessageId) ?? null : null;

  /**
   * Tail of the thread handed to the reply drafter, oldest first. Text only —
   * an image or voice note carries nothing the model can reply to, and paid or
   * gated bubbles have no business being summarised into a draft.
   */
  const smartReplyThread = useMemo(() => {
    const ownAddress = walletAddress?.toLowerCase();
    const ownId = user?._id;
    return messages
      .filter(m => (m.msgType ?? 'msg') === 'msg' && !!m.content?.trim())
      .slice(-12)
      .map(m => {
        const senderAddress = m.sender?.address?.toLowerCase();
        const senderId = m.sender?._id;
        const isOwn =
          m.author === 'me' ||
          (!!senderAddress && !!ownAddress && senderAddress === ownAddress) ||
          (!!senderId && !!ownId && senderId === ownId);
        return {
          from: isOwn ? ('me' as const) : ('them' as const),
          name: isOwn ? undefined : displayName,
          text: m.content!.trim(),
        };
      });
  }, [messages, walletAddress, user?._id, displayName]);

  const sendMessageMutation = useSendMessage(resolvedConversationId);
  const deleteConversationMutation = useDeleteConversation();

  // A failed line stays where it was sent; Retry resends it in place (reusing
  // any fee already paid for it), Remove drops it.
  const retrySendRef = useRef(sendMessageMutation.mutateAsync);
  retrySendRef.current = sendMessageMutation.mutateAsync;
  const handleRetrySend = useCallback((clientKey: string) => {
    const vars = failedSendRetry(clientKey);
    if (!vars) return;
    void retrySendRef.current(vars).catch(() => {});
  }, []);
  const handleDiscardSend = useCallback((clientKey: string) => {
    discardFailedSend(queryClient, resolvedConversationId, clientKey);
  }, [queryClient, resolvedConversationId]);

  // Register call message handler so call events appear as bubbles in this chat
  useEffect(() => {
    setCallMessageHandler((content) => {
      sendMessageMutation.mutate({ content, msgType: 'msg' });
    });
    return () => setCallMessageHandler(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCallMessageHandler, resolvedConversationId]);

  // Register this conversation as "open" so its unread badge is forced to 0
  // in the conversations list while the chat is visible.
  useEffect(() => {
    return registerOpenConversation(resolvedConversationId);
  }, [resolvedConversationId]);

  // Emit markAsRead (socket) + scroll on initial load
  useEffect(() => {
    if (isInitialMount.current && messages.length > 0 && readSpot.ready) {
      const ownAddress = walletAddress?.toLowerCase();
      const ownId = user?._id;
      const lines = messages.map((m) => {
        const a = m.sender?.address?.toLowerCase();
        const id = m.sender?._id;
        return {
          id: m._id,
          own: m.author === 'me' || (!!a && !!ownAddress && a === ownAddress) || (!!id && !!ownId && id === ownId),
          isRead: m.isRead,
          at: m.createdAt,
          skip: !!m.isDeleted || !!m.undecryptable || m._id.startsWith('temp-'),
        };
      });
      let anchor: UnreadAnchor | null = null;
      if (readSpot.opening) {
        // Open on the line after where you left off, wherever that is.
        const found = anchorFromReadSpot(lines, readSpot.opening, !!hasNextPage);
        if (found.kind === 'older') {
          if (readSpotPagesRef.current < MAX_READ_SPOT_PAGES) {
            if (!isFetchingNextPage) {
              readSpotPagesRef.current += 1;
              void fetchNextPage();
            }
            return;
          }
          // Too far back to pull in at once: open on the oldest loaded unread line.
          const theirs = lines.filter((l) => !l.own && !l.skip);
          if (theirs.length) anchor = { id: theirs[0].id, ids: theirs.map((l) => l.id), count: Math.max(theirs.length, unreadAtOpenRef.current) };
        } else if (found.kind === 'anchor') {
          anchor = found.anchor;
        }
      } else {
        // No spot saved yet for this chat: fall back to the read flags.
        anchor = findUnreadAnchor(lines, unreadAtOpenRef.current);
      }
      // Scroll ONLY this container — scrollIntoView scrolls every ancestor,
      // dragging the page itself down and parking dead space under composer.
      // With unread lines the layout effect below opens on the marker instead.
      const container = scrollContainerRef.current;
      if (anchor) {
        setUnreadAnchor(anchor);
        // The marker normally places itself at once; never leave saving off.
        window.setTimeout(() => { readTrackingRef.current = true; }, 1500);
      } else {
        if (container) container.scrollTop = container.scrollHeight;
        readTrackingRef.current = true;
      }
      isInitialMount.current = false;
      prevLastMessageIdRef.current = messages[messages.length - 1]?._id ?? null;
      markAsRead();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, markAsRead, readSpot.ready, isFetchingNextPage]);

  /** Saves the newest line that is on screen as where you left off. */
  const reportReadSpot = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !readTrackingRef.current || !readChatId) return;
    const list = messagesRef.current;
    const ids: string[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (!m._id.startsWith('temp-') && m.createdAt) ids.push(m._id);
    }
    const id = newestLineOnScreen(container, ids, (x) => container.querySelector<HTMLElement>(`[id="dm-msg-${x}"]`));
    if (!id) return;
    const line = list.find((m) => m._id === id);
    if (line?.createdAt) readSpot.report(line._id, line.createdAt);
  }, [readChatId, readSpot.report]);
  const readReportFrame = useRef(0);
  const scheduleReadReport = useCallback(() => {
    if (readReportFrame.current) return;
    readReportFrame.current = requestAnimationFrame(() => {
      readReportFrame.current = 0;
      reportReadSpot();
    });
  }, [reportReadSpot]);
  useEffect(() => () => cancelAnimationFrame(readReportFrame.current), []);
  // New lines landing while you sit at the bottom are read as they arrive.
  useEffect(() => {
    const timer = window.setTimeout(scheduleReadReport, 400);
    return () => window.clearTimeout(timer);
  }, [messages, scheduleReadReport]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') scheduleReadReport(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [scheduleReadReport]);

  /** Top of the unread marker relative to the visible top of the thread, or null. */
  const unreadMarkerOffset = useCallback((): number | null => {
    const container = scrollContainerRef.current;
    const marker = container?.querySelector<HTMLElement>('[data-chat-unread-marker]');
    if (!container || !marker) return null;
    return marker.getBoundingClientRect().top - container.getBoundingClientRect().top;
  }, []);

  /** How many unread lines sit below the fold, and whether the marker is above it. */
  const refreshUnreadJump = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !unreadAnchor) return;
    const box = container.getBoundingClientRect();
    let below = 0;
    for (const id of unreadAnchor.ids) {
      const el = container.querySelector<HTMLElement>(`[id="dm-msg-${id}"]`);
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

  // Open on the marker: it lands just under the top edge with the unread lines
  // below it. Few enough to fit and the clamp leaves you at the newest line.
  useLayoutEffect(() => {
    if (!unreadAnchor || unreadPlacedRef.current) return;
    const container = scrollContainerRef.current;
    const offset = unreadMarkerOffset();
    if (!container || offset === null) return;
    unreadPlacedRef.current = true;
    container.scrollTop = Math.max(0, container.scrollTop + offset - UNREAD_MARKER_TOP_GAP);
    refreshUnreadJump();
    readTrackingRef.current = true;
    scheduleReadReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadAnchor, unreadMarkerOffset]);

  const refreshLinesBelow = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setLinesBelow(countLinesBelow(container, messagesRef.current.map((m) => m._id), (id) => document.getElementById(`dm-msg-${id}`)));
  }, []);

  const unreadJumpFrame = useRef(0);
  const scheduleUnreadJump = useCallback(() => {
    if (unreadJumpFrame.current) return;
    unreadJumpFrame.current = requestAnimationFrame(() => {
      unreadJumpFrame.current = 0;
      refreshUnreadJump();
      refreshLinesBelow();
    });
  }, [refreshUnreadJump, refreshLinesBelow]);
  useEffect(() => () => cancelAnimationFrame(unreadJumpFrame.current), []);
  // Lines arriving (or older pages landing) while you're up the thread.
  useEffect(() => {
    const timer = window.setTimeout(scheduleUnreadJump, 120);
    return () => window.clearTimeout(timer);
  }, [messages, scheduleUnreadJump]);

  const jumpToUnreadMarker = useCallback(() => {
    const container = scrollContainerRef.current;
    const offset = unreadMarkerOffset();
    if (!container || offset === null) return;
    container.scrollTo({ top: Math.max(0, container.scrollTop + offset - UNREAD_MARKER_TOP_GAP), behavior: 'smooth' });
    setUnreadMarkerSeen(true);
  }, [unreadMarkerOffset]);

  // Re-emit markAsRead when conversation is focused/visible
  useEffect(() => {
    if (!resolvedConversationId || resolvedConversationId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(resolvedConversationId)) return;
    
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        emitReadReceipt(resolvedConversationId);
      }
    };
    
    // Emit on mount (covers navigation back to chat)
    const timer = setTimeout(() => emitReadReceipt(resolvedConversationId), 1000);
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [resolvedConversationId]);

  // Auto-scroll on new messages + auto-mark as read while chat is open.
  //
  // Keyed on the identity of the last message, not on messages.length: paging
  // back prepends history, which grows the length too, so a length comparison
  // counted older messages as new. Scrolling up through a long thread
  // therefore popped a "N new messages" pill whose count climbed with every
  // page fetched, and re-fired markAsRead on each one.
  useEffect(() => {
    if (isInitialMount.current) return;
    const prevLastId = prevLastMessageIdRef.current;
    const prevIndex = prevLastId ? messages.findIndex((m) => m._id === prevLastId) : -1;
    // Anything after the message that used to be last is genuinely new. If the
    // old tail is gone — a full refetch, or an optimistic id swapped for the
    // real one — count nothing rather than guess, so the pill can't lie.
    const appended = prevIndex === -1 ? 0 : messages.length - 1 - prevIndex;

    if (appended > 0) {
      // Auto-read: user is actively viewing this chat
      markAsRead();
      const container = scrollContainerRef.current;
      if (container) {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        if (distanceFromBottom < 150) {
          // Container-scoped, like every other pin here — never the page.
          setTimeout(() => container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }), 50);
        } else {
          setNewMessageCount(prev => prev + appended);
        }
      }
    }
    prevLastMessageIdRef.current = messages[messages.length - 1]?._id ?? null;
  }, [messages, markAsRead]);

  // Keep the newest messages pinned above the on-screen keyboard. With
  // `interactive-widget=resizes-content` the layout (and this flex column)
  // shrinks from the bottom when the keyboard opens, which would otherwise
  // leave the latest messages hidden until the user scrolls.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let lastHeight = vv.height;
    const onResize = () => {
      const delta = lastHeight - vv.height; // >0 → viewport shrank (keyboard opened)
      lastHeight = vv.height;
      if (delta < 50) return;
      const container = scrollContainerRef.current;
      if (!container) return;
      // The container already lost ~delta px when this fires, so treat anyone
      // who was within delta+150px of the bottom as "at the bottom".
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom <= delta + 150) {
        // Scroll ONLY this container — scrollIntoView also scrolls the page,
        // which shoved the composer down behind the keyboard. Double rAF so
        // React has applied the keyboard-open height before we measure.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const c = scrollContainerRef.current;
          if (c) c.scrollTop = c.scrollHeight;
        }));
      }
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // If createAndStart failed and conversation ID is still virtual, resolve it from incoming messages
  useEffect(() => {
    if (!resolvedConversationId.startsWith('new_')) return;
    const otherAddress = resolvedConversationId.replace('new_', '').toLowerCase();
    const unsub = onDmSendMessage((msg) => {
      if (msg.conversation && msg.sender?.address?.toLowerCase() === otherAddress) {
        setResolvedConversationId(msg.conversation);
        setInitError(false);
      }
    });
    return unsub;
  }, [resolvedConversationId]);

  // Handle conversationDeleted event
  useEffect(() => {
    const convId = resolvedConversationId;
    if (!convId || convId.startsWith('new_')) return;

    const unsub = onConversationDeleted(({ dmId }) => {
      if (dmId === convId) {
        toast.info(_copy("copy.9b54f2919256", { defaultValue: "Conversation was deleted" }));
        onBack();
      }
    });
    return unsub;
  }, [resolvedConversationId, onBack]);

  // Handle DM_FEE_REQUIRED socket error — set fee state so the UI shows the payment banner
  useEffect(() => {
    const unsub = onDmError((err) => {
      if (err.code === 'DM_FEE_REQUIRED' && err.fee != null && err.fee > 0) {
        setDmFee(prev => prev ?? { required: true, fee: err.fee!, hasFreeAccess: false });
      }
    });
    return unsub;
  }, []);

  // Handle forwarded-message echo — server sends `forwardMessage` back to the sender
  // with the created message living in the TARGET conversation. Inject it into that
  // conversation's cache (if loaded) and refresh the conversations list.
  useEffect(() => {
    const unsub = onForwardMessage((msg) => {
      const rawConversation = (msg as any).conversation;
      const targetId: string =
        typeof rawConversation === 'string'
          ? rawConversation
          : rawConversation?._id || (msg as any).dmId || '';
      if (!targetId) return;
      const normalized: DmMessage = { ...msg, conversation: targetId, author: 'me' } as DmMessage;
      queryClient.setQueryData(messagesKeys.messages(targetId), (old: any) => {
        if (!old?.pages) return old;
        const firstItems = old.pages[0]?.items ?? [];
        if (firstItems.some((m: DmMessage) => m._id === normalized._id)) return old;
        const newPages = [...old.pages];
        newPages[0] = { ...newPages[0], items: [normalized, ...firstItems] };
        return { ...old, pages: newPages };
      });
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    });
    return unsub;
  }, [queryClient]);

  const handleForward = useCallback((message: DmMessage) => {
    setForwardMessageTarget(message);
  }, []);

  const handleReply = useCallback((message: DmMessage) => {
    setReplyTarget(message);
  }, [setReplyTarget]);

  // A quote left open in one thread must not ride along into the next. Runs
  // only when the thread changes: keyed on replyTarget it cleared every quote
  // the instant Reply set it, so Reply did nothing.
  const replyTargetRef = useRef(replyTarget);
  replyTargetRef.current = replyTarget;
  useEffect(() => {
    if (replyTargetRef.current) setReplyTarget.complete(replyTargetRef.current, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftScope]);

  /*
   * The composer is shared with Public Chat and speaks its Message shape, so
   * the DM being answered is described to it in those terms.
   */
  const composerReplyTo = useMemo(() => {
    if (!replyTarget) return null;
    const sender = replyTarget.sender;
    return {
      id: replyTarget._id,
      userId: sender?.address || sender?._id || '',
      userName: sender?.displayName || sender?.username
        || (sender?.address ? `${sender.address.slice(0, 6)}...${sender.address.slice(-4)}` : _copy("copy.b512d97e7cbf", { defaultValue: "User" })),
      content: replyTarget.content
        || (replyTarget.encMedia ? encryptedMediaLabel(replyTarget.encMedia, _copy) : replyTarget.msgType === 'voice' ? _copy("copy.e7d42aa1a046", { defaultValue: "🎤 Voice" }) : ''),
      timestamp: new Date(replyTarget.createdAt),
      type: replyTarget.msgType === 'gif' ? 'gif' as const : replyTarget.msgType === 'msg' ? 'text' as const : 'image' as const,
    };
  }, [replyTarget, _copy]);

  const handleStartEdit = useCallback((message: DmMessage) => {
    setEditingMessageId(message._id);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  // Same "await before trusting it" reasoning as handleForwardSelect below —
  // emitEditMessage rejects rather than dropping the edit into a dead socket.
  // Left open on failure, same as the forward dialog, so a rejected save
  // doesn't strand the user's in-progress edit.
  const handleSaveEdit = useCallback(async (messageId: string, content: string) => {
    const trimmed = content.trim();
    const original = messagesRef.current.find(m => m._id === messageId);
    if (!trimmed || !original) {
      return false;
    }
    if (trimmed === original.content) return true;

    let wire: { content: string; encrypted: boolean };
    try {
      // Same rule as a fresh send: encrypted when both sides have keys.
      wire = await prepareOutgoing(otherUser?.address, trimmed);
      await emitEditMessage({ dmId: resolvedConversationId, messageId, content: wire.content });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : _copy("copy.e408e6277aae", { defaultValue: "Could not save the edit." }));
      return false;
    }

    queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
      if (!old?.pages) return old;
      const pages = old.pages.map((page: any) => ({
        ...page,
        items: page.items.map((m: DmMessage) =>
          m._id === messageId
            ? { ...m, content: trimmed, encrypted: wire.encrypted || m.encrypted, undecryptable: false, isEdited: true, editedAt: new Date().toISOString() }
            : m
        ),
      }));
      return { ...old, pages };
    });
    return true;
  }, [queryClient, resolvedConversationId, otherUser?.address, _copy]);

  /*
   * An encrypted attachment is forwarded without re-uploading it: the file on
   * the CDN stays as it is and only its descriptor (which holds the file key)
   * is sealed again for the target conversation. A target that cannot be
   * encrypted gets the file opened here and sent as an ordinary attachment,
   * the same way an encrypted text line goes to such a chat in plaintext.
   */
  const forwardEncryptedMedia = useCallback(
    async (message: DmMessage, media: MediaDescriptor, targetConversationId: string) => {
      const stored = message.mediaUrls?.[0]?.url;
      if (!stored) throw new Error(_copy("copy.731440416c31", { defaultValue: "This attachment is still uploading." }));
      const targetPeer = peerAddressForConversation(queryClient, targetConversationId, walletAddress);
      const wire = await prepareOutgoing(targetPeer, encodeMediaDescriptor(media));
      if (wire.encrypted && wire.content.length <= MAX_ENVELOPE_CHARS) {
        await forwardDmMessage(message._id, targetConversationId, wire.content);
      } else {
        const blob = await loadDecryptedBlob(stored, media, message._id);
        const file = new File([blob], media.name || 'file', { type: media.mime });
        await uploadDmMedia(file, targetConversationId, user?._id || walletAddress || '', {
          peerAddress: targetPeer,
          caption: media.caption || '',
          msgType: media.kind === 'audio' ? 'voice' : 'media',
          voiceDuration: media.kind === 'audio' && media.dur != null ? Math.round(media.dur) : undefined,
        });
      }
      // The REST forward does not echo over the socket; pick the new line up from the API.
      queryClient.invalidateQueries({ queryKey: messagesKeys.messages(targetConversationId) });
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    },
    [queryClient, walletAddress, user?._id, _copy],
  );

  /** Sends one message on to another chat; throws when it did not go. */
  const forwardOne = useCallback(async (msg: DmMessage, targetConversationId: string) => {
    if (msg.encMedia) {
      await forwardEncryptedMedia(msg, msg.encMedia, targetConversationId);
    } else if (msg.encrypted) {
      // The server cannot re-encrypt for another conversation, so an
      // encrypted line is re-sent from here: plaintext from the cache,
      // encrypted again for the target's peer, citing the original.
      if (msg.undecryptable) throw new Error(tr('messages.cannotDecrypt'));
      const targetPeer = peerAddressForConversation(queryClient, targetConversationId, walletAddress);
      const wire = await prepareOutgoing(targetPeer, msg.content);
      await waitForDmSocket();
      await emitSendMessage({
        dmId: targetConversationId,
        content: wire.content,
        type: 'msg',
        forwardedFrom: { messageId: msg._id },
      });
    } else {
      await emitForwardMessage({ messageId: msg._id, targetDmId: targetConversationId });
    }
  }, [queryClient, walletAddress, tr, forwardEncryptedMedia]);

  /** The Select bar's Forward: each picked message in thread order, one after another. */
  const forwardMany = useCallback(async (list: DmMessage[], targetConversationId: string) => {
    let ok = 0;
    for (const msg of list) {
      try { await forwardOne(msg, targetConversationId); ok++; } catch { /* counted below */ }
    }
    if (ok === list.length) {
      toast.success(_copy('msgSelect.forwarded', { defaultValue: '{{count}} messages forwarded', count: ok }));
    } else if (ok > 0) {
      toast.error(_copy('msgSelect.partForwarded', { defaultValue: 'Forwarded {{ok}} of {{total}}', ok, total: list.length }));
    } else {
      toast.error(_copy("copy.60761edbfeb6", { defaultValue: "Could not forward the message." }));
      return;
    }
    setBulkForward(null);
    setPickedMsgs(null);
  }, [forwardOne, _copy]);

  const handleForwardSelect = useCallback(
    async (targetConversationId: string) => {
      if (bulkForward) {
        await forwardMany(bulkForward, targetConversationId);
        return;
      }
      if (!forwardMessageTarget) return;
      /*
       * "Message forwarded" used to be raised on the line after the emit,
       * unconditionally. A socket.io emit does not throw on a dead client, so
       * on a socket that had given up reconnecting the forward went nowhere and
       * the user was told in green that it had worked — and unlike a sent
       * message there is no bubble here to notice missing afterwards.
       *
       * The dialog is deliberately left open on failure: it is the only way
       * back to this action, and closing it would strand the intent as well as
       * the message.
       */
      if (forwardMessageTarget.encrypted && forwardMessageTarget.undecryptable) {
        toast.error(tr('messages.cannotDecrypt'));
        return;
      }
      try {
        await forwardOne(forwardMessageTarget, targetConversationId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : _copy("copy.60761edbfeb6", { defaultValue: "Could not forward the message." }));
        return;
      }
      toast.success(_copy("copy.4b0ad27c8ac8", { defaultValue: "Message forwarded" }));
      setForwardMessageTarget(null);
    },
    [forwardMessageTarget, bulkForward, tr, _copy, forwardOne, forwardMany],
  );

  // ─── Picking several messages (Select) ──────────────────────────────────────
  const [confirmPickDelete, setConfirmPickDelete] = useState(false);
  // Delete from the message menu, after picking for me or for everyone.
  const [confirmDeleteOne, setConfirmDeleteOne] = useState<DmMessage | null>(null);
  // Report message: the sender is reported with the line itself attached.
  const [reportTarget, setReportTarget] = useState<DmMessage | null>(null);
  /** Take messages out of this chat on screen: gone (for me) or "deleted" (for everyone). */
  const dropFromThread = useCallback((ids: Set<string>, scope: DeleteScope) => {
    if (!resolvedConversationId || ids.size === 0) return;
    queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          items: scope === 'me'
            ? page.items.filter((m: DmMessage) => !ids.has(m._id))
            : page.items.map((m: DmMessage) => (ids.has(m._id) ? { ...m, isDeleted: true, content: '' } : m)),
        })),
      };
    });
  }, [resolvedConversationId, queryClient]);
  const deleteOne = useCallback(async (target: DmMessage, scope: DeleteScope) => {
    if (!resolvedConversationId) return;
    try {
      await (scope === 'everyone' ? emitDeleteMessage : emitHideMessage)(resolvedConversationId, target._id);
      dropFromThread(new Set([target._id]), scope);
    } catch {
      toast.error(_copy('msgMenu.deleteFailed', { defaultValue: 'Could not delete the message' }));
    }
  }, [resolvedConversationId, dropFromThread, _copy]);
  // Phones say "Tap", computers "Click".
  const coarsePointer = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const isMineMsg = useCallback((m: DmMessage) => {
    const a = m.sender?.address?.toLowerCase();
    const own = walletAddress?.toLowerCase();
    return m.author === 'me' || (!!a && !!own && a === own) || (!!m.sender?._id && !!user?._id && m.sender._id === user._id);
  }, [walletAddress, user?._id]);
  /** Picked messages in thread order (the set holds ids in click order). */
  const pickedList = useMemo(
    () => (pickedMsgs ? messages.filter((m) => pickedMsgs.has(m._id) && !m.isDeleted) : []),
    [pickedMsgs, messages],
  );
  // Every pick can be deleted for you. In a one-to-one chat any of them can
  // also go for both of you; in a group only when all of them are yours.
  const pickedForEveryone = useMemo(
    () => pickedList.length > 0 && (!isGroupChat || pickedList.every((m) => isMineMsg(m))),
    [pickedList, isMineMsg, isGroupChat],
  );
  const startPick = useCallback((m: DmMessage) => setPickedMsgs(new Set([m._id])), []);

  // "Copy link" on a message, and opening one. A chat still being set up
  // (`new_<address>`, a bare address) has no id a link could name yet.
  const linkableChat = /^[A-Za-z0-9_-]{1,64}$/.test(resolvedConversationId || '')
    && !resolvedConversationId.startsWith('new_') && !/^0x[0-9a-f]{40}$/i.test(resolvedConversationId);
  const handleCopyLink = useCallback((m: DmMessage) => {
    copyChatMessageLink({ kind: 'dm', conversationId: resolvedConversationId }, m._id);
  }, [resolvedConversationId]);
  const linkedMessagesRef = useRef(messages);
  linkedMessagesRef.current = messages;
  const linkedPagingRef = useRef({ hasNextPage, fetchNextPage });
  linkedPagingRef.current = { hasNextPage, fetchNextPage };
  useLinkedMessage(
    linkableChat ? `dm:${resolvedConversationId}` : null,
    !isLoading && messages.length > 0,
    async (id) => {
      // Older than what is held: read back a page at a time, up to a point.
      for (let page = 0; page < 25; page += 1) {
        if (linkedMessagesRef.current.some((m) => m._id === id)) return true;
        const paging = linkedPagingRef.current;
        if (!paging.hasNextPage) return false;
        await paging.fetchNextPage();
        await new Promise((r) => window.setTimeout(r, 60));
      }
      return linkedMessagesRef.current.some((m) => m._id === id);
    },
    (id) => document.getElementById(`dm-msg-${id}`),
  );
  const togglePick = useCallback((m: DmMessage) => {
    setPickedMsgs((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(m._id)) next.delete(m._id); else next.add(m._id);
      return next;
    });
  }, []);
  // A different chat starts with nothing picked.
  useEffect(() => { setPickedMsgs(null); }, [resolvedConversationId]);
  // Esc leaves picking.
  useEffect(() => {
    if (!pickedMsgs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickedMsgs(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickedMsgs]);
  const copyPicked = useCallback(async () => {
    const text = pickedList
      .map((m) => (m.undecryptable ? '' : (m.content || '').trim()))
      .filter(Boolean)
      .join('\n');
    if (!text) { toast.error(_copy('msgSelect.nothingToCopy', { defaultValue: 'Nothing to copy in the picked messages' })); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(_copy('msgSelect.copied', { defaultValue: 'Copied {{count}} messages', count: pickedList.length }));
      setPickedMsgs(null);
    } catch {
      toast.error(_copy('msgSelect.copyFailed', { defaultValue: 'Could not copy' }));
    }
  }, [pickedList, _copy]);
  const deletePicked = useCallback(async (scope: DeleteScope) => {
    if (!resolvedConversationId || pickedList.length === 0) return;
    const forEveryone = scope === 'everyone' && pickedForEveryone;
    const send = forEveryone ? emitDeleteMessage : emitHideMessage;
    const results = await Promise.allSettled(pickedList.map((m) => send(resolvedConversationId, m._id)));
    const gone = new Set(pickedList.filter((_, i) => results[i].status === 'fulfilled').map((m) => m._id));
    dropFromThread(gone, forEveryone ? 'everyone' : 'me');
    if (gone.size === pickedList.length) {
      toast.success(_copy('msgSelect.deleted', { defaultValue: 'Deleted {{count}} messages', count: gone.size }));
      setPickedMsgs(null);
    } else {
      toast.error(_copy('msgSelect.partDeleted', { defaultValue: 'Deleted {{ok}} of {{total}}', ok: gone.size, total: pickedList.length }));
    }
  }, [resolvedConversationId, pickedList, pickedForEveryone, dropFromThread, _copy]);

  // Handle scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowJumpToLatest(distanceFromBottom > 100);
    if (distanceFromBottom < 50) setNewMessageCount(0);
    scheduleUnreadJump();
    scheduleReadReport();

    if (container.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      const previousHeight = container.scrollHeight;
      const previousTop = container.scrollTop;
      fetchNextPage().then(() => {
        requestAnimationFrame(() => {
          // Restore the reading position. Prepended history grows the
          // scrollHeight from the top, so the content the user was looking at
          // moves down by exactly that growth. Dropping previousTop left them
          // pinned within 100px of the top, which immediately re-fired this
          // fetch and walked them backwards through the thread.
          container.scrollTop = container.scrollHeight - previousHeight + previousTop;
        });
      });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, scheduleUnreadJump, scheduleReadReport]);

  const scrollToBottom = () => {
    // Container-scoped — scrollIntoView would drag the page down with it.
    const container = scrollContainerRef.current;
    if (container) glideToBottom(container);
    setNewMessageCount(0);
  };

  const handleSendMessage = async ({
    content,
    type,
    mediaFile,
    gifUrl,
    duration,
    mediaOptions,
    destruct,
    lockPrice,
    whenOnline,
  }: {
    content: string;
    type: 'msg' | 'media' | 'gif' | 'voice';
    mediaFile?: File;
    gifUrl?: string;
    duration?: number;
    mediaOptions?: DmVideoOptions;
    destruct?: DmDestructChoice;
    lockPrice?: number;
    /** Held by the server until they next come online (free one-to-one text only). */
    whenOnline?: boolean;
  }) => {
    // Taken now and cleared at once, like the composer itself — the quote goes
    // out with this message only.
    const replyingTo = replyTarget;

    const replyPreview: DmMessage['replyTo'] = replyingTo
      ? {
          _id: replyingTo._id,
          content: replyingTo.content,
          ...(replyingTo.encMedia ? { encMedia: replyingTo.encMedia } : {}),
          msgType: replyingTo.msgType,
          mediaUrls: replyingTo.mediaUrls.map(m => ({ ...m, mimeType: m.mimeType || '' })),
          voiceDuration: replyingTo.voiceDuration,
          sender: replyingTo.sender,
        }
      : null;

    /*
     * A fee paid for a send that then failed is already on-chain. Reuse it
     * rather than charging again for the same message — the retry is the user
     * pressing Send on text this component put back in their composer, not a
     * new message.
     */
    const held = paidTxHashRef.current;
    const reusingPaidTx = !!held && held.content === content.trim();
    let feeTxHash: string | undefined = reusingPaidTx ? held!.hash : undefined;

    // If fee is required, show optimistic message immediately, then process payment
    const paymentTempId = `temp-pay-${Date.now()}`;
    if (feeRequired && !reusingPaidTx) {
      // Inject optimistic "pending payment" message into the cache so user sees it immediately
      const optimisticPayMsg: DmMessage = {
        _id: paymentTempId,
        conversation: resolvedConversationId,
        sender: {
          _id: user?._id || '',
          username: user?.username || '',
          address: walletAddress || '',
          displayName: user?.displayName || user?.display_name || '',
          avatarImageUrl: user?.avatarImageUrl || '',
        },
        content,
        msgType: type || 'msg',
        mediaUrls: mediaFile
          ? [{
              url: createTransientBlobUrl(mediaFile, 5 * 60_000),
              // A document has no renderable preview, so it must not be typed
              // 'image' here — the bubble would try to <img> a blob URL for a PDF.
              type: type === 'voice' || mediaFile.type.startsWith('audio/') ? 'audio'
                : mediaFile.type.startsWith('video/') ? 'video'
                : isAllowedAttachment(mediaFile.name) ? 'file' : 'image',
              mimeType: mediaFile.type,
              name: mediaFile.name,
              size: mediaFile.size,
            }]
          : gifUrl ? [{ url: gifUrl, type: 'image', mimeType: 'image/gif' }] : [],
        voiceDuration: duration ?? null,
        isRead: false,
        isEdited: false,
        editedAt: null,
        isForwarded: false,
        replyTo: replyPreview,
        paymentStatus: 'pending',
        paymentTxHash: null,
        tipAmount: activeFee,
        tipSymbol: 'DHB',
        isDeleted: false,
        author: 'me',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
        if (!old?.pages) return old;
        const newPages = [...old.pages];
        if (newPages[0]) {
          newPages[0] = { ...newPages[0], items: [optimisticPayMsg, ...newPages[0].items] };
        }
        return { ...old, pages: newPages };
      });
      setTimeout(scrollToBottom, 50);

      setIsSendingFee(true);
      try {
        // Auto-select chain: prefer Base, fall back to BNB
        const chainId = (feeBalanceBase !== null && feeBalanceBase >= activeFee)
          ? BASE_CHAIN_ID
          : BNB_CHAIN_ID;

        const recipientAddress = otherUser?.address || '';
        if (!recipientAddress) {
          toast.error(_copy("copy.ddd7593448a8", { defaultValue: "Cannot process payment: recipient address unknown" }));
          // Remove optimistic message
          queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
            if (!old?.pages) return old;
            const newPages = [...old.pages];
            if (newPages[0]) {
              newPages[0] = { ...newPages[0], items: newPages[0].items.filter((m: any) => m._id !== paymentTempId) };
            }
            return { ...old, pages: newPages };
          });
          setIsSendingFee(false);
          return false;
        }

        console.log('[DM Fee] Paying', activeFee, 'DHB to recipient:', recipientAddress, '| chain:', chainId);
        toast.loading(_copy("copy.c03dae247d6d", { defaultValue: "Processing payment..." }), { id: 'dm-fee-send' });

        const tipResult = await sendTip({
          tokenId: 0,
          amount: activeFee,
          to: recipientAddress,
          chainId,
          skipBalanceCheck: true,
        });
        feeTxHash = tipResult.hash;

        // Track this tx as locally confirmed so we don't show "confirming payment..." forever.
        // bump forces a render so the memoized bubble receives txConfirmed=true —
        // a bare ref mutation is invisible to React.memo's prop compare.
        if (feeTxHash) {
          confirmedTxHashes.current.add(feeTxHash.toLowerCase());
          bumpTxConfirmations();
        }

        toast.success(dhbText(_copy("copy.ab9b7678406a", { defaultValue: "Paid {{value1}} DHB", value1: activeFee.toLocaleString() })), { id: 'dm-fee-send', duration: 2000 });

        // Update balance after payment
        if (chainId === BASE_CHAIN_ID) {
          setFeeBalanceBase(prev => prev !== null ? prev - activeFee : null);
        } else {
          setFeeBalanceBnb(prev => prev !== null ? prev - activeFee : null);
        }
      } catch (error: unknown) {
        console.error('[DM] Fee payment failed:', error);
        const errStr = String((error as any)?.message || error).toLowerCase();
        const isSessionExpired = errStr.includes('session expired') || errStr.includes('torus keyring') || errStr.includes('unable to find matching address') || errStr.includes('log in again');
        const isPausedErr = looksLikePausedRevert(errStr);
        // STF (SafeTransferFrom) can be caused by DHB being paused — check on-chain
        const isSTF = errStr.includes('stf') || errStr.includes('535446') || errStr.includes('safetransfer') || errStr.includes('token transfer failed');

        if (isSessionExpired) {
          toast.error(_copy("copy.e5ee1e7e84aa", { defaultValue: "Session expired" }), {
            id: 'dm-fee-send',
            description: _copy("copy.b216dbf4649b", { defaultValue: "Please sign in again to send this message" }),
            action: { label: _copy("copy.bfd402b2f6f3", { defaultValue: "Sign in" }), onClick: () => openLoginModal() },
            duration: 10000,
          });
        } else if ((isPausedErr || isSTF) && await checkDHBPaused().catch(() => false)) {
          toast.error(tr('tokens.transactionsPaused'), {
            id: 'dm-fee-send',
            description: tr('tokens.transactionsPausedDesc'),
            duration: 8000,
          });
        } else {
          toastTxError(error, _copy("copy.17aadc092fe6", { defaultValue: "Payment failed" }), { id: 'dm-fee-send' });
        }
        
        // Remove optimistic message on failure
        queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
          if (!old?.pages) return old;
          const newPages = [...old.pages];
          if (newPages[0]) {
            newPages[0] = { ...newPages[0], items: newPages[0].items.filter((m: any) => m._id !== paymentTempId) };
          }
          return { ...old, pages: newPages };
        });
        setIsSendingFee(false);
        return false;
      } finally {
        setIsSendingFee(false);
      }
    }

    // Remove the payment-optimistic temp message before mutate adds its own optimistic entry
    if (feeRequired && !reusingPaidTx) {
      queryClient.setQueryData(messagesKeys.messages(resolvedConversationId), (old: any) => {
        if (!old?.pages) return old;
        const newPages = [...old.pages];
        if (newPages[0]) {
          newPages[0] = { ...newPages[0], items: newPages[0].items.filter((m: any) => m._id !== paymentTempId) };
        }
        return { ...old, pages: newPages };
      });
    }

    // Now send the actual message (with txHash so server unlocks it).
    // mutateAsync, not mutate with per-call callbacks: those are dropped when
    // another send or a call event starts first, which left the composer
    // waiting forever with text that had already gone out.
    const sending = sendMessageMutation.mutateAsync(
      {
        content,
        msgType: type,
        mediaFile,
        gifUrl,
        voiceDuration: duration,
        txHash: feeTxHash,
        replyTo: replyingTo?._id,
        replyPreview,
        mediaOptions,
        destruct,
        lockPrice,
        ...(whenOnline ? { whenOnline: true } : {}),
      },
    );
    // The line is on screen from this moment (drawn as it will look once
    // delivered, with a small spinner), so the reply chip and the scroll go now
    // rather than after the round trip.
    paidTxHashRef.current = null;
    setReplyTarget(current => current?._id === replyingTo?._id ? null : current);
    requestAnimationFrame(scrollToBottom);
    return sending.then(
        (data) => {
          if (resolvedConversationId.startsWith('new_') && data.conversation) {
            setResolvedConversationId(data.conversation);
          }
          return true;
        },
        (err) => {
          /*
           * The line stays in the thread, marked "Not sent" with Retry and
           * Remove on it. Retry resends exactly what was sent (attachment and
           * any fee already paid included), so nothing goes back in the box
           * and nothing is charged twice.
           */
          const reason = err instanceof Error && err.message ? err.message : '';
          toast.error(reason || _copy("copy.66b8e077d85f", { defaultValue: "Failed to send message" }), { id: 'dm-send-failed' });
          // The composer already let go of the text; it lives on the bubble now.
          return true;
        },
      );
  };

  const handleDeleteConversation = (scope: DeleteScope = 'me') => {
    deleteConversationMutation.mutate(scope === 'everyone' ? { id: conversation.id, forEveryone: true } : conversation.id, {
      onSuccess: () => {
        toast.success(_copy("copy.09d6990a101a", { defaultValue: "Conversation deleted" }));
        onBack();
      },
      onError: () => {
        toast.error(_copy("copy.d14b3e7b0776", { defaultValue: "Failed to delete conversation" }));
      },
    });
    setShowDeleteDialog(false);
  };

  const handleToggleBlock = async () => {
    setIsBlockProcessing(true);
    try {
      if (isBlocked) {
        await unblockConversation(conversation.id);
        setIsBlocked(false);
        toast.success(_copy("copy.b4749dd2f6be", { defaultValue: "User unblocked" }));
      } else {
        await blockConversation(conversation.id);
        setIsBlocked(true);
        toast.success(_copy("copy.2b7bd96d731a", { defaultValue: "User blocked" }));
      }
    } catch (err) {
      console.error('Block/unblock error:', err);
      toast.error(isBlocked ? _copy("copy.576a5b77b7f1", { defaultValue: "Failed to unblock" }) : _copy("copy.4fe0d0facd1a", { defaultValue: "Failed to block" }));
    } finally {
      setIsBlockProcessing(false);
    }
  };
  const handleToggleFreeAccess = async () => {
    const targetAddress = otherUser?.address;
    if (!targetAddress) return;
    setIsFreeAccessProcessing(true);
    try {
      if (isFreeAccessGranted) {
        await revokeFreeDmAccess(targetAddress);
        setIsFreeAccessGranted(false);
        toast.success(_copy("copy.1a6b16b2717a", { defaultValue: "Free DM access revoked" }));
      } else {
        await grantFreeDmAccess(targetAddress);
        setIsFreeAccessGranted(true);
        toast.success(_copy("copy.84e427af920f", { defaultValue: "Free DM access granted" }));
      }
    } catch (err) {
      console.error('Free access toggle error:', err);
      toast.error(_copy("copy.90e384e43793", { defaultValue: "Failed to update free access" }));
    } finally {
      setIsFreeAccessProcessing(false);
    }
  };

  const handleRetryInit = () => {
    const tried = lastTriedUserId.current;
    const useId = otherUser?._id;
    const useAddr = otherUser?.address;
    // On retry: try the other identifier (address if we tried _id, or vice versa)
    const userId = tried === useId && useAddr ? useAddr : (useId || useAddr);
    if (!userId) return;
    setInitError(false);
    lastTriedUserId.current = userId;
    createAndStart.mutate(userId, {
      onSuccess: (data) => {
        setInitError(false);
        if (data._id) setResolvedConversationId(data._id);
        if (data.dmFee) setDmFee(data.dmFee);
      },
      onError: () => setInitError(true),
    });
  };

  const isVirtualConv = resolvedConversationId.startsWith('new_') || /^0x[0-9a-fA-F]{40}$/i.test(resolvedConversationId);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    void addReaction(messageId, emoji).catch(() => toast.error(_copy("copy.1344ec522f09", { defaultValue: "Could not add reaction." })));
  }, [addReaction, _copy]);
  const handleRemoveReaction = useCallback((messageId: string, emoji: string) => {
    void removeReaction(messageId, emoji).catch(() => toast.error(_copy("copy.b5145e1c11a3", { defaultValue: "Could not remove reaction." })));
  }, [removeReaction, _copy]);

  // The thread's rows, rebuilt only when a line or what a row shows changes.
  // Scrolling flips the jump button and unread counts; those re-render the
  // frame around the list, not every bubble in it.
  const threadRows = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim();
    const filtered = searchLower
      ? messages.filter(m => (m.content || '').toLowerCase().includes(searchLower))
      : messages;

    if (filtered.length === 0 && searchLower) {
      return (
        <AppState
          icon="search"
          title={_copy("copy.bf3cda441288", { defaultValue: "No matching messages" })}
          description={_copy("copy.c3de7ea4ce48", { defaultValue: "No messages match \"{{value1}}\".", value1: searchQuery })}
          kind="search-empty"
          size="compact"
          className="h-full"
        />
      );
    }

    return filtered.map((message, index) => {
      // Lines encrypted for another device collapse into one row per run.
      if (message.undecryptable && !message.isDeleted) {
        const prev = filtered[index - 1];
        if (prev?.undecryptable && !prev.isDeleted) return null;
        let count = 1;
        while (filtered[index + count]?.undecryptable && !filtered[index + count].isDeleted) count++;
        return <DmUndecryptableMessages key={message._id} messages={filtered.slice(index, index + count)} onDelete={setConfirmDeleteOne} />;
      }
      const ownAddress = walletAddress?.toLowerCase();
      const ownId = user?._id;
      const isOwn = (m: DmMessage) => {
        const a = m.sender?.address?.toLowerCase();
        const id = m.sender?._id;
        return m.author === 'me' || (!!a && !!ownAddress && a === ownAddress) || (!!id && !!ownId && id === ownId);
      };
      const isOwnMessage = isOwn(message);

      // Cozy: a run is back-to-back plain messages from one side,
      // each within 5 minutes of the last, on the same day.
      const joins = (a: DmMessage | undefined, b: DmMessage | undefined) =>
        !!a && !!b && !a.undecryptable && !b.undecryptable && !a.isDeleted && !b.isDeleted &&
        COZY_GROUPABLE.has(a.msgType || 'msg') && COZY_GROUPABLE.has(b.msgType || 'msg') &&
        isOwn(a) === isOwn(b) &&
        (isOwn(a) || (a.sender?.address || a.sender?._id) === (b.sender?.address || b.sender?._id)) &&
        cozyDayKey(a.createdAt) === cozyDayKey(b.createdAt) &&
        Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < COZY_GROUP_GAP_MS;
      const prevMsg = filtered[index - 1];
      const cozyPos: CozyGroupPos | undefined = cozy
        ? cozyPosFor(!joins(prevMsg, message), !joins(message, filtered[index + 1]))
        : undefined;
      const dayPill = cozy && (!prevMsg || cozyDayKey(prevMsg.createdAt) !== cozyDayKey(message.createdAt))
        ? <CozyDayPill iso={message.createdAt} />
        : null;
      const unreadMarker = !searchLower && unreadAnchor?.id === message._id
        ? <UnreadMarker count={unreadAnchor.count} />
        : null;

      return (
      <Fragment key={message.clientKey ?? message._id}>
      {dayPill}
      {unreadMarker}
      <MessageBubble
        message={message}
        isOwnMessage={isOwnMessage}
        cozy={cozyPos}
        highlightText={searchLower}
        txConfirmed={
          !!(message.paymentTxHash &&
            confirmedTxHashes.current.has(message.paymentTxHash.toLowerCase()))
        }
        isEditing={editingMessageId === message._id}
        onPin={canPinHere ? handlePinMessage : undefined}
        onForward={handleForward}
        onReply={handleReply}
        onEdit={handleStartEdit}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={handleCancelEdit}
        onOpenImage={setFullscreenImage}
        currentUserAddress={walletAddress || undefined}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        onRetrySend={handleRetrySend}
        onDiscardSend={handleDiscardSend}
        callPeerAddress={isGroupChat ? undefined : otherUser?.address}
        allowDoubleTapLike={!isGroupChat}
        selecting={pickedMsgs !== null}
        picked={!!pickedMsgs?.has(message._id)}
        onTogglePick={togglePick}
        onStartPick={startPick}
        onCopyLink={linkableChat ? handleCopyLink : undefined}
        onDelete={setConfirmDeleteOne}
        onReport={setReportTarget}
        canPin={canPinHere}
        isPinned={pinnedMessageId === message._id}
        onUnpin={handleUnpinMessage}
      />
      </Fragment>
    )});
  }, [
    // txConfirmations: re-reads confirmedTxHashes (a ref) after a payment lands.
    messages, searchQuery, walletAddress, user?._id, cozy, unreadAnchor, txConfirmations,
    editingMessageId, canPinHere, handlePinMessage, handleForward, handleReply, handleStartEdit,
    handleSaveEdit, handleCancelEdit, handleReact, handleRemoveReaction, handleRetrySend,
    handleDiscardSend, isGroupChat, otherUser?.address, pickedMsgs, togglePick, startPick,
    pinnedMessageId, handleUnpinMessage, _copy, setReportTarget,
  ]);

  return (
    <div data-page-bento data-bento-flat className="h-full flex flex-col overflow-hidden relative">
      {/* Header. The shell carries no fill now, so the bar is separated by a
          hairline instead of sitting on its own slightly-lighter slab. */}
      <div data-chat-header className={`flex items-center justify-between border-b border-white/[0.07] ${dock ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className={`flex items-center min-w-0 ${dock ? 'gap-2' : 'gap-3'}`}>
          {!dock && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              data-swipe-back
              className="text-white hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}

          <Link to={profileLink} className={`flex items-center min-w-0 ${dock ? 'gap-2' : 'gap-3'}`}>
            <Avatar className={dock ? 'w-8 h-8 shrink-0' : 'w-10 h-10'}>
              {avatarUrl && <AvatarImage src={avatarUrl} />}
              <AvatarFallback className="bg-zinc-700 text-white font-medium">
                {(displayName.startsWith('0x') ? displayName.charAt(2) : displayName.charAt(0)).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <h2 className={`font-semibold text-white flex items-center gap-1.5 truncate ${dock ? 'text-sm' : ''}`}>
                <BadgedName
                  badgeBalance={(otherUser as any)?.badgeBalance}
                  badgeLock={(otherUser as any)?.badgeLock}
                  username={otherUser?.username}
                  lookupId={otherUser?.username || otherUser?.address}
                >
                  {displayName}
                </BadgedName>
                <OnlineDot address={otherUser?.address} />
                <NewMemberChip address={otherUser?.address} />
              </h2>
              {otherUser?.username && (
                <p className="text-xs text-zinc-500">@{otherUser.username}</p>
              )}
              {!isGroupChat && <LastSeenLine address={otherUser?.address} customs={peerProfile?.customs} />}
              {peerLocalTime && (
                <p className="truncate text-xs text-zinc-400" title={String(peerProfile?.customs?.publicTimeZone)}>
                  {localTimeLine(_copy as never, peerLocalTime, peerProfile?.customs?.publicTimeZone)}
                </p>
              )}
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!dock && (
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={() => {
                setShowSearchBar(prev => !prev);
                if (!showSearchBar) {
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                } else {
                  setSearchQuery.complete(searchQuery, '');
                }
              }}
            >
              <Search className="w-5 h-5" />
            </Button>
          )}

          {!isGroupChat && isAssistantAddress(otherUser?.address) && (
            <AssistantDmMenu
              compact={dock}
              className={`text-zinc-400 hover:text-white hover:bg-zinc-800 ${dock ? 'h-8 w-8' : ''}`}
            />
          )}

          {!isGroupChat && otherUser?.address && !isAssistantAddress(otherUser.address) && (
            <>
              <DmVoiceCallButton
                recipientAddress={otherUser.address}
                className={`text-zinc-400 hover:text-white hover:bg-zinc-800 ${dock ? 'h-8 w-8' : ''}`}
              />
              <DmVideoCallButton
                recipientAddress={otherUser.address}
                className={`text-zinc-400 hover:text-white hover:bg-zinc-800 ${dock ? 'h-8 w-8' : ''}`}
              />
            </>
          )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={`text-zinc-400 hover:text-white hover:bg-zinc-800 ${dock ? 'h-8 w-8' : ''}`}>
              <MoreVertical className={dock ? 'w-4 h-4' : 'w-5 h-5'} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-chat-options-menu className={options ? CHAT_MENU_CONTENT : 'z-[150] bg-zinc-800 border-zinc-700'}>
            {isGroupChat && (
              <DropdownMenuItem
                className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                onClick={() => setShowGroupSettings(true)}
              >
                <Settings className="w-4 h-4 mr-2" />{_copy("copy.8e4622c03c80", { defaultValue: "Group Settings" })}</DropdownMenuItem>
            )}
            {options ? (
              <>
                <ChatOptionsDropdownItems
                  {...options}
                  onToggleEncryption={canToggleEncryption ? toggleEncryption : undefined}
                  isBlocked={isBlocked}
                  onBlock={handleToggleBlock}
                  onDelete={() => setShowDeleteDialog(true)}
                />
                {myMessageFee > 0 && (
                  <DropdownMenuItem
                    className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                    onClick={handleToggleFreeAccess}
                    disabled={isFreeAccessProcessing}
                  >
                    <Gift className="w-4 h-4 mr-2" />
                    {isFreeAccessGranted ? _copy("copy.f9c2e63a6dd5", { defaultValue: "Revoke Free Access" }) : _copy("copy.52f749af5cc6", { defaultValue: "Grant Free Access" })}
                  </DropdownMenuItem>
                )}
              </>
            ) : (
              <>
            <DropdownMenuItem
              className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
              onClick={handleToggleBlock}
              disabled={isBlockProcessing}
            >
              {isBlocked ? (
                <><ShieldCheck className="w-4 h-4 mr-2" />{_copy("copy.fba7f50dd3a0", { defaultValue: "Unblock User" })}</>
              ) : (
                <><ShieldBan className="w-4 h-4 mr-2" />{_copy("copy.e761ae1549da", { defaultValue: "Block User" })}</>
              )}
            </DropdownMenuItem>
            {myMessageFee > 0 && (
              <DropdownMenuItem
                className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                onClick={handleToggleFreeAccess}
                disabled={isFreeAccessProcessing}
              >
                <Gift className="w-4 h-4 mr-2" />
                {isFreeAccessGranted ? _copy("copy.f9c2e63a6dd5", { defaultValue: "Revoke Free Access" }) : _copy("copy.52f749af5cc6", { defaultValue: "Grant Free Access" })}
              </DropdownMenuItem>
            )}
            {canToggleEncryption && (
              <DropdownMenuItem
                className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                onClick={toggleEncryption}
              >
                {chatEncrypted ? <LockOpen className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                {chatEncrypted
                  ? tr('chatMenu.encryptOff', { defaultValue: 'Turn off encryption' })
                  : tr('chatMenu.encrypt', { defaultValue: 'Encrypt chat' })}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />{_copy("copy.9ccd1fb969eb", { defaultValue: "Delete Conversation" })}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {headerActions}
        </div>
      </div>

      {/* Search Bar */}
      {showSearchBar && (
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/80 border-b border-zinc-700/50">
          <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={_copy("copy.764a5aa003f8", { defaultValue: "Search messages..." })}
            className="flex-1 bg-transparent text-base md:text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery.complete(searchQuery, '')} className="text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <button
          onClick={() => {
            const el = document.getElementById(`dm-msg-${pinnedMessage._id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-2', 'ring-white/40', 'bg-white/10');
              setTimeout(() => el.classList.remove('ring-2', 'ring-white/40', 'bg-white/10'), 2000);
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/10 text-sm w-full text-left hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Pin className="w-3.5 h-3.5 text-white/80 flex-shrink-0 fill-current" />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-zinc-300 text-[10px] font-semibold uppercase tracking-wide leading-none mb-0.5">{_copy("copy.2aa60e3c77ee", { defaultValue: "Pinned Message" })}</span>
            <span className="text-zinc-400 text-xs truncate">{pinnedMessage.content || (pinnedMessage.encMedia ? encryptedMediaLabel(pinnedMessage.encMedia, _copy) : _copy("copy.2bc85f36b3e4", { defaultValue: "📎 Media" }))}</span>
          </div>
          <X
            onClick={(e) => { e.stopPropagation(); handleUnpinMessage(); }}
            className="ml-2 w-4 h-4 text-zinc-500 hover:text-white flex-shrink-0 transition-colors cursor-pointer"
          />
        </button>
      )}

      {/* DM Fee banner - simple for free access */}
      {dmFee?.required && dmFee.hasFreeAccess && (
        <div className="px-4 py-2 text-xs flex items-center gap-2 bg-white/5 text-zinc-300 border-b border-white/10">
          <Gem className="w-3 h-3 flex-shrink-0 text-current" />{_copy("copy.c809c8a735a9", { defaultValue: "You have free access to message this user" })}</div>
      )}

      {/* No key on this device. Says so, instead of quietly sending in the
          clear and rendering the other side's lines as unopenable. */}
      {(chatEncrypted || hasUndecryptable) && (encryptionStatus === 'pending' || encryptionStatus === 'locked' || encryptionStatus === 'error') && (
        <div className="px-4 py-2 text-xs flex items-center gap-2 bg-white/5 text-zinc-300 border-b border-white/10">
          <Unlock className="w-3 h-3 flex-shrink-0 text-current" />
          <span role="status" className="flex-1">
            {encryptionStatus === 'pending'
              ? tr('messages.encryptionTurningOn', { defaultValue: 'Waiting for your wallet to turn on encryption…' })
              : encryptionNeedsWalletConnection
                ? tr('messages.encryptionReconnect', { defaultValue: 'Reconnect your wallet to turn on encryption.' })
                : encryptionStatus === 'error'
                  ? tr('messages.encryptionSetupFailed', { defaultValue: 'Encryption setup failed. Please try again.' })
                  : chatEncrypted
                    ? tr('messages.encryptionOff')
                    : tr('messages.lockedTitle', { defaultValue: 'Unlock to read your messages' })}
          </span>
          <button
            type="button"
            disabled={encryptionStatus === 'pending'}
            onClick={() => { void retryEncryption(); }}
            className="text-white font-medium hover:underline disabled:opacity-50 disabled:cursor-wait shrink-0"
          >
            {encryptionNeedsWalletConnection
              ? tr('messages.encryptionReconnectWallet', { defaultValue: 'Reconnect wallet' })
              : chatEncrypted
                ? tr('messages.encryptionTurnOn')
                : tr('messages.lockedUnlock', { defaultValue: 'Unlock wallet' })}
          </button>
        </div>
      )}

      <DmSafetyBanner peer={otherUser as any} />
      {!isBlocked && (
        <MessageRequestBar
          conversationId={conversation.id}
          name={displayName}
          onDelete={() => setShowDeleteDialog(true)}
          onBlock={handleToggleBlock}
        />
      )}

      {/* Messages */}
      {isLoading ? (
        <MessagesSkeleton />
      ) : messagesError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <AlertCircle className="w-12 h-12 text-zinc-500 mb-3" />
          <p className="text-zinc-300 mb-2">{_copy("copy.eeaaa7b4d5d7", { defaultValue: "Failed to load messages" })}</p>
          <Button variant="glass" size="sm" onClick={() => refetchMessages()}>
            <RefreshCw className="w-3 h-3 mr-2" />{_copy("copy.df0fe9e00d35", { defaultValue: "Try Again" })}</Button>
        </div>
      ) : (
        <div className="relative flex-1 min-h-0 flex flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onPointerDown={dismissKeyboard}
          data-chat-wallpaper={cozy ? '' : undefined}
          className="flex-1 min-h-0 chat-text-zone overflow-y-auto px-4"
        >
          <div className={cozy ? 'mx-auto w-full max-w-[47.5rem]' : 'contents'}>
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
          )}

          {/* Fee info banner shown where messages would be */}
          {feeRequired && (
            <DmFeeInfoBanner
              fee={dmFee!.fee}
              recipientName={displayName}
              customTipAmount={customTipAmount}
              onCustomTipChange={setCustomTipAmount}
              balanceBase={feeBalanceBase}
              balanceBnb={feeBalanceBnb}
              balanceLoading={feeBalanceLoading}
            />
          )}

          {messages.length === 0 && !feeRequired && (
            <AppState icon="messages" title={_copy("copy.f42e0f66017d", { defaultValue: "No messages yet" })} description={_copy("copy.e65ae0cd6a5a", { defaultValue: "Say hello to start the conversation." })} size="section" className="h-full" />
          )}

          {threadRows}

          <div ref={bottomRef} />
          </div>
        </div>

      {/* Jump control: up to the unread marker until it has been seen, then
          down to the newest line. The count is unread lines still below. */}
      {(() => {
        const up = !!unreadAnchor && !unreadMarkerSeen && unreadMarkerAbove;
        const count = Math.max(linesBelow, unreadBelow + newMessageCount);
        return (
          <UnreadJumpButton
            show={up || showJumpToLatest || newMessageCount > 0}
            up={up}
            count={count}
            onClick={up ? jumpToUnreadMarker : scrollToBottom}
            className="absolute bottom-3 right-3 z-10"
          />
        );
      })()}
        </div>
      )}

      {/* Init error banner — shown when createAndStart timed out for a new conversation */}
      {initError && isVirtualConv && (
        <div className="px-4 py-2.5 bg-white/5 border-t border-white/10 flex flex-col items-stretch gap-2">
          <div className="flex items-center gap-2 text-zinc-300 text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{_copy("copy.ae9a8e3ea1b6", { defaultValue: "Could not connect — server didn't respond" })}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetryInit}
            disabled={createAndStart.isPending}
            className="text-white hover:text-zinc-200 hover:bg-white/10 w-full h-7 px-2 text-xs"
          >
            {createAndStart.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}{_copy("copy.942087cc2d41", { defaultValue: "Retry" })}</Button>
        </div>
      )}

      {/* Chat Input — disabled send when insufficient balance; hidden while
          the thread is locked, since anything typed would go out in the clear */}
      {canSchedule && pickedMsgs === null && (
        <ScheduledStrip items={scheduled.items} onOpen={() => setShowScheduled(true)} />
      )}
      {pickedMsgs !== null && (
        <MessageSelectBar
          count={pickedList.length}
          ownCount={pickedList.length}
          touch={coarsePointer}
          onCopy={() => { void copyPicked(); }}
          onForward={() => setBulkForward(pickedList)}
          onDelete={() => setConfirmPickDelete(true)}
          onCancel={() => setPickedMsgs(null)}
        />
      )}
      <DeleteMessageDialog
        open={!!confirmDeleteOne}
        onOpenChange={(next) => { if (!next) setConfirmDeleteOne(null); }}
        canDeleteForEveryone={!!confirmDeleteOne && (!isGroupChat || isMineMsg(confirmDeleteOne))}
        oneToOne={!isGroupChat}
        peerName={isGroupChat ? null : displayName}
        onDelete={(scope) => { const target = confirmDeleteOne; setConfirmDeleteOne(null); if (target) void deleteOne(target, scope); }}
      />
      <ReportModal
        open={!!reportTarget}
        onOpenChange={(next) => { if (!next) setReportTarget(null); }}
        reportType="user"
        userId={reportTarget?.sender?.address || reportTarget?.sender?.username || undefined}
        context={reportTarget ? messageReportContext(reportTarget, isGroupChat ? 'Group chat' : 'Direct message') : undefined}
      />
      <DeleteMessageDialog
        open={confirmPickDelete}
        onOpenChange={setConfirmPickDelete}
        count={pickedList.length}
        canDeleteForEveryone={pickedForEveryone}
        oneToOne={!isGroupChat}
        peerName={isGroupChat ? null : displayName}
        onDelete={(scope) => { void deletePicked(scope); }}
      />
      {pickedMsgs === null && <ChatInput
        onScheduleClick={canSchedule ? handleScheduleClick : undefined}
        scheduledCount={scheduled.items.length}
        autoFocus={focusComposer}
        initialText={initialComposerText}
        draftKey={draftScope}
        thread={smartReplyThread}
        peerName={displayName}
        onSendMessage={handleSendMessage}
        allowLock
        replyTo={composerReplyTo}
        onCancelReply={() => setReplyTarget.complete(replyTarget, null)}
        onTipClick={feeRequired ? undefined : openTipDialog}
        onPollClick={isVirtualConv ? undefined : () => setShowPollDialog(true)}
        onNoteClick={notesAvailable ? openNotesSheet : undefined}
        canSend={planAllowsSend}
        sendDisabled={accountBanned || !!feeSendDisabled || (initError && isVirtualConv)}
        sendDisabledReason={
          accountBanned
            ? tr('banned.line')
            : initError && isVirtualConv
            ? _copy("copy.5dbb36f20e18", { defaultValue: "Connection failed — tap Retry above" })
            : feeSendDisabled
            ? tr('messages.feeNotEnough', { amount: activeFee.toLocaleString() })
            : undefined
        }
        isSendingFee={isSendingFee}
        feeAmount={feeRequired ? activeFee : undefined}
        confirmBeforeSend={feeRequired ? confirmFeeSend : undefined}
      />}

      {/* Delete the whole chat: for me, for both (1:1), or cancel */}
      <DeleteMessageDialog
        subject="chat"
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        canDeleteForEveryone={!isGroupChat && !isVirtualConv}
        oneToOne
        peerName={isGroupChat ? null : displayName}
        onDelete={(scope) => handleDeleteConversation(scope)}
      />

      {/* First-paid-message warning — shown once per browser before the first fee is charged */}
      <AlertDialog open={showFeeWarning} onOpenChange={handleFeeWarningOpenChange}>
        <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{tr('messages.feeWarningTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              <Trans
                i18nKey="copy.1e488da3dfa7"
                defaults="The messages you send to {{value1}} are paid and will cost <amount>{{value2}}</amount> <coin></coin> each. Are you sure you want to continue?"
                values={{ value1: displayName, value2: activeFee.toLocaleString() }}
                components={{ amount: <span className="text-white font-semibold" />, coin: <DhbCoin /> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction onClick={handleFeeWarningConfirm}>{_copy("copy.31fbef162594", { defaultValue: "Continue" })}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Group Settings Drawer */}
      {isGroupChat && (
        <GroupSettingsDrawer
          open={showGroupSettings}
          onOpenChange={setShowGroupSettings}
          groupId={conversation.id}
          onLeft={onBack}
          onUpdated={() => {}}
        />
      )}


      {/* DM Tip Dialog */}
      <DmTipDialog
        open={showTipDialog}
        onOpenChange={setShowTipDialog}
        recipientAddress={otherUser?.address || ''}
        recipientName={displayName}
        conversationId={resolvedConversationId}
        minAmount={planMinTip}
      />

      {canSchedule && (
        <>
          <ScheduleSheet
            isOpen={!!scheduleDraft}
            onClose={() => setScheduleDraft(null)}
            scheduledDate={null}
            onSchedule={confirmSchedule}
            onWhenOnline={sendWhenOnline}
            kind="message"
            moving
            title={tr('dmSchedule.whenTitle', { defaultValue: 'Send when?' })}
          />
          <ScheduledMessagesDrawer
            open={showScheduled}
            onOpenChange={setShowScheduled}
            dmId={resolvedConversationId}
            peerAddress={otherUser?.address}
            peerName={displayName}
            items={scheduled.items}
            isLoading={scheduled.isLoading}
          />
        </>
      )}

      <DmPollDialog
        open={showPollDialog}
        onOpenChange={setShowPollDialog}
        conversationId={resolvedConversationId}
        onSent={scrollToBottom}
      />

      {/* DM Gated Banner */}
      {dmGateChecked && dmGated && (
        <div className="absolute inset-0 bg-zinc-900/95 backdrop-blur-sm flex items-center justify-center z-20 rounded-lg">
          <div className="text-center px-6">
            <ShieldBan className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
            <p className="text-white font-semibold text-base">
              {tr('dm.planRestricted')}
            </p>
          </div>
        </div>
      )}
      <FullscreenImageViewerLazy
        images={fullscreenImage ? [fullscreenImage] : []}
        initialIndex={0}
        isOpen={!!fullscreenImage}
        onClose={() => setFullscreenImage(null)}
        downloadable
      />

      {/* Forward message picker */}
      <ForwardMessageDialog
        open={!!forwardMessageTarget || !!bulkForward}
        onOpenChange={(open) => { if (!open) { setForwardMessageTarget(null); setBulkForward(null); } }}
        onSelect={handleForwardSelect}
        excludeConversationId={resolvedConversationId}
      />
    </div>
  );
}
