/**
 * Delete a chat message (or several picked ones), Telegram style:
 *
 *   - One-to-one chat: any message, yours or theirs, can go "for me" or "for
 *     me and {name}".
 *   - Groups: your own message "for me" or "for everyone"; anyone else's only
 *     "for me" (it leaves your chat and stays in theirs).
 *
 * Same frosted card and rows as the message menu, in every theme, with no red.
 * "Remember my choice" saves the pick (lib/chat-delete-choice) so the pop-up
 * is skipped next time; Settings → Appearance changes it back.
 *
 * One dialog for DMs, group DMs and group/community chats, so the wording and
 * the order of the rows never drift between them.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, EyeOff, Trash2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { setChatDeleteChoice, useChatDeleteChoice } from '@/lib/chat-delete-choice';

export type DeleteScope = 'me' | 'everyone';

export interface DeleteMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many messages the dialog is about (1 for the message menu). */
  count?: number;
  /** True when the messages can go for everyone too (yours, or any in a one-to-one chat). */
  canDeleteForEveryone: boolean;
  /** One-to-one chat: say "for both of you" instead of "for everyone". */
  oneToOne?: boolean;
  /** The other person's name in a one-to-one chat. */
  peerName?: string | null;
  onDelete: (scope: DeleteScope) => void;
}

// The message menu's row (MessageMenu), so the two read as one family.
const ROW = 'group flex w-full items-center gap-3 rounded-[10px] px-3 py-[9px] text-left text-[14px] font-medium outline-none';
const ICON = 'grid h-[18px] w-[18px] shrink-0 place-items-center opacity-85 [&>svg]:h-[18px] [&>svg]:w-[18px]';

export function DeleteMessageDialog({
  open,
  onOpenChange,
  count = 1,
  canDeleteForEveryone,
  oneToOne = false,
  peerName,
  onDelete,
}: DeleteMessageDialogProps) {
  const { t } = useTranslation();
  const saved = useChatDeleteChoice();
  const [remember, setRemember] = useState(false);

  // A saved choice skips the pop-up: "for everyone" when it's allowed, else "for me".
  const latest = useRef({ onOpenChange, onDelete, canDeleteForEveryone });
  latest.current = { onOpenChange, onDelete, canDeleteForEveryone };
  useEffect(() => {
    if (!open || saved === 'ask') return;
    const l = latest.current;
    l.onOpenChange(false);
    l.onDelete(saved === 'everyone' && l.canDeleteForEveryone ? 'everyone' : 'me');
  }, [open, saved]);
  useEffect(() => { if (open) setRemember(false); }, [open]);

  const many = count > 1;
  const title = many
    ? t('msgDelete.titleMany', { defaultValue: 'Delete {{count}} messages?', count })
    : t('msgDelete.title', { defaultValue: 'Delete message?' });
  const body = canDeleteForEveryone
    ? (oneToOne
      ? (many
        ? t('msgDelete.bodyOwnBothMany', { defaultValue: 'Remove them from your chat only, or for both of you.' })
        : t('msgDelete.bodyOwnBoth', { defaultValue: 'Remove it from your chat only, or for both of you.' }))
      : (many
        ? t('msgDelete.bodyOwnMany', { defaultValue: 'Remove them from your chat only, or for everyone.' })
        : t('msgDelete.bodyOwn', { defaultValue: 'Remove it from your chat only, or for everyone.' })))
    : (many
      ? t('msgDelete.bodyOthersMany', { defaultValue: 'They will be removed from your chat only. Others in the chat will still see them.' })
      : t('msgDelete.bodyOthers', { defaultValue: 'It will be removed from your chat only. The other person will still see it.' }));
  const everyoneLabel = oneToOne
    ? (peerName
      ? t('msgDelete.forMeAndName', { defaultValue: 'Delete for me and {{name}}', name: peerName })
      : t('msgDelete.forBoth', { defaultValue: 'Delete for both of us' }))
    : t('msgDelete.forEveryone', { defaultValue: 'Delete for everyone' });

  const pick = (scope: DeleteScope) => {
    if (remember) setChatDeleteChoice(scope);
    onOpenChange(false);
    onDelete(scope);
  };

  return (
    <AlertDialog open={open && saved === 'ask'} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-msg-delete-dialog
        data-msg-menu
        data-msg-menu-surface
        className="max-w-[340px] gap-0 rounded-[20px] p-1.5 shadow-none"
      >
        <AlertDialogHeader className="space-y-1 px-3 pb-3 pt-3 text-left">
          <AlertDialogTitle className="text-[16px] font-semibold leading-snug" style={{ color: 'var(--stage-ink, #f4f4f5)' }}>{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] leading-snug" style={{ color: 'var(--stage-muted, #9a9aa2)' }}>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col">
          {canDeleteForEveryone && (
            <button type="button" data-msg-menu-item data-msg-delete-everyone onClick={() => pick('everyone')} className={ROW}>
              <span className={ICON}><Trash2 /></span>
              <span className="min-w-0 flex-1 truncate">{everyoneLabel}</span>
            </button>
          )}
          <button type="button" data-msg-menu-item data-msg-delete-me onClick={() => pick('me')} className={ROW}>
            <span className={ICON}>{canDeleteForEveryone ? <EyeOff /> : <Trash2 />}</span>
            <span className="min-w-0 flex-1 truncate">{t('msgDelete.forMe', { defaultValue: 'Delete for me' })}</span>
          </button>
          <div className="mx-3 my-1 h-px" data-msg-menu-rule />
          <button
            type="button"
            role="checkbox"
            aria-checked={remember}
            data-msg-menu-item
            data-msg-delete-remember
            onClick={() => setRemember((v) => !v)}
            className={ROW}
          >
            <span
              className={cn('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] transition-colors [&>svg]:h-3 [&>svg]:w-3')}
              style={remember
                ? { background: 'var(--stage-accent, #fff)', color: 'var(--stage-on-accent, #000)' }
                : { boxShadow: 'inset 0 0 0 1.5px var(--stage-muted, #9a9aa2)' }}
            >
              {remember && <Check strokeWidth={3.5} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{t('msgDelete.remember', { defaultValue: 'Remember my choice' })}</span>
              {remember && (
                <span className="mt-0.5 block text-[12px] font-normal" style={{ color: 'var(--stage-muted, #9a9aa2)' }}>
                  {t('msgDelete.rememberHint', { defaultValue: 'Change it any time in Settings' })}
                </span>
              )}
            </span>
          </button>
          <button type="button" data-msg-menu-item data-msg-delete-cancel onClick={() => onOpenChange(false)} className={ROW}>
            <span className={ICON}><X /></span>
            <span className="min-w-0 flex-1 truncate">{t('common.cancel', { defaultValue: 'Cancel' })}</span>
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
