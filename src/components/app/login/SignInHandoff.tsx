/**
 * SignInHandoff
 * =============
 * The beat between the login sheet and the signed-in page: the Rift.
 *
 * While the sheet waits for the session the Riftn mark spins in, slows and
 * stops edge-on as a thin line of light (the rift), which then breathes in
 * the middle while specks drift into it. No words. The moment the account is known
 * the rift tears open into the account's picture (its name under it), and the
 * picture then travels to where it sits on the page underneath.
 *
 * The arrival follows the account, not the sheet: it starts as soon as a
 * sign-in started from the sheet lands, whether the sheet is still up, has
 * just closed, or never showed the waiting slit at all (a code typed in, a
 * wallet password). The picture is fetched the moment the account is known and
 * the rift opens when it is in, or after a short cap with the picture fading
 * in late, so the wait never grows (never before the spin has landed). An account without a picture gets its
 * initial.
 *
 * Log-ins only: a new account that goes on to pick a username is a sign-up,
 * and gets neither the arrival nor its picture.
 *
 * Rendered in a portal above the sheet and never takes a pointer event, so the
 * page is usable the moment the sheet is gone.
 *
 * The Rift is the default. Settings → Appearance → After you sign in swaps it
 * for Trace, Tune in, Deck or Glass drop (arrival-concepts.ts). Only what
 * plays and how the picture comes in change; the timing, the picture and its
 * flight home are the same for all of them.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useSignInSheetState } from '@/lib/sign-in-handoff';
import { buildAvatarUrl } from '@/lib/media-url';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { ARRIVAL_INTRO_MS, useArrivalLook, type ArrivalLook } from '@/lib/arrival-look';
import { CONCEPT_LOOKS, CONCEPT_NAME_MS, CONCEPT_REVEAL_MS, mountConcept, type ConceptHandle, type ConceptLook } from './arrival-concepts';
import './sign-in-handoff.css';

type Phase = 'idle' | 'waiting' | 'arriving' | 'open' | 'flying' | 'leaving';

/** The rift tearing open. */
const OPEN_MS = 480;
/** Long enough to recognise the picture, short enough not to feel like a wait. */
const HOLD_MS = 450;
const FLY_MS = 520;
const LEAVE_MS = 260;
/** The rift opens by then whether or not the picture is in; it fades in late. */
const PICTURE_CAP_MS = 650;
/** A sign-in from the sheet that lands this long after the sheet closed still arrives. */
const ARMED_MS = 10_000;
/** The sheet can close a commit before the account is in context. */
const ACCOUNT_GRACE_MS = 600;
/** The picture waits this long for the sheet to finish leaving before it flies. */
const SHEET_GONE_CAP_MS = 1500;
const FRAME_PX = 120;
/** A concept arrival: from the account landing until the picture flies home. */
const CONCEPT_HOLD_MS = 1300;

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

/**
 * Specks drifting into the rift: [start x, start y, seconds, delay, size] in
 * px / s. A cloud around the line, taller than wide, as in the concept.
 */
const SPECKS: Array<[number, number, number, number, number]> = (() => {
  let seed = 42;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: 26 }, () => {
    const ang = r() * Math.PI * 2;
    const rad = 70 + r() * 110;
    return [Math.round(Math.cos(ang) * rad * 0.55), Math.round(Math.sin(ang) * rad), 1.7 + r() * 1.3, r() * 2.4, 1.5 + r() * 2] as [number, number, number, number, number];
  });
})();

