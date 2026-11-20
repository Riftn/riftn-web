/**
 * Settings → Appearance → Sign-in screen: how the Riftn logo and headline look
 * on the sign-in sheet. On a phone the cards are a side-swipe carousel, and a
 * card builds and plays its look only once it is swiped into view. Kept on
 * this device (lib/login-look), so it still applies once signed out.
 */
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { LOGIN_LOOKS, setLoginLook, useLoginLook, type LoginLook } from '@/lib/login-look';
import { LoginSign } from '@/components/app/login/LoginShortsStack';
import { useOnScreen } from '@/hooks/use-on-screen';
import { LOOK_CARD_CLASS, LookCarousel, useLookCardView } from './LookCarousel';

const LABELS: Record<LoginLook, [string, string]> = {
  tube: ['settings.loginLook.tube', 'Tube TV'],
  vhs: ['settings.loginLook.vhs', 'VHS tape'],
  led: ['settings.loginLook.led', 'LED wall'],
  holo: ['settings.loginLook.holo', 'Hologram'],
  neon: ['settings.loginLook.neon', 'Neon glow'],
  '3d': ['settings.loginLook.3d', '3D'],
  flat: ['settings.loginLook.flat', 'Flat'],
};

function LoginLookCard({ look, active, label }: { look: LoginLook; active: boolean; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { seen, inView } = useLookCardView(ref);
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={active}
      data-login-look-option={look}
      onClick={() => setLoginLook(look)}
      className={cn(
        LOOK_CARD_CLASS,
        'group flex min-w-0 flex-col gap-2 rounded-2xl p-1.5 text-left transition-colors',
        active ? 'bg-white/10 ring-2 ring-white' : 'ring-1 ring-white/10 hover:bg-white/5',
        !inView && 'look-previews-paused',
      )}
    >
      <span className="login-look-preview" aria-hidden>
        {seen && (
          <span className="login-look-preview__scale">
            <LoginSign look={look} />
          </span>
        )}
      </span>
      <span className="px-1.5 pb-1 text-sm font-medium text-white">{label}</span>
    </button>
  );
}

export function LoginLookSetting() {
  const { t } = useTranslation();
  const current = useLoginLook();
  const ref = useRef<HTMLDivElement>(null);
  // Looping cards: they only play while on screen.
  const onScreen = useOnScreen(ref);
  return (
    <div data-setting-anchor="login-look" ref={ref} className={onScreen ? undefined : 'look-previews-paused'}>
      <h3 className="font-medium text-zinc-400 text-sm mb-1">{t('settings.loginLook.title', 'Sign-in screen')}</h3>
      <p className="text-zinc-500 text-xs mb-4">
        {t('settings.loginLook.desc', 'How the Riftn logo and slogan move on the sign-in screen on this device.')}
      </p>
      <LookCarousel
        label={t('settings.loginLook.title', 'Sign-in screen')}
        activeIndex={Math.max(0, LOGIN_LOOKS.indexOf(current))}
        desktopCols="sm:grid-cols-4"
      >
        {LOGIN_LOOKS.map((look) => {
          const [key, fallback] = LABELS[look];
          return <LoginLookCard key={look} look={look} active={current === look} label={t(key, fallback)} />;
        })}
      </LookCarousel>
    </div>
  );
}

export default LoginLookSetting;
