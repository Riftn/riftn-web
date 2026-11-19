/**
 * Responsive lanes of selected clips above the email-first login. The drawer and
 * phone screen share the catalogue, with a new order on each mount.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loginClipLanes } from '@/lib/login-clip-lanes';
import { LOGIN_CLIP_IDS } from './login-clip-assets';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLoginLook, type LoginLook } from '@/lib/login-look';
import '@/styles/login-stack.css';

type ClipName = typeof LOGIN_CLIP_IDS[number];

/**
 * Loads and plays only while on screen. A tile builds no <video> at all (no
 * element, no clip, no poster) until it is actually in view, so opening the
 * sheet costs only the handful of clips you can see; the rest are built as the
 * lanes drift them in. A <video> is not cheap even empty: Chrome gives each
 * one ~100 elements of built-in controls to style, and 16 of them in the
 * opening frame were most of the delay between tap and sheet. Until its first
 * frame is ready the tile stays plain; the clip then fades in over it. Once built, a clip stays so drifting back does not refetch.
 *
 * Clips play for everyone. Reduced motion only stops the lanes drifting
 * (login-stack.css): it used to swap every clip for its still frame, which is
 * what people with Reduce Motion or Windows' "Animation effects" off saw.
 * The wall is decoration behind the sign-in form, never a player: a clip only
 * shows once it is actually playing, it never takes taps, and when the
 * browser refuses to start it on its own (iPhone Low Power Mode, in-app
 * browsers) the tile keeps its still. Starting clips on the next tap used to
 * pop them open full screen in in-app browsers and leave play buttons on the
 * paused ones.
 */
/**
 * The wordmark mask and each tile's still go first; clips only start
 * downloading once those are in, so a slow connection shows the logo and a
 * picture in every tile instead of blank boxes while videos crawl in.
 */
const LOGO_SRC = '/brand-kit/brand/riftn-logo-white.png';
let logoReady: Promise<void> | null = null;
function whenLogoReady() {
  if (!logoReady) {
    logoReady = typeof Image === 'undefined'
      ? Promise.resolve()
      : new Promise<void>((done) => {
        const logo = new Image();
        logo.onload = () => done();
        logo.onerror = () => done();
        logo.src = LOGO_SRC;
        // Never hold the clips back for long.
        setTimeout(done, 4000);
      });
  }
  return logoReady;
}

let blurLoad: Promise<Record<string, string> | null> | null = null;
/**
 * Start the wordmark and the blurred frames (about 15 KB). Called when the
 * sheet is warmed (idle prefetch for guests, or intent) and again on open, so
 * they are usually in before the sheet paints, without riding on every page.
 */
export function warmLoginStack() {
  void whenLogoReady();
  if (!blurLoad) blurLoad = import('./login-clip-blur').then((m) => m.LOGIN_CLIP_BLUR).catch(() => { blurLoad = null; return null; });
  return blurLoad;
}

/** Stills still on their way across every tile; clips wait until they are all in. */
let stillsPending = 0;
const stillsListeners = new Set<() => void>();
function stillStarted() { stillsPending += 1; }
function stillSettled() {
  stillsPending = Math.max(0, stillsPending - 1);
  if (stillsPending === 0) stillsListeners.forEach((fn) => fn());
}

function Clip({ name, blur }: { name: ClipName; blur?: string }) {
  const tileRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [stillIn, setStillIn] = useState(false);
  const [logoIn, setLogoIn] = useState(false);
  const stillCounted = useRef(false);
  const settleStill = () => {
    if (!stillCounted.current) return;
    stillCounted.current = false;
    stillSettled();
  };
  useEffect(() => {
    let live = true;
    void whenLogoReady().then(() => { if (live) setLogoIn(true); });
    stillCounted.current = true;
    stillStarted();
    const allIn = () => { if (live) setStillIn(true); };
    stillsListeners.add(allIn);
    // A still that never arrives must not hold the clips back for good.
    const t = setTimeout(allIn, 5000);
    return () => { live = false; clearTimeout(t); stillsListeners.delete(allIn); settleStill(); };
  }, []);
  const mountVideo = loaded && stillIn && logoIn;
  useEffect(() => {
    const tile = tileRef.current;
    if (!tile) return;
    // Older engines (and jsdom) have no observer: treat every tile as visible.
    if (typeof IntersectionObserver === 'undefined') { setLoaded(true); setVisible(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setLoaded(true);
    });
    io.observe(tile);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const video = ref.current as (HTMLVideoElement & { webkitExitFullscreen?: () => void }) | null;
    if (!video || !mountVideo) return;
    // Some in-app browsers open a clip full screen even with playsInline: close it and keep the still.
    const close = () => { video.webkitExitFullscreen?.(); video.pause(); };
    video.addEventListener('webkitbeginfullscreen', close);
    return () => video.removeEventListener('webkitbeginfullscreen', close);
  }, [mountVideo]);
  useEffect(() => {
    const video = ref.current;
    if (!video || !mountVideo) return;
    // React does not reflect `muted` as an attribute, and Safari refuses to
    // autoplay a video it cannot see is muted.
    video.muted = true;
    if (!visible) { video.pause(); return; }
    let cancelled = false;
    // Older engines (and jsdom) return nothing from play() rather than a promise.
    video.play()?.catch?.(() => {
      if (!cancelled) setReady(false);
    });
    return () => { cancelled = true; };
  }, [mountVideo, visible]);
  return (
    <div
      ref={tileRef}
      className="login-stack__tile"
      // A tiny blurred frame shows the instant the tile exists, under the still and the clip.
      style={blur ? { backgroundImage: `url(${blur})` } : undefined}
    >
      <img
        src={`/login-stack/${name}.jpg`}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="login-stack__still"
        onLoad={settleStill}
        onError={settleStill}
      />
      {mountVideo && (
        <video
          ref={ref}
          src={`/login-stack/${name}.mp4`}
          poster={`/login-stack/${name}.jpg`}
          onPlaying={() => setReady(true)}
          onPause={() => setReady(false)}
          muted
          loop
          playsInline
          webkit-playsinline="true"
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          x-webkit-airplay="deny"
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          className={ready ? 'login-stack__video is-ready' : 'login-stack__video'}
        />
      )}
    </div>
  );
}

