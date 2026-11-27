/**
 * MessageRequestBar
 * =================
 * Shown above a thread that is still a message request: a first message from
 * someone you don't follow. Accept moves the chat to your inbox (so does
 * replying or following them); Delete and Block get rid of it.
 */
import { useTranslation } from 'react-i18next';
import { ChevronLeft, MailQuestion } from 'lucide-react';
import { UnreadCountChip } from './UnreadCountChip';
import { useAcceptMessageRequest, useConversations } from '@/hooks/use-messages';

interface MessageRequestBarProps {
  conversationId: string;
  name: string;
  onDelete: () => void;
  onBlock: () => void;
}

export function MessageRequestBarView({ name, onAccept, onDelete, onBlock, busy }: {
  name: string; onAccept: () => void; onDelete: () => void; onBlock: () => void; busy?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      data-message-request-bar
      data-kit-section
      className="mx-3 mt-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-3"
    >
      <p className="text-[13px] leading-snug text-zinc-300">
        {t('dmRequests.banner', {
          defaultValue: "You don't follow {{name}}. Accept to move this chat to your inbox, or just reply.",
          name,
        })}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" data-kit-button="primary" data-request-accept disabled={busy} onClick={onAccept}>
          {t('dmRequests.accept', { defaultValue: 'Accept' })}
        </button>
        <button type="button" data-kit-button="quiet" data-request-delete onClick={onDelete}>
          {t('dmRequests.delete', { defaultValue: 'Delete' })}
        </button>
        <button type="button" data-kit-button="quiet" data-request-block onClick={onBlock}>
          {t('dmRequests.block', { defaultValue: 'Block' })}
        </button>
      </div>
    </div>
  );
}

export function MessageRequestBar({ conversationId, name, onDelete, onBlock }: MessageRequestBarProps) {
  const { conversations } = useConversations();
  const accept = useAcceptMessageRequest();
  // Read the flag off the live list, so the bar goes the moment you accept,
  // reply or follow, whichever copy of the chat this thread was opened with.
  const live = conversations.find((c) => c.id === conversationId);
  if (!live?.isRequest) return null;
  return (
    <MessageRequestBarView
      name={name}
      busy={accept.isPending}
      onAccept={() => accept.mutate(conversationId)}
      onDelete={onDelete}
      onBlock={onBlock}
    />
  );
}

/** The row in the chat list that opens Requests. */
export function MessageRequestsRow({ count, unread, onClick }: { count: number; unread: number; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-chat-requests-open
      data-chat-list-row
      onClick={onClick}
      className="flex w-full items-center gap-3 border-t border-white/[0.07] p-4 text-left hover:bg-white/[0.04] transition-colors"
    >
      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.07]">
        <MailQuestion className="h-6 w-6 text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-white">{t('dmRequests.title', { defaultValue: 'Requests' })}</span>
        <span className="block truncate text-sm text-zinc-500">
          {t('dmRequests.rowHint', { defaultValue: "{{n}} from people you don't follow", n: count })}
        </span>
      </span>
      {unread > 0 && <UnreadCountChip count={unread} className="ml-0.5" />}
    </button>
  );
}

/** Top of the Requests list: the way back to the inbox, and what this list is. */
export function MessageRequestsHeader({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <button
        type="button"
        data-chat-requests-back
        onClick={onBack}
        className="flex w-full items-center gap-2 border-t border-white/[0.07] px-4 py-3 text-left text-[15px] font-semibold text-white hover:bg-white/[0.04]"
      >
        <ChevronLeft className="h-4 w-4 text-zinc-400" />
        {t('dmRequests.title', { defaultValue: 'Requests' })}
      </button>
      <p data-chat-requests-hint className="px-4 pb-3 text-[13px] leading-snug text-zinc-500">
        {t('dmRequests.hint', { defaultValue: "Messages from people you don't follow. Accept one, reply or follow them and the chat moves to your inbox." })}
      </p>
    </>
  );
}
