/**
 * Delete a Public Chat line: "Delete for everyone" (your own line, or any line
 * when you moderate the room) or "Delete for me" (only your view).
 * Same dialog, wording and saved choice as DMs and community chats.
 */
import { useCallback, useState } from 'react';
import { DeleteMessageDialog, type DeleteScope } from './DeleteMessageDialog';
import { hideLineForMe } from '@/lib/public-chat-hidden';

export function usePublicChatDelete({
  account,
  canDeleteAny,
  deleteForEveryone,
}: {
  account: string | null | undefined;
  /** Moderators may take any line down for everyone. */
  canDeleteAny: boolean;
  deleteForEveryone: (messageId: string) => void | Promise<void>;
}) {
  const [target, setTarget] = useState<{ id: string; mine: boolean } | null>(null);

  const requestDelete = useCallback((messageId: string, mine: boolean) => {
    if (messageId.startsWith('temp-')) return;
    setTarget({ id: messageId, mine });
  }, []);

  const onDelete = useCallback((scope: DeleteScope) => {
    if (!target) return;
    if (scope === 'everyone' && (target.mine || canDeleteAny)) void deleteForEveryone(target.id);
    else hideLineForMe(account, target.id);
    setTarget(null);
  }, [target, canDeleteAny, deleteForEveryone, account]);

  const dialog = (
    <DeleteMessageDialog
      open={!!target}
      onOpenChange={(open) => { if (!open) setTarget(null); }}
      canDeleteForEveryone={!!target && (target.mine || canDeleteAny)}
      onDelete={onDelete}
    />
  );

  return { requestDelete, dialog };
}
