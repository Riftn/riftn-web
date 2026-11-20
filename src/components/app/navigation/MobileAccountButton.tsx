import { useTranslation } from 'react-i18next';
import AddAccount from '@/components/ui/cut-icons/add-account';
import { createCutIcon } from '@/components/ui/cut-icons/create-cut-icon';

const SignIn = createCutIcon('CutHeaderSignIn', () => (
  <g fill="currentColor">
    <path d="M14 4H21.6C26.6 4 29.5 7.05 29.5 11.9V28H14V23H14.94Q16.4 23 16.4 24.46V25.6H27.1V11.9C27.1 8.49 25.17 6.4 21.6 6.4H16.4V8.75H15.46Q14 8.75 14 7.29Z" />
    <g transform="translate(-9.4 0)">
      <path d="M13.3920 17.2000L28.0000 17.2000L28.0000 16.1920Q28.0000 14.8000 26.6080 14.8000L12.0000 14.8000L12.0000 15.8080Q12.0000 17.2000 13.3920 17.2000Z" />
      <path d="M23.1358 12.8328L26.3029 16.0000L22.1515 20.1515L22.8642 20.8642Q23.8485 21.8485 24.8328 20.8642L29.6971 16.0000L23.8485 10.1515L23.1358 10.8642Q22.1515 11.8485 23.1358 12.8328Z" />
    </g>
  </g>
));

interface MobileAccountButtonProps {
  action: 'signup' | 'signin';
  onClick: () => void;
  onPointerDown: () => void;
  tabIndex?: number;
}

export function MobileAccountButton({ action, onClick, onPointerDown, tabIndex }: MobileAccountButtonProps) {
  const { t } = useTranslation();
  const signingUp = action === 'signup';
  const Glyph = signingUp ? AddAccount : SignIn;

  return (
    <button
      type="button"
      tabIndex={tabIndex}
      aria-label={signingUp ? t('creator.signUp') : t('copy.bfd402b2f6f3')}
      aria-haspopup="dialog"
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={`flex h-11 w-11 shrink-0 items-center text-foreground transition-opacity active:opacity-70 ${signingUp ? 'justify-start' : 'justify-end'}`}
    >
      <Glyph size={24} />
    </button>
  );
}
