/**
 * LiveMiniPlayer
 * ==============
 * The live you minimised, kept playing while you browse.
 *
 * - Corner window: the picture, small. Drag it to any corner; tap it to open
 *   the live again. Float puts it in the browser's own floating window, which
 *   stays over other apps and tabs (and switching tab does it by itself where
 *   the browser allows).
 * - Listen bar: sound only, in the same slot and shape as the audio post
 *   player, on the theme's own glass so it never reads as a dark slab on a
 *   light page.
 *
 * One <video> serves both, so switching between them never restarts the
 * stream. It is never torn down by a navigation: only X, the live ending, or
 * another sound starting closes it.
 *
 * @module components/app/live/LiveMiniPlayer
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { Headphones, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type Hls from 'hls.js';
import Pause from '@/components/ui/cut-icons/pause';
import Play from '@/components/ui/cut-icons/play';
import X from '@/components/ui/cut-icons/close';
import Video from '@/components/ui/cut-icons/video';
import PictureInPicture2 from '@/components/ui/cut-icons/picture-in-picture';
import { cn } from '@/lib/utils';
import {
  closeLiveMini,
  dropLiveMiniSession,
  getLiveMini,
  setLiveMiniMode,
  setLiveMiniVideo,
  useLiveMini,
  type LiveMini,
} from '@/lib/live-mini';
import { LIVE_HLS_CONFIG, playsNativeHls, takeWarmLiveHls } from '@/lib/live/hls-standby';
import { nativeLiveEdge, watchLiveProgress } from '@/lib/live/stall-watchdog';
import { BIG_EVENT_HLS_CONFIG, isBigEventPlayback } from '@/lib/live-ingest';
import { canPictureInPicture, catchUpToLiveEdge, onReturnToTab, togglePictureInPicture, useAutoPictureInPicture } from '@/lib/live-background';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
import { useLivePlaybackAllowed, visualActivity } from '@/lib/visual-activity';
import { claimMediaSession, releaseMediaSession, setMediaSessionPlaying } from '@/lib/media-session';
import { stopAudioPost, useAudioPostPlayback } from '@/lib/audio-post-playback';
import { stopStageRecording, useStagePlayback } from '@/lib/stage-playback';
import { useRadioPlayer } from '@/hooks/use-radio-player';
import { useAuth } from '@/contexts/AuthContext';

const OWNER = 'live-mini';
/** Gap from the screen edges, and what the window keeps clear of. */
const EDGE = 16;
const PHONE_NAV = 84;
const PHONE_TOP = 100;
const DESKTOP_TOP = 80;

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Safe-area insets, read once from a probe (CSS env() has no JS reader). */
function safeArea(): { top: number; bottom: number } {
  if (typeof document === 'undefined') return { top: 0, bottom: 0 };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const out = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return out;
}

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export function LiveMiniPlayer() {
  const mini = useLiveMini();
  if (!mini) return null;
  return <LiveMiniSession key={mini.streamId} mini={mini} />;
}

