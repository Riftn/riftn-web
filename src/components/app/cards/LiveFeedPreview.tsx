import { LiveDot } from '@/components/app/live/LiveDot';
import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Live Feed Preview
 * =================
 * The picture a live post shows IN THE FEED. Until this existed the feed drew
 * a poster frame (often a stock fallback, because a MediaMTX stream renders no
 * thumbnail) and the stream itself only appeared after a click-through to the
 * post page — so a live post read as an empty card while it was on air.
 *
 * Deliberately not LiveStreamCard: that card is the full room (WHEP, tips,
 * chat, shop, host controls). This is the cheap half — muted, inline, and only
 * while the card is actually visible.
 *
 * ── Why this plays WebRTC rather than HLS ──
 *
 * It used to be HLS-only, and the post page has always preferred WHEP. That
 * split was the whole bug: the self-hosted ingest is a remuxer, so a broadcast
 * published over WebRTC keeps its OPUS audio in the HLS ladder
 * (`CODECS="avc1.42c01e,opus"`). Safari's native HLS does not decode Opus, so
 * a live card there played nothing and painted decoder garbage over the tile,
 * while the same stream opened fine on the post page one tap away — which is
 * exactly what a viewer reported. Same picture, same stream, different
 * transport.
 *
 * So: WHEP first, the way the post page does it, with HLS kept as the fallback
 * for Livepeer streams and for anywhere WebRTC cannot go. A self-hosted stream
 * never falls back to NATIVE HLS — that combination is the one that produces
 * the garbage — it uses hls.js where MSE exists and otherwise shows the poster.
 */

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { nativeLiveEdge, watchLiveProgress } from '@/lib/live/stall-watchdog';
import { forgetWhepSilent, hasRealPicture, rememberWhepRouteBlocked, rememberWhepSilent, whepRecentlySilent, whepRouteBlocked } from '@/lib/live/whep-memory';
import { dropWarmLiveHls, SLOW_KEYFRAME_SEC, takeWarmLiveHls, warmLiveHls } from '@/lib/live/hls-standby';
import { useFeedPlaybackAllowed, useLivePlaybackAllowed, visualActivity } from '@/lib/visual-activity';
import { useLocation } from 'react-router-dom';
import type Hls from 'hls.js';
import { LiveEndedMedia } from './LiveEndedMedia';
import { ButtonLoader } from '../DeHubLoader';
import {
  liveSourceFromHlsUrl,
  whepEndpointFor,
  isAacCopyUrl,
  isBigEventPlayback,
  BIG_EVENT_HLS_CONFIG,
} from '@/lib/live-ingest';
import type { WhepSubscription } from '@/lib/livepeer/whep';
import { snapshot, stashLiveSession } from '@/lib/live-handoff';
import { openLiveMini } from '@/lib/live-mini';
import type { PreviewAudienceHandoff } from '../live/live-audience-profile';
import { Minimize, PictureInPicture2 } from "lucide-react";
import Volume2 from "@/components/ui/cut-icons/volume";
import VolumeX from "@/components/ui/cut-icons/mute";
import Maximize from "@/components/ui/cut-icons/fullscreen";

import Play from "@/components/ui/cut-icons/play";
import Pause from "@/components/ui/cut-icons/pause";

import { useVideoFullscreen } from '@/hooks/use-video-fullscreen';
import { usePictureInPicture } from '@/hooks/use-picture-in-picture';
import { isVideoInPictureInPicture, releaseAfterPictureInPicture } from '@/lib/picture-in-picture';
import { useStreamPresence } from '@/hooks/use-stream-presence';
import { LiveReactionFlow, type SelfReaction } from '@/components/app/live/LiveReactionFlow';
import { useAuth } from '@/contexts/AuthContext';
import { useLivePlaybackFeedback } from '@/hooks/use-live-playback-feedback';

