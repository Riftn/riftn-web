import { useTranslation } from 'react-i18next';
import AddAccount from '@/components/ui/cut-icons/add-account';

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
      {signingUp ? <AddAccount size={24} /> : (
        <span className="max-w-[28vw] truncate rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-neutral-950">{label}</span>
      )}
    </button>
  );
}