function LiveMiniSession({ mini }: { mini: LiveMini }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [hasPicture, setHasPicture] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const [pipAvailable, setPipAvailable] = useState(false);
  const wantPlayRef = useRef(true);
  const livePlaybackAllowed = useLivePlaybackAllowed();
  const hlsRef = useRef<Hls | null>(null);
  const streamId = mini.streamId;

  // Signing out or switching account closes it: the seat belongs to whoever
  // minimised it.
  const { walletAddress } = useAuth();
  const accountRef = useRef(walletAddress);
  useEffect(() => {
    if (accountRef.current !== walletAddress) closeLiveMini();
  }, [walletAddress]);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video || !visualActivity.isLivePlaybackAllowed()) return;
    wantPlayRef.current = true;
    video.muted = false;
    videoPlaybackManager.play(OWNER);
    videoPlaybackManager.claimAudio(OWNER);
    void video.play().catch(async (error: unknown) => {
      if (!wantPlayRef.current || !video.isConnected) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      // The route handoff can outlast the tap's transient user activation.
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        video.muted = true;
        try {
          await video.play();
          return;
        } catch (fallbackError) {
          if (fallbackError instanceof DOMException && fallbackError.name === 'AbortError') return;
        }
      }
      if (!wantPlayRef.current || !video.isConnected) return;
      // An attachment or source change can interrupt play. Keep the intent so
      // canplay (or the stall watch) can see the same request through.
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        wantPlayRef.current = false;
        videoPlaybackManager.stop(OWNER);
        setPlaying(false);
        setBuffering(false);
      }
    });
  }, []);

  const pause = useCallback(() => {
    wantPlayRef.current = false;
    videoRef.current?.pause();
    setBuffering(false);
    videoPlaybackManager.stop(OWNER);
  }, []);

  /** Back on the live edge: a paused live picks up where the room is now. */
  const resume = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    catchUpToLiveEdge(video, hlsRef.current);
    play();
  }, [play]);

  // Playback: the page's WebRTC session when it handed one over, else HLS.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setLiveMiniVideo(video);
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const ended = () => {
      if (disposed) return;
      toast(t('liveMini.ended', 'This live has ended'));
      closeLiveMini();
    };

    /** A failed load is either the live ending or the network: ask which. */
    const probe = async (url: string) => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.status === 404 || res.status === 410) { ended(); return true; }
      } catch { /* offline: keep retrying */ }
      return false;
    };

    let urlIndex = 0;
    let attaching = false;
    const startHls = async () => {
      const url = mini.urls[urlIndex];
      if (attaching || disposed || !url) return;
      setBuffering(true);
      attaching = true;
      try {
        if (playsNativeHls(video, url)) {
          video.src = url;
          if (wantPlayRef.current) play();
          return;
        }
        const warm = await takeWarmLiveHls(url);
        if (disposed) { warm?.hls.destroy(); return; }
        const HlsCtor = warm?.Hls ?? (await import('hls.js')).default;
        if (disposed) return;
        if (!HlsCtor.isSupported()) {
          video.src = url;
          if (wantPlayRef.current) play();
          return;
        }
        const hls = warm?.hls ?? new HlsCtor({ ...LIVE_HLS_CONFIG, ...(isBigEventPlayback(url) ? BIG_EVENT_HLS_CONFIG : {}) });
        hlsRef.current = hls;
        hls.on(HlsCtor.Events.MEDIA_ATTACHED, () => {
          if (!disposed && wantPlayRef.current) play();
        });
        hls.on(HlsCtor.Events.ERROR, (_e, data) => {
          if (!data.fatal || disposed) return;
          if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
          retrySource(url);
        });
        if (!warm) hls.loadSource(url);
        hls.attachMedia(video);
      } catch {
        retrySource(url);
      } finally {
        attaching = false;
      }
    };

    const retrySource = (url: string) => {
      clearTimeout(retry);
      retry = setTimeout(() => {
        if (disposed || !wantPlayRef.current) return;
        if (urlIndex + 1 < mini.urls.length) {
          hlsRef.current?.destroy();
          hlsRef.current = null;
          urlIndex += 1;
          void startHls();
        } else if (mini.urls.length === 1) {
          void probe(url).then((gone) => {
            if (!gone && !disposed && wantPlayRef.current) void startHlsAgain();
          });
        } else {
          // A single CDN's missing playlist does not mean the broadcast ended.
          urlIndex = 0;
          void startHlsAgain();
        }
      }, 3000);
    };
    const startHlsAgain = () => {
      if (attaching) return;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      return startHls();
    };
    const onNativeError = () => {
      const url = mini.urls[urlIndex];
      if (!video.srcObject && !hlsRef.current && url) retrySource(url);
    };
    video.addEventListener('error', onNativeError);
    video.addEventListener('ended', onNativeError);

    const session = mini.session;
    const fallBack = () => {
      if (disposed || !session || getLiveMini()?.session !== session) return;
      video.srcObject = null;
      dropLiveMiniSession();
      void startHls();
    };
    if (session) {
      session.setStateListener((state) => {
        if (state === 'failed') fallBack();
      });
      video.srcObject = session.stream;
      if (wantPlayRef.current) play();
    } else {
      void startHls();
    }

    const stopWatch = watchLiveProgress(video, {
      stallMs: 6000,
      preferVideoFrames: () => !!video.srcObject,
      watchInPictureInPicture: true,
      watchWhilePaused: true,
      shouldWatch: () => wantPlayRef.current && visualActivity.isLivePlaybackAllowed(),
      onStall: (count) => {
        if (video.paused && count === 1 && (video.srcObject || video.currentSrc)) {
          play();
          return;
        }
        if (video.srcObject) { fallBack(); return; }
        if (attaching) return;
        const hls = hlsRef.current;
        const edge = hls?.liveSyncPosition ?? nativeLiveEdge(video);
        if (count === 1 && edge != null && Number.isFinite(edge) && edge > video.currentTime + 0.25) {
          video.currentTime = edge;
        } else if (hls) {
          hls.recoverMediaError();
        } else void startHlsAgain();
      },
    });

    return () => {
      disposed = true;
      clearTimeout(retry);
      stopWatch();
      video.removeEventListener('error', onNativeError);
      video.removeEventListener('ended', onNativeError);
      session?.setStateListener(undefined);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      // The session belongs to the store (stopped there, or handed back to
      // the page); only this element lets go of it.
      video.srcObject = null;
      video.removeAttribute('src');
      setLiveMiniVideo(null);
    };
    // One stream per session (keyed on streamId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (livePlaybackAllowed && wantPlayRef.current && video?.paused && (video.currentSrc || video.srcObject)) play();
  }, [livePlaybackAllowed, play]);

  // One sound at a time: starting here stops the others, and any of them
  // starting later closes this.
  const audioPost = useAudioPostPlayback();
  const stage = useStagePlayback();
  const radio = useRadioPlayer();
  const othersRef = useRef({ audio: audioPost.isPlaying, stage: !!stage.spaceId && !stage.paused, radio: radio.isPlaying });
  useEffect(() => {
    if (audioPost.isPlaying) stopAudioPost();
    if (stage.spaceId && !stage.paused) stopStageRecording();
    if (radio.isPlaying) radio.stop();
    othersRef.current = { audio: false, stage: false, radio: false };
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const now = { audio: audioPost.isPlaying, stage: !!stage.spaceId && !stage.paused, radio: radio.isPlaying };
    const was = othersRef.current;
    othersRef.current = now;
    if ((now.audio && !was.audio) || (now.stage && !was.stage) || (now.radio && !was.radio)) closeLiveMini();
  }, [audioPost.isPlaying, stage.spaceId, stage.paused, radio.isPlaying]);

  // Another video taking the sound closes it; a call holds it paused.
  useEffect(() => {
    videoPlaybackManager.register(
      OWNER,
      () => { videoRef.current?.pause(); },
      (muted) => { if (muted) closeLiveMini(); },
      () => true,
      () => videoRef.current,
      true,
    );
    return () => videoPlaybackManager.unregister(OWNER);
  }, []);

  // Lock screen and media keys.
  useEffect(() => {
    claimMediaSession(OWNER, { title: mini.title, artist: mini.host, artwork: mini.avatar }, {
      play: resume,
      pause,
      stop: () => closeLiveMini(),
    });
    return () => releaseMediaSession(OWNER);
  }, [mini.title, mini.host, mini.avatar, resume, pause]);
  useEffect(() => { setMediaSessionPlaying(OWNER, playing); }, [playing]);

  // Ended on air: the room says so before the playlist does.
  useEffect(() => {
    let watch: { leave: () => void } | null = null;
    let cancelled = false;
    void import('@/lib/api/dehub/stream-presence').then(({ watchStreamPlayback }) => {
      if (cancelled) return;
      watch = watchStreamPlayback(streamId, () => undefined, () => {
        toast(t('liveMini.ended', 'This live has ended'));
        closeLiveMini();
      });
    });
    return () => { cancelled = true; watch?.leave(); };
  }, [streamId, t]);

  // Back from another tab: the live edge, not where it was left.
  useEffect(() => onReturnToTab(() => {
    const video = videoRef.current;
    if (!video || !wantPlayRef.current) return;
    catchUpToLiveEdge(video, hlsRef.current);
    if (video.paused) void video.play().catch(() => undefined);
  }), []);

  // Float by itself on tab switch while the picture is up.
  useAutoPictureInPicture(videoRef, playing && mini.mode === 'video');

  const onPicture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    setHasPicture(true);
    setAspect(Math.min(16 / 9, Math.max(9 / 16, video.videoWidth / video.videoHeight)));
    setPipAvailable(canPictureInPicture(video));
  };

  const open = useCallback(() => {
    const path = mini.path;
    closeLiveMini({ video: videoRef.current });
    navigate(path);
  }, [mini.path, navigate]);

  const togglePlay = useCallback(() => {
    if (playing || (buffering && wantPlayRef.current)) pause();
    else resume();
  }, [playing, buffering, pause, resume]);

  return (
    <>
      <CornerWindow
        hidden={mini.mode !== 'video'}
        aspect={aspect}
        poster={mini.poster}
        avatar={mini.avatar}
        host={mini.host}
        hasPicture={hasPicture}
        loading={buffering && wantPlayRef.current}
        playing={playing}
        pipAvailable={pipAvailable}
        onOpen={open}
        onTogglePlay={togglePlay}
        onListen={() => setLiveMiniMode('listen')}
        onFloat={() => { void togglePictureInPicture(videoRef.current); }}
        onClose={() => closeLiveMini()}
      >
        <video
          ref={videoRef}
          playsInline
          className="h-full w-full object-cover"
          style={{ background: '#000' }}
          onPlaying={() => { setPlaying(true); setBuffering(false); onPicture(); }}
          onPause={() => setPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => { if (wantPlayRef.current && videoRef.current?.paused) play(); }}
          onLoadedMetadata={onPicture}
          onResize={onPicture}
        />
      </CornerWindow>
      {mini.mode === 'listen' && (
        <ListenBar
          mini={mini}
          playing={playing}
          loading={buffering && wantPlayRef.current}
          onOpen={open}
          onTogglePlay={togglePlay}
          onShowPicture={() => setLiveMiniMode('video')}
          onClose={() => closeLiveMini()}
        />
      )}
    </>
  );
}