interface LiveFeedPreviewProps {
  /** Above the fold: load the cover now (it can be the LCP). */
  eager?: boolean;
  streamId?: string;
  streamStatus?: string;
  creatorId?: string;
  isOwner?: boolean;
  selfReaction?: SelfReaction | null;
  onViewerCount?: (count: number) => void;
  /** HLS ladder for the stream. First playable URL wins. */
  urls: (string | undefined)[];
  /** Poster frame, shown until the first video frame lands. */
  thumbnail?: string;
  className?: string;
  /** Chip shown when there is nothing playable. */
  fallbackLabel?: string;
  /**
   * The card's sound switch. The preview autoplays, which the browser only
   * allows muted, so it starts silent either way — but the element used to be
   * hard-coded `muted`, which meant the card's own button flipped its icon
   * and changed nothing. A viewer who pressed Unmute on a live card heard
   * nothing and had no way to know why.
   */
  muted?: boolean;
  controlsVisible?: boolean;
  onToggleMute?: (event: React.MouseEvent) => void;
  audienceHandoff?: Ref<PreviewAudienceHandoff>;
}

/** A negotiated session that never delivers a frame is the worst case. */
const WHEP_START_TIMEOUT_MS = 3500;
/** Once the server has answered, the connection is up in about half a second or not at all. */
const WHEP_CONNECT_TIMEOUT_MS = 2000;
/**
 * hls.js settings for a feed tile, shared by the standby and the player. A
 * tile's standby stops at the playlists: a feed can scroll past many lives,
 * and video nobody ends up watching is the viewer's data.
 */
const FEED_HLS_CONFIG = { lowLatencyMode: true, backBufferLength: 10, startFragPrefetch: false } as const;
/** A playlist that is a beat late is retried before the tile gives up. */
const HLS_RETRY_DELAYS_MS = [1000, 3000];

/**
 * Concurrent WebRTC sessions this page will hold for feed previews.
 *
 * A grid of live cards can have several on screen at once, and the reason the
 * feed was not already doing this is the cost of one peer connection per card.
 * Two covers the case that matters — the card someone is looking at, and the
 * one arriving as they scroll — and anything past it keeps the poster.
 */
const MAX_CONCURRENT_WHEP = 2;
let whepSessionsOpen = 0;

/** Feed rule, except an audible live keeps going behind another tab. */
function mayPlayNow(el: HTMLVideoElement, muted: boolean): boolean {
  return visualActivity.isFeedPlaybackAllowed() || isVideoInPictureInPicture(el) || (!muted && visualActivity.isLivePlaybackAllowed());
}

