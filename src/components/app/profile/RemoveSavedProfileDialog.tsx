import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import { removeSavedProfile, type StoredProfile } from '@/lib/profiles';

export function RemoveSavedProfileDialog({ profile, onClose }: {
  profile: StoredProfile | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const name = profile?.username ? `@${profile.username}` : profile?.name || profile?.address || '';

  const remove = () => {
    if (!profile) return;
    try {
      removeSavedProfile(profile.address);
    } catch {
      toast.error(t('settings.profileRemoveFailed', 'Could not remove the saved account. Try again.'));
    }
  };

  return (
    <AlertDialog open={!!profile} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent className="z-[160]" overlayClassName="z-[160]">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.profileRemoveNamed', 'Remove {{name}}', { name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.profileRemoveDescription', 'This removes the saved sign-in from this device. You can add the account again by signing in.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={remove}>{t('settings.profileRemoveAction', 'Remove')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