interface CornerWindowProps {
  hidden: boolean;
  aspect: number;
  poster?: string;
  avatar?: string;
  host: string;
  hasPicture: boolean;
  loading: boolean;
  playing: boolean;
  pipAvailable: boolean;
  onOpen: () => void;
  onTogglePlay: () => void;
  onListen: () => void;
  onFloat: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

/** Round control on the picture: dark glass, white glyph, no hover wash. */
const ON_PICTURE = 'grid size-8 place-items-center rounded-full text-white';
const ON_PICTURE_STYLE: React.CSSProperties = { background: 'rgb(0 0 0 / 0.42)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' };

function CornerWindow({
  hidden, aspect, poster, avatar, host, hasPicture, loading, playing, pipAvailable,
  onOpen, onTogglePlay, onListen, onFloat, onClose, children,
}: CornerWindowProps) {
  const { t } = useTranslation();
  const viewport = useViewport();
  const reducedMotion = useReducedMotion();
  const phone = viewport.w < 768;
  const width = Math.round(aspect >= 1 ? (phone ? 216 : 320) : (phone ? 128 : 180));
  const height = Math.round(width / aspect);
  const insets = useRef<{ top: number; bottom: number } | null>(null);
  if (!insets.current && typeof window !== 'undefined') insets.current = safeArea();
  const [corner, setCorner] = useState<Corner>('br');

  const spot = useCallback((c: Corner) => {
    const safe = insets.current ?? { top: 0, bottom: 0 };
    const top = (phone ? PHONE_TOP : DESKTOP_TOP) + safe.top;
    const bottom = (phone ? PHONE_NAV : EDGE) + safe.bottom;
    return {
      x: c === 'tl' || c === 'bl' ? EDGE : viewport.w - width - EDGE,
      y: c === 'tl' || c === 'tr' ? top : viewport.h - height - bottom,
    };
  }, [phone, viewport.w, viewport.h, width, height]);

  const x = useMotionValue(spot('br').x);
  const y = useMotionValue(spot('br').y);
  // Size, screen or corner changed: settle into the corner.
  useEffect(() => {
    const target = spot(corner);
    const opts = { type: 'spring' as const, stiffness: 420, damping: 38 };
    const ax = animate(x, target.x, reducedMotion ? { duration: 0 } : opts);
    const ay = animate(y, target.y, reducedMotion ? { duration: 0 } : opts);
    return () => { ax.stop(); ay.stop(); };
  }, [corner, spot, x, y, reducedMotion]);

  const dragged = useRef(false);
  const settle = () => {
    const cx = x.get() + width / 2;
    const cy = y.get() + height / 2;
    const next: Corner = `${cy < viewport.h / 2 ? 't' : 'b'}${cx < viewport.w / 2 ? 'l' : 'r'}` as Corner;
    if (next === corner) {
      const target = spot(next);
      animate(x, target.x, { type: 'spring', stiffness: 420, damping: 38 });
      animate(y, target.y, { type: 'spring', stiffness: 420, damping: 38 });
    } else setCorner(next);
  };

  return (
    <motion.div
      role="region"
      aria-label={t('liveMini.player', 'Live player')}
      aria-hidden={hidden || undefined}
      data-keep-dark
      data-live-mini-window
      drag={!hidden}
      dragMomentum={false}
      dragElastic={0}
      onPointerDown={() => { dragged.current = false; }}
      onDragStart={() => { dragged.current = true; }}
      onDragEnd={settle}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: hidden ? 0 : 1, scale: hidden ? 0.92 : 1 }}
      transition={{ duration: 0.22 }}
      className={cn(
        'fixed left-0 top-0 z-50 touch-none select-none overflow-hidden rounded-xl',
        hidden ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing',
      )}
      style={{
        x,
        y,
        width,
        height,
        background: '#000',
        boxShadow: '0 0 0 1px rgb(255 255 255 / 0.1), 0 18px 48px rgb(0 0 0 / 0.38)',
        // Listening: the element keeps playing, out of sight and out of the way.
        visibility: hidden ? 'hidden' : 'visible',
      }}
    >
      {children}