export function LiveFeedPreview({ eager = false, urls, thumbnail, className, fallbackLabel, muted = true, controlsVisible = false, onToggleMute, streamId, streamStatus, creatorId, isOwner, selfReaction, onViewerCount, audienceHandoff }: LiveFeedPreviewProps) {
  const { t: _copy } = _useCopy();
  const { pathname } = useLocation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inPiP = usePictureInPicture(videoRef);
  const postOpen = /^\/app\/post\//.test(pathname) && !inPiP;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { isFullscreen, toggleFullscreen } = useVideoFullscreen(videoRef, containerRef, { escapeAncestors: true });
  const [paused, setPaused] = useState(true);
  // Applied imperatively as well as through the prop: React only writes the
  // `muted` property on mount, and the element is re-attached when the
  // transport moves from WebRTC to HLS.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  });
  const hlsRef = useRef<Hls | null>(null);
  const [intersecting, setVisible] = useState(false);
  const playbackAllowed = useFeedPlaybackAllowed();
  // A live someone has turned the sound up on is being listened to: switching
  // tabs or clicking into another window must not hang it up (and drop them
  // from the room). A muted preview still lets go, as every feed video does.
  const livePlaybackAllowed = useLivePlaybackAllowed();
  const visible = (intersecting && (playbackAllowed || (!muted && livePlaybackAllowed))) || (inPiP && !visualActivity.isCallBusy());
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const { broadcastPaused, broadcastEnded, waitingTooLong } = useLivePlaybackFeedback(streamId, loading, visible && !postOpen, streamStatus);
  const broadcastPausedRef = useRef(broadcastPaused);
  broadcastPausedRef.current = broadcastPaused;
  const wasBroadcastPaused = useRef(broadcastPaused);
  useEffect(() => {
    if (wasBroadcastPaused.current && !broadcastPaused) setFailed(false);
    wasBroadcastPaused.current = broadcastPaused;
  }, [broadcastPaused]);
  const { walletAddress } = useAuth();
  const ownStream = isOwner || (!!walletAddress && walletAddress.toLowerCase() === creatorId?.toLowerCase());
  const watching = visible && !postOpen && !failed && playing && !paused;
  const viewerCount = useStreamPresence(streamId, watching && !ownStream);
  useEffect(() => {
    if (viewerCount != null) onViewerCount?.(viewerCount);
  }, [viewerCount, onViewerCount]);

  const src = urls.find((u): u is string => !!u && u.includes('.m3u8'));
  const source = useMemo(() => liveSourceFromHlsUrl(src), [src]);
  const selfHosted = source?.provider === 'mediamtx';
  // A big event is HLS everywhere, the feed included — a WebRTC session per
  // card is the per-viewer cost that mode exists to avoid.
  const bigEvent = isBigEventPlayback(src);
  const takeWhepSession = useRef<(() => WhepSubscription | null) | null>(null);
  useImperativeHandle(audienceHandoff, () => async (live) => {
    const video = videoRef.current;
    if (!video || video.paused || !streamId || !src || broadcastPaused || broadcastEnded) return;
    const location = window.location.href;
    const presence = ownStream ? null : await import('@/lib/api/dehub/stream-presence').catch(() => null);
    if (videoRef.current !== video || video.paused || window.location.href !== location) return;
    const ladder = [...new Set(urls.filter((url): url is string => !!url && url.includes('.m3u8')))];
    openLiveMini({
      ...live,
      streamId,
      playbackId: source?.playbackId ?? null,
      urls: ladder,
      session: takeWhepSession.current?.() ?? null,
      poster: snapshot(video),
      seat: presence?.joinStreamPresence(streamId) ?? null,
    });
    if (isFullscreen) toggleFullscreen();
  }, [streamId, src, source, urls, ownStream, broadcastPaused, broadcastEnded, isFullscreen, toggleFullscreen]);

  // One WebRTC attempt per card: the transport only ever moves whep → hls, so
  // a failure cannot trade the element back and forth with the ladder.
  const [transport, setTransport] = useState<'whep' | 'hls'>(
    // The preview only has the direct route: on a network seen to drop its
    // media, the ladder shows a picture without the wait.
    !bigEvent && typeof RTCPeerConnection !== 'undefined' && !!source && !whepRecentlySilent(source.playbackId) && !(selfHosted && whepRouteBlocked('direct')) ? 'whep' : 'hls',
  );

  // Only attach while the card is on screen. A feed can hold dozens of live
  // cards; each attached session is a rolling download either way.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0.25),
      { threshold: [0, 0.25, 0.6] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);

  // ── WebRTC ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (transport !== 'whep' || !visible || postOpen || failed || !source || broadcastEnded) return;
    const el = videoRef.current;
    if (!el) return;
    if (whepSessionsOpen >= MAX_CONCURRENT_WHEP) {
      setTransport('hls');
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    let session: WhepSubscription | null = null;
    let handedOffSession: WhepSubscription | null = null;
    const takeSession = () => {
      if (!session || handedOffSession || el.srcObject !== session.stream) return null;
      handedOffSession = session;
      return session;
    };
    takeWhepSession.current = takeSession;
    setLoading(true);
    whepSessionsOpen += 1;

    const fallBack = () => {
      if (cancelled) return;
      setTransport('hls');
    };

    // Negotiated but silent: no error to catch and nothing on screen.
    const timer = setTimeout(() => {
      if (cancelled) return;
      if (hasRealPicture(el)) { forgetWhepSilent(source.playbackId); return; }
      rememberWhepSilent(source.playbackId);
      fallBack();
    }, WHEP_START_TIMEOUT_MS);

    // HLS is made ready in the background while WebRTC tries, so a fallback
    // plays from what is already loaded. Its playlist also says how far apart
    // the keyframes are: WebRTC can only start on one, so on a stream that
    // sends them seconds apart HLS shows a picture first.
    const nativeHls = (!selfHosted || isAacCopyUrl(src)) && !!el.canPlayType('application/vnd.apple.mpegurl');
    if (!nativeHls) {
      warmLiveHls(src, FEED_HLS_CONFIG, (segmentSeconds) => {
        if (cancelled || segmentSeconds < SLOW_KEYFRAME_SEC || hasRealPicture(el)) return;
        rememberWhepSilent(source.playbackId);
        fallBack();
      });
    }
    const onPicture = () => {
      if (el.srcObject && hasRealPicture(el)) dropWarmLiveHls(src);
    };
    const stopWatch = watchLiveProgress(el, {
      stallMs: 6000,
      preferVideoFrames: () => true,
      shouldWatch: () => !broadcastPausedRef.current && !!el.srcObject && hasRealPicture(el),
      onStall: fallBack,
    });
    el.addEventListener('resize', onPicture);
    el.addEventListener('loadeddata', onPicture);

    let connected = false;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    const start = async () => {
      try {
        const { subscribeToWhep } = await import('@/lib/livepeer/whep');
        if (cancelled) return;
        session = await subscribeToWhep({
          playbackId: source.playbackId,
          endpoint: whepEndpointFor({
            provider: source.provider,
            playbackId: source.playbackId,
          }),
          signal: controller.signal,
          onStateChange: (state) => {
            if (cancelled) return;
            if (state === 'playing') { connected = true; clearTimeout(connectTimer); }
            else if (state === 'failed') fallBack();
          },
        });
        if (cancelled) {
          await session.stop();
          return;
        }
        if (!connected) {
          connectTimer = setTimeout(() => {
            if (cancelled || connected) return;
            // Answered, and the media never arrived: this network does not
            // carry WebRTC directly. Skip it for a while, on every stream.
            if (selfHosted) rememberWhepRouteBlocked('direct');
            fallBack();
          }, WHEP_CONNECT_TIMEOUT_MS);
        }
        el.srcObject = session.stream;
        await el.play().catch(() => { if (!cancelled) setLoading(false); });
        if (!handedOffSession && el.srcObject === session.stream && (cancelled || !mayPlayNow(el, mutedRef.current))) el.pause();
      } catch (e) {
        if (cancelled) return;
        // The server said no (a stream WebRTC cannot carry): HLS from now on.
        // Not for a 404, which is a stream between two broadcasts.
        if ((e as Error)?.name === 'WhepRefusedError' && (e as { status?: number }).status !== 404) {
          rememberWhepSilent(source.playbackId);
        }
        fallBack();
      }
    };

    void start();

    return () => {
      cancelled = true;
      controller.abort();
      if (takeWhepSession.current === takeSession) takeWhepSession.current = null;
      clearTimeout(timer);
      clearTimeout(connectTimer);
      stopWatch();
      el.removeEventListener('resize', onPicture);
      el.removeEventListener('loadeddata', onPicture);
      whepSessionsOpen = Math.max(0, whepSessionsOpen - 1);
      if (handedOffSession) {
        if (el.srcObject === handedOffSession.stream) el.srcObject = null;
        return;
      }
      // Leaving for the post page while the picture is up: hand the running
      // session over instead of hanging up, so the post page carries on from
      // this frame rather than reconnecting from black.
      releaseAfterPictureInPicture(el, () => {
      if (session && el.videoWidth && /^\/app\/post\//.test(window.location.pathname)) {
        stashLiveSession(source.playbackId, session, el);
      } else {
        void session?.stop();
      }
      // A dead srcObject left attached stops HLS ever getting a picture onto
      // this element.
      if (session && el.srcObject === session.stream) el.srcObject = null;
      });
    };
    // src and selfHosted follow `source`; listing them would only restart a playing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, visible, postOpen, failed, source, broadcastEnded]);

  // ── HLS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = videoRef.current;
    if (transport !== 'hls' || !el || !src || !visible || postOpen || failed || broadcastEnded) return;
    let cancelled = false;
    let stopWatch: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);

    const attach = async () => {
      // Native HLS is Safari's path, and it is the right one for a Livepeer
      // stream (AAC audio). It is the WRONG one for the self-hosted ingest's
      // original ladder, which carries Opus: Safari cannot decode it and
      // paints garbage rather than failing. The server's AAC copy — what a
      // browser without Opus is handed — plays natively like Livepeer's.
      if ((!selfHosted || isAacCopyUrl(src)) && el.canPlayType('application/vnd.apple.mpegurl')) {
        el.src = src;
        // Safari's native HLS never recovers a stalled live playlist on its
        // own: jump to the live edge, then reload, instead of a frozen tile.
        stopWatch = watchLiveProgress(el, {
          stallMs: 8000,
          onStall: (count) => {
            const edge = count === 1 ? nativeLiveEdge(el) : null;
            if (edge != null && edge > el.currentTime + 1) el.currentTime = edge;
            else { el.src = src; el.load(); }
            void el.play().catch(() => undefined);
          },
        });
      } else {
        // Made ready while WebRTC was trying, when it was.
        const warmed = await (takeWarmLiveHls(src) ?? null);
        if (cancelled) {
          warmed?.hls.destroy();
          return;
        }
        const { default: HlsCtor } = warmed ? { default: warmed.Hls } : await import('hls.js');
        if (cancelled || !HlsCtor.isSupported()) {
          // No MSE — iOS before Managed Media Source. WebRTC was the only way
          // in and it did not get there; show the poster, never a broken tile.
          if (!cancelled) setFailed(true);
          return;
        }
        const hls = warmed?.hls ?? new HlsCtor({
          ...FEED_HLS_CONFIG,
          ...(bigEvent ? BIG_EVENT_HLS_CONFIG : {}),
        });
        hlsRef.current = hls;
        let retries = 0;
        hls.on(HlsCtor.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          // A playlist that answers late (the server is still cutting the
          // first segments) is a beat away from working: ask again before
          // giving the tile up.
          if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && retries < HLS_RETRY_DELAYS_MS.length) {
            const delay = HLS_RETRY_DELAYS_MS[retries++];
            retryTimer = setTimeout(() => {
              if (cancelled || hlsRef.current !== hls) return;
              hls.loadSource(src);
              hls.startLoad();
            }, delay);
            return;
          }
          // A stream that has stopped publishing 404s its playlist. Fall back
          // to the poster rather than retrying a source that is gone.
          hls.destroy();
          hlsRef.current = null;
          if (!cancelled) setFailed(true);
        });
        if (!warmed) hls.loadSource(src);
        hls.attachMedia(el);
      }
      void el.play().then(() => {
        if (cancelled || (!mayPlayNow(el, mutedRef.current))) el.pause();
      }).catch(() => { if (!cancelled) setLoading(false); });
    };

    void attach().catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      stopWatch?.();
      clearTimeout(retryTimer);
      const hls = hlsRef.current;
      hlsRef.current = null;
      releaseAfterPictureInPicture(el, () => {
        hls?.destroy();
        el.removeAttribute('src');
        el.load();
      });
    };
  }, [transport, src, visible, postOpen, failed, selfHosted, bigEvent, broadcastEnded]);

  if (broadcastEnded) return <LiveEndedMedia thumbnail={thumbnail} />;

  const liveBadge = !broadcastPaused && (
    <span data-on-media className="pointer-events-none absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-black/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
      <LiveDot />
      {_copy("copy.35e0d0360a0a", { defaultValue: "LIVE" })}
    </span>
  );

  if (!src) {
    return (
      <div className="absolute inset-0">
        <LiveEndedMedia thumbnail={thumbnail} label={fallbackLabel} />
        {liveBadge}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={isFullscreen ? 'fixed inset-0 z-[9999] w-screen h-screen bg-black' : className ?? 'absolute inset-0 w-full h-full'}>
      {(!playing || failed) &&
        (thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
            loading={eager ? 'eager' : 'lazy'}
          />
        ) : (
          /* No cover — the normal case for a stream published from an encoder,
             which has no browser sending poster frames. Without something here
             the card is a bare <video> with no poster: an empty box for as long
             as the connection takes to open, and permanently when autoplay is
             refused. The static screen says what the card is instead, and is
             replaced by the first frame. */
          <LiveEndedMedia label={fallbackLabel} />
        ))}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full ${isFullscreen ? 'object-contain' : 'object-cover'}`}
        muted={muted}
        playsInline
        autoPlay
        preload="none"
        poster={thumbnail}
        onPlaying={(e) => {
          if (!mayPlayNow(e.currentTarget, mutedRef.current)) { e.currentTarget.pause(); return; }
          setPlaying(true); setPaused(false); setLoading(false);
        }}
        onWaiting={() => setLoading(true)}
        onPause={() => { setPaused(true); setLoading(false); }}
        onEnded={() => { setPaused(true); setPlaying(false); setLoading(false); }}
      />
      {liveBadge}
      <LiveReactionFlow streamId={streamId} enabled={visible && !postOpen} self={selfReaction} bottom={56} />
      {visible && !postOpen && (loading || broadcastPaused || failed || (paused && playing)) && (
        <div role="status" aria-label={broadcastPaused || (paused && playing) ? _copy("copy.91b75d1b48f9", { defaultValue: "Live paused" }) : failed || waitingTooLong ? _copy("copy.510db6ad26be", { defaultValue: "Waiting for live video" }) : _copy("copy.dc380888c4e2", { defaultValue: "Loading" })} className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {broadcastPaused || (paused && playing) || waitingTooLong || failed
            ? <span className="rounded-xl bg-black/75 px-4 py-2 text-sm text-white">{broadcastPaused || (paused && playing) ? _copy("copy.91b75d1b48f9", { defaultValue: "Live paused" }) : _copy("copy.510db6ad26be", { defaultValue: "Waiting for live video" })}</span>
            : <ButtonLoader size={40} className="!filter-none" />}
        </div>
      )}
      {(controlsVisible || isFullscreen) && (
        <div data-video-controls className="absolute bottom-0 inset-x-0 z-10 flex items-center gap-2 px-3 pb-3 pt-6 bg-gradient-to-t from-black/80 to-transparent" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label={paused ? _copy("copy.436e61016e26", { defaultValue: "Play" }) : _copy("copy.858e4ba7a29f", { defaultValue: "Pause" })} className="h-8 w-8 rounded-xl bg-black/40 border border-white/10 text-white flex items-center justify-center" onClick={() => {
            const el = videoRef.current;
            if (!el) return;
            if (failed) { setFailed(false); return; }
            if (el.paused) {
              setLoading(true);
              void el.play().catch(() => { setPaused(true); setLoading(false); });
            }
            else el.pause();
          }}>
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <div className="flex-1" />
          {onToggleMute && <button type="button" aria-label={muted ? _copy("copy.ce4ee4efc5e3", { defaultValue: "Unmute" }) : _copy("copy.8dd6857baf02", { defaultValue: "Mute" })} onClick={onToggleMute} className="h-8 w-8 rounded-xl bg-black/40 border border-white/10 text-white flex items-center justify-center">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>}
          {document.pictureInPictureEnabled && <button type="button" aria-label={_copy("copy.c49677dc5ccd", { defaultValue: "Picture in picture" })} className="h-8 w-8 rounded-xl bg-black/40 border border-white/10 text-white flex items-center justify-center" onClick={() => {
            if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
            else void videoRef.current?.requestPictureInPicture().catch(() => undefined);
          }}><PictureInPicture2 className="h-4 w-4" /></button>}
          <button type="button" aria-label={isFullscreen ? _copy("copy.37fd4e355ba3", { defaultValue: "Exit fullscreen" }) : _copy("copy.c461dbb2bab7", { defaultValue: "Fullscreen" })} onClick={() => toggleFullscreen()} className="h-8 w-8 rounded-xl bg-black/40 border border-white/10 text-white flex items-center justify-center">
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
