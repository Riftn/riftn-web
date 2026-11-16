/**
 * SignInHandoff
 * =============
 * The quiet beat between the login sheet and the signed-in page.
 *
 * While the sheet waits for the session it shows no words and no loader: the
 * sheet dims (the veil lives in LoginModal) and an empty picture frame, in the
 * shape of a profile picture, breathes in the middle. When the account lands
 * its picture and name fill the frame, the sheet leaves, and the picture
 * travels to where the account's picture sits on the page underneath.
 *
 * Rendered in a portal above the sheet and never takes a pointer event, so the
 * page is usable the moment the sheet is gone.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useSignInSheetState } from '@/lib/sign-in-handoff';
import { buildAvatarUrl } from '@/lib/media-url';
import './sign-in-handoff.css';

type Phase = 'idle' | 'waiting' | 'landing' | 'flying' | 'leaving';

/** Long enough to recognise the picture, short enough not to feel like a wait. */
const HOLD_MS = 650;
const FLY_MS = 520;
const LEAVE_MS = 240;
/** The sheet can close a commit before the account is in context. */
const ACCOUNT_GRACE_MS = 600;
const FRAME_PX = 120;

/** Where the signed-in account's own picture sits on the page, if it is on screen. */
function findOwnPicture(): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestArea = 0;
  for (const node of document.querySelectorAll<HTMLElement>('[data-own-avatar]')) {
    const r = node.getBoundingClientRect();
    if (r.width < 16 || r.height < 16) continue;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    // The profile page's picture wins over the small one in the menu.
    if (r.width * r.height > bestArea) { best = node; bestArea = r.width * r.height; }
  }
  return best;
}

export function SignInHandoff() {
  const sheet = useSignInSheetState();
  const { isAuthenticated, user, requiresUsername } = useAuth();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [flight, setFlight] = useState<CSSProperties | undefined>(undefined);
  const [pictureReady, setPictureReady] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  // Signed in before the sheet opened means "add a profile" or a wallet
  // unlock, neither of which is an arrival.
  const signedInAtOpen = useRef(false);
  const prevSheet = useRef(sheet);
  const sheetClosedAt = useRef(0);

  const signedIn = isAuthenticated && !!user && !requiresUsername;
  const address = user?.address || user?.wallet_address || '';
  const picture = signedIn && address && user?.avatarImageUrl
    ? buildAvatarUrl(address, user.avatarImageUrl, FRAME_PX * 2)
    : undefined;
  const name = signedIn ? (user?.displayName || user?.display_name || user?.username || '') : '';

  // Follow the sheet.
  useLayoutEffect(() => {
    const was = prevSheet.current;
    prevSheet.current = sheet;
    if (was === 'closed' && sheet !== 'closed') signedInAtOpen.current = signedIn;
    if (sheet === 'waiting') {
      setFlight(undefined);
      setPhase((p) => (p === 'landing' || p === 'flying' ? p : 'waiting'));
    } else if (sheet === 'open') {
      // Another step took over (wallet password, sign-in code) or the attempt
      // fell back to the options.
      setPhase((p) => (p === 'waiting' ? 'leaving' : p));
    } else if (was !== 'closed') {
      sheetClosedAt.current = Date.now();
    }
    // `signedIn` is read, not followed: only the sheet moving matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  // The sheet has gone: land the picture if an account arrived, else just go.
  useEffect(() => {
    if (sheet !== 'closed' || !sheetClosedAt.current) return;
    if (phase === 'landing' || phase === 'flying') return;
    if (signedIn && !signedInAtOpen.current) {
      sheetClosedAt.current = 0;
      setPhase(picture ? 'landing' : 'leaving');
      return;
    }
    if (phase !== 'waiting') { sheetClosedAt.current = 0; return; }
    const left = ACCOUNT_GRACE_MS - (Date.now() - sheetClosedAt.current);
    const timer = window.setTimeout(() => {
      sheetClosedAt.current = 0;
      setPhase((p) => (p === 'waiting' ? 'leaving' : p));
    }, Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [sheet, phase, signedIn, picture]);

  // Landing: hold on the picture, then send it home.
  useEffect(() => {
    if (phase !== 'landing' || !pictureReady) return;
    const timer = window.setTimeout(() => {
      const from = frameRef.current?.getBoundingClientRect();
      const target = findOwnPicture();
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!from || !target || reduced) { setPhase('leaving'); return; }
      const to = target.getBoundingClientRect();
      const scale = to.width / from.width;
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 12;
      setFlight({
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        // Counter the scale so the corner lands on the page picture's own curve.
        borderRadius: `${radius / scale}px`,
      });
      setPhase('flying');
    }, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase, pictureReady]);

  // A picture that never loads must not strand the frame on screen.
  useEffect(() => {
    if (phase !== 'landing' || pictureReady) return;
    const timer = window.setTimeout(() => setPhase('leaving'), 2500);
    return () => window.clearTimeout(timer);
  }, [phase, pictureReady]);

  useEffect(() => {
    if (phase !== 'flying' && phase !== 'leaving') return;
    const timer = window.setTimeout(() => {
      setPhase('idle');
      setFlight(undefined);
      setPictureReady(false);
    }, phase === 'flying' ? FLY_MS + 160 : LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'idle') return null;

  const showPicture = !!picture && (phase === 'landing' || phase === 'flying');

  return createPortal(
    <div
      className="signin-handoff"
      data-phase={phase}
      role="status"
      aria-live="polite"
      aria-label={phase === 'waiting' ? t('loginModal.signingIn', 'Signing you in…') : name}
    >
      <div className="signin-handoff__stage">
        <div className="signin-handoff__pulse" aria-hidden />
        <div ref={frameRef} className="signin-handoff__frame" style={flight} aria-hidden>
          {showPicture && (
            <img
              src={picture}
              alt=""
              draggable={false}
              data-ready={pictureReady ? '' : undefined}
              onLoad={() => setPictureReady(true)}
              onError={() => setPhase('leaving')}
            />
          )}
        </div>
        {name && phase === 'landing' && pictureReady && (
          <p className="signin-handoff__name" aria-hidden>{name}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default SignInHandoff;