      {!hasPicture && (
        <div className="absolute inset-0 grid place-items-center" style={{ background: '#000' }}>
          {poster ? <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
          {!poster && avatar ? <img src={avatar} alt="" className="size-12 rounded-xl object-cover opacity-80" /> : null}
          <Loader2 className="absolute size-5 animate-spin text-white/80" />
        </div>
      )}

      {/* Tap the picture to open the live again. */}
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t('liveMini.openLive', 'Open live')}
        title={host}
        onClick={() => { if (!dragged.current) onOpen(); }}
      />

      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-12" style={{ background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.45), transparent)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-14" style={{ background: 'linear-gradient(to top, rgb(0 0 0 / 0.5), transparent)' }} />

      <span
        className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
        style={{ background: '#EF4444' }}
      >
        <span className="size-1.5 rounded-full bg-white" />
        {t('stages.liveBadge', 'LIVE')}
      </span>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label={t('liveMini.close', 'Close live')}
        title={t('liveMini.close', 'Close live')}
        className={cn(ON_PICTURE, 'absolute right-1.5 top-1.5 size-7')}
        style={ON_PICTURE_STYLE}
      >
        <X className="size-3.5" />
      </button>

      <div className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
          aria-label={playing ? t('liveMini.pause', 'Pause') : t('liveMini.play', 'Play')}
          title={playing ? t('liveMini.pause', 'Pause') : t('liveMini.play', 'Play')}
          className={ON_PICTURE}
          style={ON_PICTURE_STYLE}
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="ml-0.5 size-3.5" fill="currentColor" />}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onListen(); }}
          aria-label={t('liveMini.soundOnly', 'Sound only')}
          title={t('liveMini.soundOnly', 'Sound only')}
          className={ON_PICTURE}
          style={ON_PICTURE_STYLE}
        >
          <Headphones className="size-3.5" />
        </button>
        {pipAvailable && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFloat(); }}
            aria-label={t('liveMini.float', 'Float over other apps')}
            title={t('liveMini.float', 'Float over other apps')}
            className={ON_PICTURE}
            style={ON_PICTURE_STYLE}
          >
            <PictureInPicture2 className="size-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

