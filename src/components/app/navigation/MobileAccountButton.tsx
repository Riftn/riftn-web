import { useTranslation } from 'react-i18next';
import AddAccount from '@/components/ui/cut-icons/add-account';
import SignIn from '@/components/ui/cut-icons/sign-in';

interface MobileAccountButtonProps {
  action: 'signup' | 'signin';
  onClick: () => void;
  onPointerDown: () => void;
  tabIndex?: number;
}

export function MobileAccountButton({ action, onClick, onPointerDown, tabIndex }: MobileAccountButtonProps) {
  const { t } = useTranslation();
  const signingUp = action === 'signup';
  const label = signingUp ? t('creator.signUp') : t('copy.c189840cf7e2', { defaultValue: 'Log in' });

  return (
    <button
      type="button"
      tabIndex={tabIndex}
      aria-label={label}
      aria-haspopup="dialog"
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={`flex h-11 min-w-11 shrink-0 items-center text-white transition-opacity active:opacity-70 ${signingUp ? 'justify-start' : 'justify-end'}`}
    >
      {signingUp ? <AddAccount size={24} /> : <SignIn size={24} />}
    </button>
  );
}
