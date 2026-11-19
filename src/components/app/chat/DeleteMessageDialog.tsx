/**
 * Delete a chat message (or several picked ones), Telegram style:
 *
 *   - Your own message: "Delete for everyone" or "Delete for me".
 *   - Anyone else's: only "Delete for me". It leaves your chat and stays in
 *     theirs.
 *
 * One dialog for DMs, group DMs and group/community chats, so the wording and
 * the order of the buttons never drift between them.
 */
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export type DeleteScope = 'me' | 'everyone';

export interface DeleteMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many messages the dialog is about (1 for the message menu). */
  count?: number;
  /** True when every message is yours, so it can go for everyone too. */
  canDeleteForEveryone: boolean;
  /** One-to-one chat: say "for both of you" instead of "for everyone". */
  oneToOne?: boolean;
  /** The other person's name in a one-to-one chat. */
  peerName?: string | null;
  onDelete: (scope: DeleteScope) => void;
}

// White/zinc on a near-solid black card: the themes repaint these for light.
const DANGER = 'bg-red-500/15 text-red-400 hover:bg-red-500/25';
const NEUTRAL = 'bg-white/[0.08] text-white hover:bg-white/[0.12]';
const BTN = 'flex h-11 w-full items-center justify-center rounded-xl px-4 text-[15px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

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
    onOpenChange(false);
    onDelete(scope);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-msg-delete-dialog
        className="max-w-[360px] gap-5 rounded-2xl border-white/10 p-5 shadow-2xl"
      >
        <AlertDialogHeader className="space-y-1.5 text-left">
          <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          {canDeleteForEveryone && (
            <button
              type="button"
              data-msg-delete-everyone
              onClick={() => pick('everyone')}
              className={cn(BTN, DANGER)}
            >
              {everyoneLabel}
            </button>
          )}
          <button
            type="button"
            data-msg-delete-me
            onClick={() => pick('me')}
            className={cn(BTN, canDeleteForEveryone ? NEUTRAL : DANGER)}
          >
            {t('msgDelete.forMe', { defaultValue: 'Delete for me' })}
          </button>
          <button
            type="button"
            data-msg-delete-cancel
            onClick={() => onOpenChange(false)}
            className={cn(BTN, 'text-zinc-400 hover:bg-white/[0.06] hover:text-white')}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
