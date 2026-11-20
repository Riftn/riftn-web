/**
 * Settings → Appearance → After you sign in: what plays between the sign-in
 * sheet and the page (SignInHandoff): Trace, Tune in, the Rift, Deck or Glass drop.
 * Each card plays its arrival on a loop with your own picture, only while the
 * cards are on screen. Kept on this device (lib/arrival-look).
 */
import { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { AuthContext } from '@/contexts/AuthContext';
import { buildAvatarUrl } from '@/lib/media-url';
import { ARRIVAL_INTRO_MS, ARRIVAL_LOOKS, setArrivalLook, useArrivalLook, type ArrivalLook } from '@/lib/arrival-look';
import { ArrivalMarks, isConceptLook } from '@/components/app/login/SignInHandoff';
import { useOnScreen } from '@/hooks/use-on-screen';
import { LOOK_CARD_CLASS, LookCarousel, useLookCardView } from './LookCarousel';
import '@/components/app/login/sign-in-handoff.css';

const LABELS: Record<ArrivalLook, [string, string]> = {
  trace: ['settings.arrivalLook.trace', 'Trace'],
  tune: ['settings.arrivalLook.tune', 'Tune in'],
  rift: ['settings.arrivalLook.rift', 'Rift'],
  deck: ['settings.arrivalLook.deck', 'Deck'],
  glass: ['settings.arrivalLook.glass', 'Glass drop'],
};

/** How long a preview shows the picture before it plays again. */
const SHOW_MS = 1600;
const WAIT_MS = 900;
const CONCEPT_WAIT_MS = 1500;

function ArrivalPreview({ look, picture, initial, playing }: { look: ArrivalLook; picture?: string; initial: string; playing: boolean }) {
  const [round, setRound] = useState(0);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!playing) return;
    // The drawn arrivals get a little longer on their loop before they open.
    const wait = ARRIVAL_INTRO_MS[look] + (isConceptLook(look) ? CONCEPT_WAIT_MS : WAIT_MS);
    const open = window.setTimeout(() => setOpened(true), wait);
    const again = window.setTimeout(() => { setOpened(false); setRound((r) => r + 1); }, wait + SHOW_MS);
    return () => { window.clearTimeout(open); window.clearTimeout(again); };
  }, [playing, look, round]);
  return (
    <span className="arrival-look-preview" aria-hidden>
      <span
        key={round}
        className="signin-rift signin-rift--inline arrival-look-preview__scale"
        data-arrival={look}
        data-phase={opened ? 'open' : 'waiting'}
        data-opened={opened ? '' : undefined}
      >
        <span className="signin-rift__stage">
          <ArrivalMarks look={look} opened={opened} picture={picture} initial={initial} keepPicture playing={playing} />
          {!isConceptLook(look) && (
            <span className="signin-rift__frame">
              {picture
                ? <img src={picture} alt="" draggable={false} data-ready="" />
                : <span className="signin-rift__initial">{initial}</span>}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

function ArrivalLookCard({ look, active, label, picture, initial, pageOnScreen }: {
  look: ArrivalLook; active: boolean; label: string; picture?: string; initial: string; pageOnScreen: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { seen, inView } = useLookCardView(ref);
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={active}
      data-arrival-look-option={look}
      onClick={() => setArrivalLook(look)}
      className={cn(
        LOOK_CARD_CLASS,
        'group flex min-w-0 flex-col gap-2 rounded-2xl p-1.5 text-left transition-colors',
        active ? 'bg-white/10 ring-2 ring-white' : 'ring-1 ring-white/10 hover:bg-white/5',
        !inView && 'look-previews-paused',
      )}
    >
      {seen
        ? <ArrivalPreview look={look} picture={picture} initial={initial} playing={pageOnScreen && inView} />
        : <span className="arrival-look-preview" aria-hidden />}
      <span className="px-1.5 pb-1 text-sm font-medium text-white">{label}</span>
    </button>
  );
}

export function ArrivalLookSetting() {
  const { t } = useTranslation();
  const current = useArrivalLook();
  // Read softly: the state gallery shows this card with no account around it.
  const user = useContext(AuthContext)?.user;
  const ref = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(ref);
  const address = user?.address || user?.wallet_address || '';
  const picture = address && user?.avatarImageUrl ? buildAvatarUrl(address, user.avatarImageUrl, 240) : undefined;
  const initial = (user?.displayName || user?.display_name || user?.username || 'R').trim().charAt(0).toUpperCase();
  return (
    <div data-setting-anchor="arrival-look" ref={ref} className={onScreen ? undefined : 'look-previews-paused'}>
      <h3 className="font-medium text-zinc-400 text-sm mb-1">{t('settings.arrivalLook.title', 'After you sign in')}</h3>
      <p className="text-zinc-500 text-xs mb-4">
        {t('settings.arrivalLook.desc', 'What plays while your account loads, before your picture lands on the page. On this device.')}
      </p>
      <LookCarousel
        label={t('settings.arrivalLook.title', 'After you sign in')}
        activeIndex={Math.max(0, ARRIVAL_LOOKS.indexOf(current))}
        desktopCols="sm:grid-cols-5"
      >
        {ARRIVAL_LOOKS.map((look) => {
          const [key, fallback] = LABELS[look];
          return (
            <ArrivalLookCard
              key={look}
              look={look}
              active={current === look}
              label={t(key, fallback)}
              picture={picture}
              initial={initial}
              pageOnScreen={onScreen}
            />
          );
        })}
      </LookCarousel>
    </div>
  );
}

export default ArrivalLookSetting;