interface ListenBarProps {
  mini: LiveMini;
  playing: boolean;
  loading: boolean;
  onOpen: () => void;
  onTogglePlay: () => void;
  onShowPicture: () => void;
  onClose: () => void;
}

/** Controls on the bar: written for dark, light themes remap the ink and plate. */
const ON_BAR = 'grid size-9 shrink-0 place-items-center rounded-xl text-white bg-white/10 [@media(hover:hover)]:hover:bg-white/15 transition-colors';

function ListenBar({ mini, playing, loading, onOpen, onTogglePlay, onShowPicture, onClose }: ListenBarProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      role="region"
      aria-label={t('liveMini.player', 'Live player')}
      data-live-mini-listen
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      // Phones: full width above the menu. Wider screens: centred under the
      // page, clear of the sidebar's sign-in button and the right-hand rail.
      className="pointer-events-none fixed inset-x-4 z-50 flex select-none justify-center bottom-[calc(5rem+env(safe-area-inset-bottom))] md:inset-x-0 md:bottom-4"
    >
      <div
        data-glass-mini-audio
        className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-white/10 p-2.5 pr-2 md:w-[24rem]"
        style={{ background: 'var(--float-glass)', backdropFilter: 'var(--float-glass-blur)', WebkitBackdropFilter: 'var(--float-glass-blur)', boxShadow: '0 12px 36px rgb(0 0 0 / 0.16)' }}
      >
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t('liveMini.openLive', 'Open live')}>
          <span className="size-9 shrink-0 overflow-hidden rounded-xl bg-white/10">
            {mini.avatar ? <img src={mini.avatar} alt="" className="h-full w-full object-cover" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-5 text-white">{mini.title || mini.host}</span>
            <span className="flex items-center gap-1.5 truncate text-[11px] leading-4 text-white/55">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: '#EF4444' }} />
              <span className="truncate">{`${t('stages.liveBadge', 'LIVE')} · ${mini.host}`}</span>
            </span>
          </span>
        </button>
        <button type="button" onClick={onShowPicture} className={ON_BAR} aria-label={t('liveMini.showPicture', 'Show picture')} title={t('liveMini.showPicture', 'Show picture')}>
          <Video className="size-4" />
        </button>
        <button
          type="button"
          onClick={onTogglePlay}
          className={ON_BAR}
          aria-label={playing ? t('liveMini.pause', 'Pause') : t('liveMini.play', 'Play')}
          title={playing ? t('liveMini.pause', 'Pause') : t('liveMini.play', 'Play')}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-white/50 [@media(hover:hover)]:hover:text-white transition-colors"
          aria-label={t('liveMini.close', 'Close live')}
          title={t('liveMini.close', 'Close live')}
        >
          <X className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}

export default LiveMiniPlayer;