/** The Riftn mark (public/brand-icon.svg). */
const MARK_PATH = 'M868.0 1411.1C865.0 1410.1 850.4 1405.3 835.5 1400.5C805.2 1390.7 783.8 1382.8 771.1 1376.9C717.6 1351.7 677.9 1324.1 639.5 1285.6C609.6 1255.6 590.7 1231.4 568.8 1195.0C551.3 1165.8 533.4 1123.9 523.7 1089.0C515.5 1059.9 511.6 1039.4 508.5 1009.0C507.1 995.1 506.9 967.6 507.2 749.0L507.5 504.5L552.5 504.5C597.0 504.5 597.6 504.5 605.0 506.9C634.6 516.1 654.8 536.7 664.1 567.0L666.4 574.5L667.1 783.0C667.5 910.3 668.2 994.6 668.8 999.5C672.9 1032.5 683.8 1067.8 699.3 1098.5C706.9 1113.5 712.2 1122.1 723.1 1136.9C751.6 1175.7 783.2 1202.4 828.4 1226.0C838.4 1231.2 843.3 1234.6 850.6 1241.2C860.7 1250.5 869.9 1264.7 874.3 1278.0C878.3 1290.1 878.5 1293.7 878.5 1354.0L878.5 1412.5L876.0 1412.7C874.6 1412.9 871.0 1412.1 868.0 1411.1ZM1035.7 1412.3C1035.3 1412.0 1035.0 1385.5 1035.0 1353.6C1035.0 1300.8 1035.2 1294.7 1036.9 1286.4C1040.5 1269.2 1048.7 1254.3 1060.9 1242.7C1068.7 1235.4 1075.0 1231.1 1088.0 1224.2C1136.6 1198.6 1172.6 1165.5 1201.4 1120.1C1225.3 1082.4 1238.4 1044.7 1244.1 997.6C1245.9 982.2 1246.0 972.8 1246.0 780.3C1246.0 585.7 1246.1 578.9 1247.9 571.3C1250.4 561.2 1252.4 555.8 1256.2 549.0C1268.3 527.2 1287.4 512.3 1310.8 506.4C1320.0 504.1 1321.2 504.0 1362.4 504.0C1393.9 504.0 1404.9 504.3 1405.8 505.2C1407.4 506.8 1407.6 962.7 1406.0 988.5C1402.8 1041.2 1392.1 1089.5 1373.0 1137.5C1361.3 1167.0 1335.8 1211.7 1316.3 1237.0C1299.7 1258.6 1293.0 1266.1 1272.6 1286.5C1239.8 1319.1 1206.7 1343.6 1168.0 1363.7C1162.2 1366.8 1155.9 1370.1 1154.0 1371.1C1137.6 1379.8 1121.7 1385.9 1075.6 1401.1C1040.4 1412.7 1037.0 1413.7 1035.7 1412.3ZM883.1 836.6C882.3 835.6 882.0 765.2 882.2 564.9L882.5 294.5L885.5 286.0C892.9 265.5 909.0 250.5 932.5 242.5C944.5 238.4 950.0 238.0 998.1 238.0C1032.9 238.0 1044.9 238.3 1045.8 239.2C1046.7 240.1 1047.0 300.6 1047.0 505.5C1047.0 786.1 1047.1 779.4 1042.6 791.9C1036.3 809.4 1017.8 826.1 997.5 832.8C982.3 837.8 980.0 838.0 930.7 838.0C892.7 838.0 884.0 837.8 883.1 836.6Z';
/**
 * The rift: a thin line with the mark's middle-stroke ends, the top end
 * curving on the left and the bottom end on the right.
 */
const LINE_PATH = 'M0 112L0 6Q0 0 6 0L6 106Q6 112 0 112Z';
/** The mark spins in and stops edge-on, which is the line; see the CSS. */
export const RIFT_INTRO_MS = 1100;

export function RiftMarks() {
  return (
    <>
      <div className="signin-rift__glow" aria-hidden />
      <div className="signin-rift__specks" aria-hidden>
        {SPECKS.map(([x, y, s, d, size], i) => (
          <i
            key={i}
            style={{ '--x': `${x}px`, '--y': `${y}px`, '--s': `${s}s`, '--d': `${RIFT_INTRO_MS / 1000 + d}s`, width: size, height: size } as CSSProperties}
          />
        ))}
      </div>
      {[2, 1, 0].map((trail) => (
        <svg key={trail} className="signin-rift__logo" data-trail={trail || undefined} viewBox="351 223 1210 1210" aria-hidden>
          <path d={MARK_PATH} fill="#fff" />
        </svg>
      ))}
      <svg className="signin-rift__slit" viewBox="0 0 6 112" aria-hidden>
        <defs>
          <linearGradient id="signin-rift-fill" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--rift-b)' }} />
            <stop offset="0.3" style={{ stopColor: '#fff' }} />
            <stop offset="0.7" style={{ stopColor: '#fff' }} />
            <stop offset="1" style={{ stopColor: 'var(--rift-b)' }} />
          </linearGradient>
        </defs>
        <path d={LINE_PATH} fill="url(#signin-rift-fill)" />
      </svg>
    </>
  );
}

/**
 * Trace, Tune in, Deck and Glass drop: drawn frame by frame (arrival-concepts).
 * `opened` is the moment the account is in; each one then ends on the picture
 * where the shared frame sits.
 */
