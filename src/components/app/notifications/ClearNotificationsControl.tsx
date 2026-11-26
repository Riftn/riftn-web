import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import Trash from '@/components/ui/cut-icons/delete';
import { customNotificationKeys } from '@/hooks/use-custom-notifications';
import { notificationKeys } from '@/hooks/use-notifications';
import { clearAllNotifications } from '@/lib/api/dehub/notifications';

type Confirmation = { wallet: string; through: number };

export function ClearNotificationsControl({ wallet, disabled }: { wallet: string; disabled: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const submitting = useRef(false);
  const mutation = useMutation({
    mutationFn: ({ wallet, through }: Confirmation) => clearAllNotifications(wallet, through),
    onSuccess: () => {
      for (const queryKey of [notificationKeys.all, customNotificationKeys.all]) {
        // Start pagination again. A fetch begun before the write may still
        // contain deleted rows or have offsets from the old history.
        void queryClient.resetQueries({ queryKey });
      }
      setConfirmation(null);
      toast.success(t('notifications.clearAllSuccess'));
    },
    onError: () => {
      for (const queryKey of [notificationKeys.all, customNotificationKeys.all]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onSettled: () => { submitting.current = false; },
  });
  const pending = mutation.isPending;

  return (
    <AlertDialog
      open={confirmation?.wallet === wallet}
      onOpenChange={(open) => {
        if (submitting.current) return;
        if (open) mutation.reset();
        setConfirmation(open ? { wallet, through: Date.now() } : null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-11 w-full justify-start whitespace-normal px-4 py-3"
          disabled={disabled || pending}
        >
          <Trash aria-hidden="true" />
          <span className="text-left">
            <span className="block text-foreground">{t('notifications.clearAll')}</span>
            <span className="block text-muted-foreground">{t('notifications.removeHistory')}</span>
          </span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        overlayClassName="z-[110]"
        className="z-[111] w-[calc(100%-2rem)] max-w-sm border-border bg-popover text-popover-foreground"
        onEscapeKeyDown={(event) => { if (submitting.current) event.preventDefault(); }}
      >
        <AlertDialogHeader className="text-start">
          <AlertDialogTitle>{t('notifications.clearAllTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('notifications.clearAllDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && <p role="alert" className="text-sm text-popover-foreground">{t('notifications.clearAllError')}</p>}
        <AlertDialogFooter className="flex-row flex-wrap justify-end gap-2 sm:space-x-0">
          <AlertDialogCancel asChild className="mt-0">
            <Button type="button" variant="outline" size="lg" className="px-4" disabled={pending}>
              {t('common.cancel')}
            </Button>
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="px-4"
            loading={pending}
            onClick={() => {
              if (submitting.current || !confirmation || confirmation.wallet !== wallet) return;
              submitting.current = true;
              mutation.mutate(confirmation);
            }}
          >
            <Trash className={pending ? 'hidden' : undefined} aria-hidden="true" />
            {t('notifications.clearAllAction')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
