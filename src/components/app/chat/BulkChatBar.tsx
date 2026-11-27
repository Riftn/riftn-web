import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Loader2, MessageCircle, MessageCircleDashed, Reply, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { messagesKeys } from '@/hooks/use-messages';

/*
 * The bar at the foot of the chat list while chats are selected (right-click
 * a chat and Select, or hold one on a phone, then tap others). Acts on every selected chat at once:
 * mark unread (or read), delete, or send one reply to all of them.
 */

export interface BulkChatBarProps {
  count: number;
  /** The selected chats, refreshed after a reply so each shows the new line. */
  chatIds: string[];
  /** Every selected chat is already unread, so the button reads "Mark read". */
  allUnread: boolean;
  onToggleUnread: () => void;
  onToggleArchive?: () => void;
  allArchived?: boolean;
  onDelete: () => void;
  /** Resolves with how many chats the reply reached. */
  onReply: (text: string) => Promise<number>;
  onCancel: () => void;
  /** How many of the selected can be deleted (DMs; group and community chats are left, not deleted). Defaults to count. */
  deletableCount?: number;
  /** Phone layout: says "Tap" and sits above the bottom nav. */
  touch?: boolean;
  className?: string;
}

const BTN = 'flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-[13px] font-semibold text-zinc-100 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0';

export function BulkChatBar({ count, chatIds, allUnread, onToggleUnread, onToggleArchive, allArchived, onDelete, onReply, onCancel, deletableCount = count, touch = false, className }: BulkChatBarProps) {
  const { t } = useTranslation();
  const [replyOpen, setReplyOpen] = useState(false);
  const none = count === 0;
  const queryClient = useQueryClient();
  const reply = async (text: string) => {
    const ids = chatIds;
    const sent = await onReply(text);
    if (sent > 0) {
      for (const id of ids) queryClient.invalidateQueries({ queryKey: messagesKeys.messages(id) });
      queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
    }
    return sent;
  };

  return (
    <>
      <div
        data-chat-bulk-bar
        role="toolbar"
        aria-label={t('chatBulk.toolbar', 'Selected chats')}
        className={cn('mx-2 mb-2 mt-1 shrink-0 rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-xl', className)}
      >
        <div className="flex items-center gap-1 px-1 pb-1">
          <span data-chat-bulk-count className="mr-auto pl-1 text-[13px] font-semibold tabular-nums text-white">
            {none
              ? touch
                ? t('chatBulk.pickTouch', { defaultValue: 'Tap chats to select them' })
                : t('chatBulk.pick', { defaultValue: 'Click chats to select them' })
              : t('chatBulk.selected', { defaultValue: '{{count}} selected', count })}
          </span>
          <button type="button" data-chat-bulk-cancel onClick={onCancel} className={cn(BTN, 'h-8 px-2 text-zinc-400')} aria-label={t('chatBulk.cancel', 'Cancel')} title={t('chatBulk.cancel', 'Cancel')}>
            <X />
          </button>
        </div>
        <div className={cn('grid gap-1', onToggleArchive ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
          <button type="button" data-chat-bulk-unread disabled={none} onClick={onToggleUnread} className={BTN}>
            {allUnread ? <MessageCircle /> : <MessageCircleDashed />}
            {allUnread ? t('chatBulk.read', 'Mark read') : t('chatBulk.unread', 'Mark unread')}
          </button>
          {onToggleArchive && (
            <button type="button" data-chat-bulk-archive disabled={none} onClick={onToggleArchive} className={BTN}>
              <Archive />{allArchived ? t('chatMenu.unarchive', 'Unarchive') : t('chatMenu.archive', 'Archive')}
            </button>
          )}
          <button type="button" data-chat-bulk-reply disabled={none} onClick={() => setReplyOpen(true)} className={BTN}>
            <Reply />{t('chatBulk.reply', 'Reply')}
          </button>
          <button type="button" data-chat-bulk-delete disabled={none || deletableCount === 0} onClick={onDelete} className={cn(BTN, 'text-red-400 hover:text-red-300')}>
            <Trash2 />{t('chatBulk.delete', 'Delete')}
          </button>
        </div>
      </div>
      <BulkReplyDialog open={replyOpen} onOpenChange={setReplyOpen} count={count} onSend={reply} />
    </>
  );
}

function BulkReplyDialog({ open, onOpenChange, count, onSend }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onSend: (text: string) => Promise<number>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) setTimeout(() => boxRef.current?.focus(), 30); }, [open]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const sent = await onSend(body);
      if (sent > 0) {
        setText('');
        onOpenChange(false);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }}>
      <DialogContent data-chat-bulk-reply-dialog overlayClassName="z-[155]" className="z-[160] max-w-md border-white/10 bg-zinc-900 text-white">
        <DialogHeader>
          <DialogTitle>{t('chatBulk.replyTitle', { defaultValue: 'Reply to {{count}} chats', count })}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t('chatBulk.replyHint', 'Each person gets this as a normal message in their own chat.')}
          </DialogDescription>
        </DialogHeader>
        <textarea
          ref={boxRef}
          data-chat-bulk-reply-input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
          }}
          rows={4}
          maxLength={4000}
          placeholder={t('chatBulk.replyPlaceholder', 'Write a message…')}
          className="w-full resize-none rounded-xl border border-white/10 bg-black/40 p-3 text-[15px] text-white outline-none placeholder:text-zinc-500 focus:border-white/30"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onOpenChange(false)} disabled={sending} className="h-10 rounded-xl px-4 text-sm font-semibold text-zinc-300 hover:bg-white/10">
            {t('chatBulk.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            data-chat-bulk-reply-send
            onClick={() => void send()}
            disabled={!text.trim() || sending}
            className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-40"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('chatBulk.sendAll', { defaultValue: 'Send to {{count}}', count })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
