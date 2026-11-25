import { lazy, Suspense, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const AccountSignOutDialog = lazy(() => import('./AccountSignOutDialog'));

export function useAccountSignOut({
  onStart,
  onComplete,
}: { onStart?: () => void; onComplete?: () => void } = {}) {
  const { t } = useTranslation();
  const { disconnect } = useAuth();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const trigger = useRef<HTMLElement>();

  const run = async (allAccounts: boolean) => {
    setOpen(false);
    onStart?.();
    await disconnect(allAccounts ? { allAccounts: true } : { forgetProfile: true });
    onComplete?.();
  };

  const perform = async (allAccounts?: boolean) => {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    try {
      if (allAccounts === undefined) {
        // Keep the wallet registry out of the eager navigation bundle.
        const { currentProfileId, listProfiles } = await import('@/lib/profiles');
        const activeId = currentProfileId();
        if (listProfiles().some(profile => profile.id !== activeId)) {
          setOpen(true);
          return;
        }
      }
      await run(allAccounts === true);
    } catch {
      toast.error(t('settings.logoutFailed'));
    } finally {
      locked.current = false;
      setPending(false);
    }
  };

  return {
    pending,
    requestSignOut: () => {
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      void perform();
    },
    signOutDialog: (
      <Suspense fallback={null}>
        {(open || trigger.current) && (
          <AccountSignOutDialog
            open={open}
            onOpenChange={setOpen}
            onChoose={choice => void perform(choice)}
            restoreFocus={() => trigger.current?.focus()}
          />
        )}
      </Suspense>
    ),
  };
}
