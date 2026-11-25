import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AccountSignOutDialog({
  open,
  onOpenChange,
  onChoose,
  restoreFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (allAccounts: boolean) => void;
  restoreFocus: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="w-[calc(100%-2rem)] max-w-sm"
        onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(); }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.logOut')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.logOutScopeDescription', 'Choose which accounts to log out of on this device.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Button type="button" variant="outline" onClick={() => onChoose(false)}>
            {t('settings.logOutThisAccount', 'Log out of this account')}
          </Button>
          <Button type="button" variant="destructive" onClick={() => onChoose(true)}>
            {t('settings.logOutAllAccounts', 'Log out of all accounts')}
          </Button>
          <AlertDialogCancel className="mt-0">{t('common.cancel')}</AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