function Lane({ clips, reverse, blurs }: { clips: ClipName[]; reverse?: boolean; blurs: Record<string, string> | null }) {
  return (
    <div className={reverse ? 'login-stack__lane login-stack__lane--down' : 'login-stack__lane'}>
      {[...clips, ...clips].map((name, i) => <Clip key={i} name={name} blur={blurs?.[name]} />)}
    </div>
  );
}

/** Desktop shows four lanes; phones keep two. */
const DESKTOP_LANES = 4;

/** A step further into signing in (the 2FA code) keeps the wall and the logo and only changes the words. */
export interface LoginStackHeadline {
  top: string;
  accent: string;
}


/**
 * The Riftn wordmark and the headline as one lit sign, in the look picked in
 * Settings → Appearance (Tube TV, VHS tape, LED wall or Hologram). VHS draws a
 * second copy that its tracking tear drags sideways.
 */
export function LoginSign({ headline, look: forced, className }: { headline?: LoginStackHeadline; look?: LoginLook; className?: string }) {
  const { t } = useTranslation();
  const picked = useLoginLook();
  const look = forced ?? picked;
  const top = headline?.top ?? t('loginStack.headlineTop', 'You will own everything');
  const accent = headline?.accent ?? t('loginStack.headlineAccent', 'and be happy.');
  const sign = (copy: boolean) => (
    <div className={copy ? 'login-stack__sign login-stack__sign--tear' : 'login-stack__sign'} aria-hidden={copy || undefined}>
      <div className="login-stack__logo" role={copy ? undefined : 'img'} aria-label={copy ? undefined : 'Riftn'}>
        <span className="login-stack__logo-mark" />
      </div>
      {copy ? (
        <div className="login-stack__headline text-white">
          {top}
          <span className="login-stack__accent">{accent}</span>
        </div>
      ) : (
        <h2 className="login-stack__headline text-white">
          {top}
          <span className="login-stack__accent">{accent}</span>
        </h2>
      )}
    </div>
  );
  return (
    <div className={className ? `login-stack__title ${className}` : 'login-stack__title'} data-look={look}>
      {sign(false)}
      {look === 'vhs' && sign(true)}
    </div>
  );
}

export function LoginShortsStack({ headline }: { headline?: LoginStackHeadline } = {}) {
  const isMobile = useIsMobile();
  const count = DESKTOP_LANES;
  const [lanes] = useState(() => loginClipLanes(LOGIN_CLIP_IDS, Math.random, 12));
  // The blurred frames (about 15 KB) and the wordmark load with the sheet, not with every page.
  const [blurs, setBlurs] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    void warmLoginStack().then((b) => { if (live && b) setBlurs(b); });
    return () => { live = false; };
  }, []);
  const selected = [...lanes.first, ...lanes.second];
  const perLane = Math.ceil(selected.length / count);
  // Phones keep two lanes of four so they drift at the same speed as before.
  const columns = isMobile
    ? [selected.slice(0, 4), selected.slice(4, 8)]
    : Array.from({ length: count }, (_, i) => selected.slice(i * perLane, (i + 1) * perLane));
  return (
    <div className="login-stack" data-login-stack>
      <div className="login-stack__lanes" aria-hidden="true">
        {columns.map((clips, index) => <Lane key={index} clips={clips} reverse={index % 2 === 1} blurs={blurs} />)}
      </div>
      <LoginSign headline={headline} />
    </div>
  );
}

export default LoginShortsStack;
