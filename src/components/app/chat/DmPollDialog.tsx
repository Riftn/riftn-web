import { useTranslation as _useCopy } from 'react-i18next';
/**
 * DmPollDialog
 * ============
 * Glass drawer for sending a poll into a chat. Same editor as a post's poll;
 * the poll lands in the thread as its own message and the chat's members vote.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { PollEditor } from '@/features/post/components/PollEditor';
import type { PollData } from '@/features/post/types';
import { useCreatePoll } from '@/hooks/use-polls';
import { messagesKeys } from '@/hooks/use-messages';

interface DmPollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onSent?: () => void;
}

const blankPoll = (): PollData => ({
  question: '',
  options: [{ id: '1', text: '' }, { id: '2', text: '' }],
  duration: 24,
  isMultipleChoice: false,
});

export function DmPollDialog({ open, onOpenChange, conversationId, onSent }: DmPollDialogProps) {
  const { t: _copy } = _useCopy();
  const queryClient = useQueryClient();
  const createPoll = useCreatePoll();
  const [poll, setPoll] = useState<PollData>(blankPoll);

  const options = poll.options.map(o => o.text.trim()).filter(Boolean);
  const canCreate = poll.question.trim().length > 0 && options.length >= 2 && !createPoll.isPending;

  const submit = () => {
    if (!canCreate) return;
    createPoll.mutate(
      {
        conversationId,
        question: poll.question.trim(),
        options,
        expiresAt: new Date(Date.now() + poll.duration * 3600 * 1000).toISOString(),
        isMultipleChoice: !!poll.isMultipleChoice,
      },
      {
        onSuccess: () => {
          // The other side gets it live; the sender's thread picks it up here.
          queryClient.invalidateQueries({ queryKey: messagesKeys.messages(conversationId) });
          queryClient.invalidateQueries({ queryKey: messagesKeys.head(conversationId) });
          queryClient.invalidateQueries({ queryKey: messagesKeys.conversations() });
          setPoll(blankPoll());
          onOpenChange(false);
          onSent?.();
        },
      },
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-drawer-form data-dm-poll-drawer column glass hideClose>
        <DrawerClose aria-label={_copy("copy.7d9eb7acb13e", { defaultValue: "Close" })}
          className="drawer-close-control absolute right-3 top-3 z-10 inline-flex size-11 items-center justify-center rounded-xl">
          <X className="size-5" aria-hidden />
        </DrawerClose>
        <DrawerHeader className="shrink-0 px-4 pb-3 pr-16 pt-5 text-left">
          <DrawerTitle>{_copy("copy.b2b9c2e81c4c", { defaultValue: "Create Poll" })}</DrawerTitle>
        </DrawerHeader>
        <div data-drawer-scroll className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] [touch-action:pan-y]">
          <PollEditor poll={poll} onChange={setPoll} onRemove={() => onOpenChange(false)} />
          <button
            type="button"
            disabled={!canCreate}
            onClick={submit}
            className="drawer-action mt-4 flex w-full items-center justify-center rounded-xl px-4 text-sm font-semibold"
          >
            {createPoll.isPending ? <Loader2 className="size-4 animate-spin" /> : _copy("copy.4759498ac2a7", { defaultValue: "Create" })}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