function ConceptMarks({ look, opened, picture, initial, keepPicture, playing = true }: {
  look: ConceptLook;
  opened: boolean;
  picture?: string;
  initial: string;
  keepPicture?: boolean;
  playing?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<ConceptHandle | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const h = mountConcept(root, look, { picture, initial, keepPicture, reduced });
    handle.current = h;
    return () => { h.stop(); handle.current = null; };
    // The picture is passed on below, as soon as the account is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look]);
  useEffect(() => { handle.current?.setPicture(picture, initial); }, [picture, initial, look]);
  useEffect(() => { if (opened) handle.current?.open(); }, [opened, look]);
  useEffect(() => { handle.current?.play(playing); }, [playing, look]);
  return <div ref={ref} className="signin-concept" aria-hidden />;
}

export function isConceptLook(look: ArrivalLook): look is ConceptLook {
  return (CONCEPT_LOOKS as readonly string[]).includes(look);
}

/** What plays while the account loads, for the picked arrival. */
export function ArrivalMarks({ look, opened = false, picture, initial = '', keepPicture, playing }: {
  look: ArrivalLook;
  opened?: boolean;
  picture?: string;
  initial?: string;
  keepPicture?: boolean;
  playing?: boolean;
}) {
  if (isConceptLook(look)) {
    return <ConceptMarks key={look} look={look} opened={opened} picture={picture} initial={initial} keepPicture={keepPicture} playing={playing} />;
  }
  return <RiftMarks />;
}

export function SignInHandoff() {
  const sheet = useSignInSheetState();
  const { isAuthenticated, user, requiresUsername } = useAuth();
  const { t } = useTranslation();
  const look = useArrivalLook();
  const introMs = ARRIVAL_INTRO_MS[look];
  const [phase, setPhase] = useState<Phase>('idle');
  const [flight, setFlight] = useState<CSSProperties | undefined>(undefined);
  const [pictureReady, setPictureReady] = useState(false);
  /** A concept arrival has put the picture where the frame is. */
  const [revealed, setRevealed] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  // Signed in before the sheet opened means "add a profile" or a wallet
  // unlock, neither of which is an arrival.
  const signedInAtOpen = useRef(false);
  const prevSheet = useRef(sheet);
  const sheetClosedAt = useRef(0);
  /** A sign-in from the sheet is in flight (or landed within ARMED_MS of it closing). */
  const armed = useRef(false);
  const arrivedFor = useRef('');

  const signedIn = isAuthenticated && !!user && !requiresUsername;
  const address = user?.address || user?.wallet_address || '';
  const picture = signedIn && address && user?.avatarImageUrl
    ? buildAvatarUrl(address, user.avatarImageUrl, FRAME_PX * 2)
    : undefined;
  const name = signedIn ? (user?.displayName || user?.display_name || user?.username || '') : '';
  // Never a "?": an account with no name yet shows the plain frame.
  const initial = (name || user?.username || '').trim().charAt(0).toUpperCase();

  // Follow the sheet.
  useLayoutEffect(() => {
    const was = prevSheet.current;
    prevSheet.current = sheet;
    if (was === 'closed' && sheet !== 'closed') {
      signedInAtOpen.current = signedIn;
      armed.current = !signedIn;
      if (!signedIn) arrivedFor.current = '';
    }
    if (sheet === 'waiting') {
      setFlight(undefined);
      setPhase((p) => (p === 'idle' || p === 'leaving' ? 'waiting' : p));
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

  // A sign-up, not a log-in: the arrival is only for accounts that exist.
  useEffect(() => {
    if (requiresUsername) armed.current = false;
  }, [requiresUsername]);

  // The account landed: open the rift. Follows the account, so a sheet that
  // closed a beat early, or one that never showed the slit, still gets it.
  useEffect(() => {
    if (!signedIn || signedInAtOpen.current || !armed.current) return;
    if (sheet === 'closed' && Date.now() - sheetClosedAt.current > ARMED_MS) { armed.current = false; return; }
    if (arrivedFor.current === address) return;
    arrivedFor.current = address;
    armed.current = false;
    setPictureReady(false);
    setFlight(undefined);
    setPhase('arriving');
  }, [signedIn, sheet, address]);

  // Fetch the picture the moment the account is known, so it is usually in
  // before the rift has to open.
  useEffect(() => {
    if (!picture || phase !== 'arriving') return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => setPictureReady(true);
    img.src = picture;
  }, [picture, phase]);

  // When the rift (and its spin) went on screen.
  const shownAt = useRef(0);
  const arrivingAt = useRef(0);
  useLayoutEffect(() => {
    if (phase === 'waiting' || phase === 'arriving') { if (!shownAt.current) shownAt.current = Date.now(); }
    else if (phase === 'idle') shownAt.current = 0;
    if (phase === 'arriving') arrivingAt.current = Date.now();
  }, [phase]);

  // Open on the picture, or after the cap without it, and never before the
  // spin has landed on the line.
  useEffect(() => {
    if (phase !== 'arriving') return;
    const now = Date.now();
    const spun = shownAt.current + introMs;
    const due = pictureReady ? Math.max(now, spun) : Math.max(arrivingAt.current + PICTURE_CAP_MS, spun);
    const timer = window.setTimeout(() => setPhase('open'), Math.max(0, due - now));
    return () => window.clearTimeout(timer);
  }, [phase, pictureReady, introMs]);

  // The sheet went without an account: let the slit go.
  useEffect(() => {
    if (phase !== 'waiting' || sheet !== 'closed' || signedIn) return;
    const left = ACCOUNT_GRACE_MS - (Date.now() - sheetClosedAt.current);
    const timer = window.setTimeout(() => {
      setPhase((p) => (p === 'waiting' ? 'leaving' : p));
    }, Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [phase, sheet, signedIn]);

  // A concept arrival hands the picture to the frame once it stands still.
  const concept = isConceptLook(look);
  useEffect(() => {
    if (!concept || phase !== 'open') { if (phase === 'idle' || phase === 'waiting' || phase === 'arriving') setRevealed(false); return; }
    const timer = window.setTimeout(() => setRevealed(true), CONCEPT_REVEAL_MS[look as ConceptLook]);
    return () => window.clearTimeout(timer);
  }, [concept, phase, look]);

  // The glass wants a lighter veil behind it (sign-in-handoff.css).
  useEffect(() => {
    const on = look === 'glass' && phase !== 'idle';
    document.documentElement.toggleAttribute('data-arrival-glass', on);
    return () => document.documentElement.removeAttribute('data-arrival-glass');
  }, [look, phase]);

  // Open: hold on the picture, then send it home once the sheet has gone.
  // The concepts take longer to bring the picture in, and hold it as long.
  const holdMs = concept ? CONCEPT_HOLD_MS : OPEN_MS + HOLD_MS;
  const openedAt = useRef(0);
  useEffect(() => {
    if (phase === 'open') openedAt.current = Date.now();
  }, [phase]);
  useEffect(() => {
    if (phase !== 'open') return;
    const sheetGone = sheet === 'closed';
    const since = Date.now() - openedAt.current;
    const wait = sheetGone
      ? Math.max(0, holdMs - since)
      : Math.max(0, holdMs + SHEET_GONE_CAP_MS - since);
    const timer = window.setTimeout(() => {
      const from = frameRef.current?.getBoundingClientRect();
      const target = sheetGone ? findOwnPicture() : null;
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
    }, wait);
    return () => window.clearTimeout(timer);
  }, [phase, sheet, holdMs]);

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

  const opened = phase === 'open' || phase === 'flying' || (phase === 'leaving' && arrivedFor.current !== '');

  return createPortal(
    <div
      className="signin-rift"
      data-arrival={look}
      data-concept={concept ? '' : undefined}
      data-revealed={concept && revealed ? '' : undefined}
      data-phase={phase}
      data-opened={opened ? '' : undefined}
      style={concept ? ({ '--concept-name-delay': `${CONCEPT_NAME_MS[look as ConceptLook]}ms` } as CSSProperties) : undefined}
      role="status"
      aria-live="polite"
      aria-label={opened ? name : t('loginModal.signingIn', 'Signing you in…')}
    >
      {/* Phones: the veil is the arrival's own, so it stays until the picture
          flies home even when the sheet (and its veil) has already gone. */}
      <div className="signin-rift__veil" aria-hidden />
      <div className="signin-rift__stage">
        <ArrivalMarks look={look} opened={opened} picture={picture} initial={initial} />
        <div ref={frameRef} className="signin-rift__frame" style={flight} aria-hidden>
          {/* Only an account with no picture shows its initial; one whose
              picture is still on its way shows the dark frame it fades into. */}
          {!picture && <span className="signin-rift__initial">{initial}</span>}
          {picture && (
            <img
              src={picture}
              alt=""
              draggable={false}
              data-ready={pictureReady ? '' : undefined}
              onLoad={() => setPictureReady(true)}
            />
          )}
        </div>
        {name && phase === 'open' && (
          // As on profiles: the name in bold with the badge after it, no pill.
          // White on the sheet's dark veil; the theme's own text colour once
          // the page shows through.
          <p className="signin-rift__name text-white" data-on-veil={sheet !== 'closed' ? '' : undefined} aria-hidden>
            <span className="signin-rift__nametext">{name}</span>
            <span className="signin-rift__badge"><BadgeIcon lookupId={address} username={user?.username || undefined} className="w-[1em] h-[1em]" /></span>
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default SignInHandoff;
