import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Video Slide Component
 * =====================
 * Individual video slide for the vertical carousel shorts viewer.
 * Handles its own playback, aspect ratio detection, and liquid glass background.
 * 
 * @module components/app/cards/VideoSlide
 */

import { useRef, useEffect, useState, useCallback, useContext, memo, lazy, Suspense, useId } from 'react';
import { useFeedPlaybackAllowed } from '@/lib/visual-activity';
import { usePlaybackRecovery } from '@/hooks/use-playback-recovery';
import { requestVideoPlayback } from '@/lib/video-start';
import { visualActivity } from '@/lib/visual-activity';
import { usePictureInPicture } from '@/hooks/use-picture-in-picture';
import { isVideoInPictureInPicture, releaseAfterPictureInPicture } from '@/lib/picture-in-picture';
const ShortsPhotoPager = lazy(() => import('./ShortsPhotoPager').then(m => ({ default: m.ShortsPhotoPager })));
import { createPortal } from 'react-dom';
import { Loader2 } from "lucide-react";
import { formatDuration } from '@/lib/feed-utils';
import Play from "@/components/ui/cut-icons/play";
import Pause from "@/components/ui/cut-icons/pause";

import { motion } from 'framer-motion';
import type { ShortVideo } from '@/types/feed.types';
import { cn } from '@/lib/utils';
import { useResolvedThumbnail } from '@/lib/thumbnail-fallback';
import { ShortsLiveGlow } from '@/components/app/video/ShortsLiveGlow';
import { usePinchZoom } from '@/hooks/use-pinch-zoom';
import { useTapGestures } from '@/hooks/use-tap-gestures';
import { useShortsSideGestures } from '@/hooks/use-shorts-side-gestures';
import { useTranslation } from 'react-i18next';
import { TapReactionBurst } from '@/components/app/cards/TapReactionBurst';
import { StoryboardPreview } from '@/components/app/video/StoryboardPreview';
const VideoSubtitleOverlay = lazy(() =>
  import('@/components/app/video/VideoSubtitleOverlay').then((m) => ({ default: m.VideoSubtitleOverlay })),
);
const TranscodeRetry = lazy(() => import('./TranscodeRetry').then(m => ({ default: m.TranscodeRetry })));
import { useVideoProcessingStatus } from '@/hooks/use-video-processing-status';
import { useHandoffVideo } from '@/hooks/use-handoff-video';
import { AuthContext } from '@/contexts/AuthContext';
import { isVideoAccessExpiring, useResumeAcrossRefresh, useVideoAccess } from '@/lib/api/dehub/video-access';
import { useMediaLooping } from '@/lib/video-preferences';
import { bindSoundWindow } from '@/lib/sound-window';

interface VideoSlideProps {
  short: ShortVideo;
  isActive: boolean;
  handoffKey?: string;
  isMuted: boolean;
  /** The browser refused sound, so this short started silent. */
  onAutoMuted?: () => void;
  playbackRate?: number;
  onTimeUpdate?: (currentTime: number, duration: number, loops?: boolean) => void;
  /** The video played to its end (loop off), so the viewer can move on. */
  onEnded?: () => void;
  /**
   * The viewer's control row: the playing short puts its subtitles (CC)
   * button in here, as the feed player does.
   */
  captionSlot?: HTMLElement | null;
  /** Gets the tap itself, so the viewer can tell the centre from the edges. */
  onTap?: (event?: React.PointerEvent) => void;
  /**
   * Reverses `onTap` silently. Supplying it is what lets the first tap act
   * immediately instead of waiting 260ms to see whether a second is coming —
   * see useTapGestures.
   */
  onTapUndo?: () => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  showPlayIndicator?: 'play' | 'pause' | null;
  /**
   * When true, never crop the video: fit the whole frame with `object-contain`
   * over a blurred liquid-glass fill, whatever the aspect ratio. Used on desktop
   * so off-9:16 portrait videos (4:5, 3:4, …) don't get their sides sheared off
   * by `object-cover`. Mobile stays full-bleed (phone-native) and leaves this off.
   */
  letterbox?: boolean;
  /**
   * Phones only. What surrounds a video that does not fill the screen: 'glow'
   * is light drawn from the playing picture (ShortsLiveGlow), 'floor' is its
   * mirror image underneath, 'clean' is the plain theme backdrop with the
   * picture as a rounded card. Left unset
   * (desktop), the blurred cover fill stays.
   */
  phoneStage?: 'glow' | 'clean' | 'floor';
  /** Space kept clear above the picture (the info stage's top buttons). */
  stageInsetTop?: number;
  /** The video's width over its height, once known. */
  onRatio?: (ratio: number) => void;
  /**
   * Buffering hint for the underlying <video>. The viewer sets this to `'auto'`
   * for the active slide *and the next one* so the neighbour is already buffered
   * when you swipe to it (no cold-load lag on landing), and `'metadata'` for
   * slides further out. Defaults to the old isActive-based behaviour.
   */
  preload?: 'auto' | 'metadata' | 'none';
  /** Only tells the frame to fit the whole video; the control lives in the viewer. */
  isFullscreen?: boolean;
  /**
   * Where to paint the progress bar, if not in place.
   *
   * The viewer's action bar lays a 96px `from-black/80` gradient across the
   * bottom of the video container, and it is a sibling of the carousel, so it
   * paints over everything inside a slide — including this bar, which is what
   * "the action bar shadows over the scroll line" was. The bar cannot simply
   * out-z-index it: each slide is its own stacking context, so nothing inside
   * one can reach past the container's own layers.
   *
   * Given the container element, the *visual* bar is portalled there instead
   * and sits above the gradient. The seek zone stays put — the gradient is
   * `pointer-events-none`, so clicks were always reaching it, and hoisting the
   * zone as well would park a 15%-tall target on top of the action buttons.
   */
  progressLayer?: HTMLElement | null;
  /**
   * A slot in the viewer's bottom stack that takes the whole scrubber, touch
   * area and all. On phones the line on the frame's bottom edge sits inside
   * the strip iOS keeps for its own home gesture, so a drag there switched
   * apps instead of seeking. In the slot it is clear of that strip, a finger
   * tall, and grows a glass lens under the finger.
   */
  seekLayer?: HTMLElement | null;
  /**
   * What to play instead of `short.videoUrl`: a signed URL for a gated short,
   * `null` while it is fetched or when the viewer is refused one.
   */
  playbackSrc?: string | null;
  /** Called when playback fails for good, so a lapsed signature can be renewed. */
  onPlaybackFailed?: () => void;
  /**
   * Phones only: hold the left/right third to rewind/fast forward, double tap
   * them to jump 10s. See useShortsSideGestures.
   */
  sideGestures?: boolean;
  /** A side hold owns the finger, so the pager must not page under it. */
  onHoldChange?: (active: boolean) => void;
}

const VideoSlideBody = memo(function VideoSlideBody({
  short,
  isActive: activeSlide,
  handoffKey,
  isMuted,
  onAutoMuted,
  playbackRate = 1,
  onTimeUpdate,
  onEnded,
  captionSlot = null,
  onTap,
  onTapUndo,
  onSeekStart,
  onSeekEnd,
  showPlayIndicator,
  letterbox = false,
  phoneStage,
  stageInsetTop = 0,
  onRatio,
  preload,
  isFullscreen = false,
  progressLayer = null,
  seekLayer = null,
  playbackSrc,
  onPlaybackFailed,
  sideGestures = false,
  onHoldChange,
}: VideoSlideProps) {
  const { t: _copy } = _useCopy();
  const isLooping = useMediaLooping();
  const playbackAllowed = useFeedPlaybackAllowed();
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const inPiP = usePictureInPicture(videoRef);
  const isActive = (activeSlide && playbackAllowed) || (inPiP && !visualActivity.isCallBusy());
  const transcodingStatus = useVideoProcessingStatus(short.id, short.transcodingStatus, isActive);
  // Native media play requests may settle after React has already advanced the
  // carousel. Keep the latest ownership state available to those callbacks so
  // a slide that has left the active position can never restart itself.
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  // Shorts thumbnails may live at shorts/{id}.jpg instead of the mapped
  // images/{id}.jpg — resolve to whichever exists so the poster isn't a 403.
  const thumbnail = useResolvedThumbnail(short.thumbnail);
  const [videoAspect, setVideoAspect] = useState<'portrait' | 'landscape' | 'square'>('portrait');
  const [videoRatio, setVideoRatio] = useState(0);
  const playableSrc = short.soundtrackUrl || (playbackSrc !== undefined ? playbackSrc || undefined : short.videoUrl);
  // A photo short plays its song in this element: keep it to the part the
  // poster picked.
  useEffect(() => { if (short.soundtrackUrl) bindSoundWindow(videoRef.current); }, [short.soundtrackUrl]);
  // A short that mounts off screen (the next one) starts its ladder on the
  // lowest rung, so its first segment is small and lands before the swipe;
  // the player steps up once it plays.
  const [startLow] = useState(() => !isActive);
  const playbackPhase = usePlaybackRecovery(videoRef, playableSrc, isActive, {
    component: 'ShortsViewer', postId: short.id,
    allowed: () => isActiveRef.current && !visualActivity.isCallBusy(),
  });
  // Swiping fast on iPhone hands each new short to a fresh player the
  // browser will not start with sound. Start it silent instead of stopping on
  // a Play button; the viewer's speaker shows muted until they tap it.
  useEffect(() => {
    const video = videoRef.current;
    if (playbackPhase !== 'blocked' || !isActive || !video || video.muted) return;
    video.muted = true;
    onAutoMuted?.();
    void requestVideoPlayback(video).catch(() => {});
  }, [playbackPhase, isActive, onAutoMuted]);
  useEffect(() => {
    if (playbackPhase === 'failed') onPlaybackFailed?.();
  }, [playbackPhase, onPlaybackFailed]);
  const [progress, setProgress] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  // A finger is down on the scrubber, before it has moved enough to seek.
  const [seekPressed, setSeekPressed] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  /**
   * Tap handling on the video area.
   *
   * A single tap plays/pauses (that is `onTap`, owned by the viewer) and a
   * double tap in the middle toggles fullscreen — the same split VideoCard's
   * immersive mode uses, so the gesture means the same thing on both players.
   *
   * Only a tap inside the centre band pays the 300ms wait needed to tell one
   * tap from two. Outside it there is no double-tap to disambiguate, so
   * play/pause still fires instantly — which is most of the frame, and keeps
   * the viewer feeling as immediate as it did before.
   */
  /**
   * The tap ladder on a short: double 👍, triple ❤️, hold for the tray. Every
   * platform, so the gesture means the same thing here as on every other feed
   * surface — a short IS a feed, just a vertical one.
   *
   * Desktop used to spend the centre double-tap on fullscreen instead. One
   * gesture cannot mean two things, and reacting is the far more frequent
   * intent, so fullscreen keeps its button and gives the gesture up.
   *
   * ShortsViewer owns the listener for these, since it renders no ActionBar.
   */
  const tapGestures = useTapGestures({
    postId: short.id,
    // Play/pause is a toggle, so it can fire on the first tap and be toggled
    // straight back if a second one turns up — no 260ms wait to find out. The
    // video never visibly pauses on a double tap, and tap-to-pause stays as
    // instant as it was before the ladder existed.
    onSingleTap: (event) => onTap?.(event),
    onUndoSingleTap: () => (onTapUndo ?? onTap)?.(),
  });
  const side = useShortsSideGestures(tapGestures, {
    enabled: sideGestures && !short.imageUrls?.length,
    isActive,
    videoRef,
    playbackRate,
    onSingleTap: event => onTap?.(event),
    onUndoSingleTap: () => (onTapUndo ?? onTap)?.(),
    onHoldChange,
  });

  // Handle video metadata load to detect aspect ratio
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const { videoWidth, videoHeight } = videoRef.current;
      if (videoWidth && videoHeight) {
        const ratio = videoWidth / videoHeight;
        setVideoRatio(ratio);
        if (ratio > 1.1) {
          setVideoAspect('landscape');
        } else if (ratio < 0.9) {
          setVideoAspect('portrait');
        } else {
          setVideoAspect('square');
        }
      }
    }
  }, []);

  // Start as soon as ownership changes, including during the slide transition.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      if (video.ended) video.currentTime = 0;
      // A short the viewer started silently while it was dragged in keeps
      // playing from where it is, with sound if the viewer has it on.
      delete video.dataset.shortsPeek;
      video.muted = isMutedRef.current;
      void requestVideoPlayback(video).catch(() => {});
    } else if (!video.dataset.shortsPeek) video.pause();
    return () => {
      // Becoming the active short is not a reason to stop it.
      if (!isActive && video.dataset.shortsPeek) return;
      releaseAfterPictureInPicture(video, () => video.pause());
    };
  }, [isActive, transcodingStatus]);

  const handlePlay = useCallback(() => {
    // Safari can complete an older play() request after pause(). Treat React's
    // active slide as the authority and immediately silence that stale start.
    // The short a drag is heading for plays ahead of becoming active
    // (ShortsViewer's peek); that start is wanted.
    const video = videoRef.current;
    if (!isActiveRef.current && !video?.dataset.shortsPeek && !isVideoInPictureInPicture(video)) video?.pause();
  }, []);

  // Update muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Update playback rate. The default rate is set too: loading a source (the
  // HLS ladder attaching after the handoff) puts playbackRate back to the
  // default, which left the button reading 1.5x over a video playing at 1x.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.defaultPlaybackRate = playbackRate;
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Handle time update for view tracking + progress
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && !isSeeking) {
      const ct = videoRef.current.currentTime;
      const dur = videoRef.current.duration;
      if (dur > 0) {
        setProgress(ct / dur);
        onTimeUpdate?.(ct, dur, videoRef.current.loop);
      }
    }
  }, [onTimeUpdate, isSeeking]);

  const slideId = useId();
  const fitWhole = letterbox || videoAspect !== 'portrait';
  // Photo slides sit on a plain theme backdrop: tall photos fill the screen, wide ones letterbox.
  const isPhotoSlide = !!short.imageUrls?.length;
  const glowStage = (phoneStage === 'glow' || phoneStage === 'floor') && fitWhole && !isPhotoSlide;
  const cleanStage = phoneStage === 'clean' && fitWhole && !isPhotoSlide;
  // Clean stage: the picture is a rounded card with a little room at the
  // sides. Cut on the slot's inner box, so taps above and below the picture
  // still reach the slot. Only once the shape is known and it is a wide clip
  // held upright; turned sideways or full screen it runs edge to edge.
  const cardClip = cleanStage && !isFullscreen && videoRatio > 1.1
    ? `inset(max(0px, calc((100cqh - (100cqw - 24px) / ${videoRatio.toFixed(4)}) / 2)) 12px round 16px)`
    : null;
  // Glow: the top and bottom few pixels of the picture melt into the light
  // around it, so there is no line where the video ends.
  const glowFeather = phoneStage === 'glow' && glowStage && !isFullscreen && videoRatio > 0
    ? (() => {
      const bar = `max(0px, calc((100cqh - 100cqw / ${videoRatio.toFixed(4)}) / 2))`;
      return `linear-gradient(to bottom, transparent ${bar}, #000 calc(${bar} + 18px), #000 calc(100cqh - ${bar} - 18px), transparent calc(100cqh - ${bar}))`;
    })()
    : null;
  const onRatioRef = useRef(onRatio);
  onRatioRef.current = onRatio;
  const reportsRatio = !!onRatio;
  useEffect(() => { if (videoRatio > 0 && reportsRatio) onRatioRef.current?.(videoRatio); }, [videoRatio, reportsRatio]);
  const pinch = usePinchZoom(!!phoneStage && !isPhotoSlide, onHoldChange);
  // Before the handoff assigns `src`, so a refreshed signature resumes in place.
  useResumeAcrossRefresh(videoRef, playableSrc || undefined);
  const { attachSlot } = useHandoffVideo({
    videoRef,
    handoffKey: handoffKey ?? `shorts:${slideId}`,
    watchTokenId: short.id,
    src: playableSrc || undefined,
    // A photo short's src is its soundtrack, and a gated short plays a signed
    // file; neither has a ladder.
    hlsSrc: short.soundtrackUrl || playbackSrc !== undefined ? undefined : short.hlsUrl,
    startLow,
    poster: thumbnail,
    muted: isMuted,
    loop: isLooping,
    preload: isActive ? 'auto' : preload ?? 'metadata',
    className: `shorts-inline-video pointer-events-none w-full h-full ${fitWhole || isFullscreen ? 'object-contain' : 'object-cover'} transition-none`,
    onTimeUpdate: handleTimeUpdate,
    onEnded,
    onLoadedMetadata: handleLoadedMetadata,
    onPlaybackChange: (playing) => {
      const video = videoRef.current;
      if (playing && video && video.playbackRate !== playbackRate) video.playbackRate = playbackRate;
      if (playing) handlePlay();
    },
    onAdopt: (video) => {
      video.controls = false;
      video.setAttribute('controlsList', 'nofullscreen noremoteplayback nodownload');
      video.disableRemotePlayback = true;
      video.muted = isMuted;
      video.loop = isLooping;
      video.defaultPlaybackRate = playbackRate;
      video.playbackRate = playbackRate;
      handleLoadedMetadata();
    },
  });

  // Seek to position from progress bar interaction
  const seekToPosition = useCallback((clientX: number) => {
    const bar = progressBarRef.current;
    const video = videoRef.current;
    if (!bar || !video || !video.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
    setProgress(ratio);
  }, []);

  // Use a ref to track seeking so native listeners always see latest value
  const isSeekingRef = useRef(false);
  // The in-flight gesture that started inside the seek strip. We stay 'pending'
  // until enough movement reveals whether it's a horizontal scrub or a vertical
  // navigation swipe.
  const gestureRef = useRef<{ x: number; y: number; id: number; mode: 'pending' | 'seek' | 'swipe' } | null>(null);

  // Native DOM listeners on the seek strip.
  //
  // The strip spans the bottom 15% of the frame full-width, so a big share of
  // vertical navigation swipes — especially on large phones where the thumb
  // rests low — actually *begin* here. The old code captured the pointer and
  // disabled the carousel drag the instant a finger touched the strip, so those
  // swipes did nothing at all ("scrolling up/down doesn't work"). Now we stay
  // hands-off until the gesture reveals its direction: a horizontal drag scrubs
  // the timeline; a vertical drag is left to bubble to the carousel's drag layer
  // so it navigates next/prev; a stationary tap seeks to the tapped point.
  useEffect(() => {
    const bar = progressBarRef.current;
    if (!bar) return;

    // Movement (px) required before we classify the gesture.
    const DECIDE_PX = 10;

    const stopAll = (e: Event) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    const beginSeek = (e: PointerEvent) => {
      isSeekingRef.current = true;
      setIsSeeking(true);
      onSeekStart?.();
      try { bar.setPointerCapture(e.pointerId); } catch { /* capture may be unavailable */ }
      seekToPosition(e.clientX);
    };

    const endSeek = (e: PointerEvent) => {
      isSeekingRef.current = false;
      setIsSeeking(false);
      onSeekEnd?.();
      if (bar.hasPointerCapture?.(e.pointerId)) {
        try { bar.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      }
    };

    const onDown = (e: PointerEvent) => {
      // NB: do NOT capture / stop the event here — a vertical swipe that starts
      // in this strip must still reach the carousel drag layer to navigate.
      gestureRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: 'pending' };
      setSeekPressed(true);
    };

    const onMove = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || g.id !== e.pointerId) return;

      if (g.mode === 'pending') {
        const dx = e.clientX - g.x;
        const dy = e.clientY - g.y;
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          // Vertical → hand it to the carousel for navigation, stay out of it.
          g.mode = 'swipe';
          return;
        }
        // Horizontal → this is a timeline scrub.
        g.mode = 'seek';
        stopAll(e);
        beginSeek(e);
        return;
      }

      if (g.mode === 'seek') {
        stopAll(e);
        seekToPosition(e.clientX);
      }
    };

    const onUp = (e: PointerEvent) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      setSeekPressed(false);

      if (g && g.mode === 'seek') {
        stopAll(e);
        endSeek(e);
        return;
      }

      // A stationary tap inside the strip seeks to that position.
      if (e.type === 'pointerup' && g && g.mode === 'pending') {
        const dx = Math.abs(e.clientX - g.x);
        const dy = Math.abs(e.clientY - g.y);
        if (dx < DECIDE_PX && dy < DECIDE_PX) seekToPosition(e.clientX);
      }
      // 'swipe' → the carousel already handled it.

      // Failsafe: never leave the carousel drag disabled.
      if (isSeekingRef.current) endSeek(e);
    };

    // Belt-and-suspenders: if a scrub's pointerup/cancel is ever lost (iOS
    // pointer-capture quirks), make sure isSeeking can't stick `true` and
    // permanently freeze navigation for the whole viewer session.
    const windowFailsafe = (e: PointerEvent) => {
      if (!isSeekingRef.current) return;
      const g = gestureRef.current;
      if (g && g.id !== e.pointerId) return; // a different finger — leave the scrub alone
      gestureRef.current = null;
      setSeekPressed(false);
      endSeek(e);
    };

    // A press that leaves the scrubber without ever becoming a seek.
    const releasePress = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || g.id !== e.pointerId || g.mode === 'seek') return;
      gestureRef.current = null;
      setSeekPressed(false);
    };

    const cancelSeek = () => {
      const g = gestureRef.current;
      gestureRef.current = null;
      setSeekPressed(false);
      if (!isSeekingRef.current) return;
      isSeekingRef.current = false;
      setIsSeeking(false);
      onSeekEnd?.();
      if (g && bar.hasPointerCapture?.(g.id)) {
        try { bar.releasePointerCapture(g.id); } catch { /* already released */ }
      }
    };

    // Capture can be taken away while the finger is still down: the carousel
    // lets go of the pointer when a scrub switches its drag off, and that
    // release lands on this element. A lift or a cancel clears the gesture
    // before this fires, so one still in flight here means the finger is
    // down: take the pointer back, and give up only if that is refused.
    const keepCapture = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (isSeekingRef.current && g && g.id === e.pointerId && g.mode === 'seek') {
        try { bar.setPointerCapture(g.id); return; } catch { /* the pointer is gone */ }
      }
      cancelSeek();
    };

    // Swallow the ghost click that follows a scrub.
    const blockClick = (e: Event) => { e.stopPropagation(); e.stopImmediatePropagation(); };

    bar.addEventListener('pointerdown', onDown, { capture: true });
    bar.addEventListener('pointermove', onMove, { capture: true });
    bar.addEventListener('pointerup', onUp, { capture: true });
    bar.addEventListener('pointercancel', onUp, { capture: true });
    bar.addEventListener('lostpointercapture', keepCapture);
    window.addEventListener('blur', cancelSeek);
    bar.addEventListener('click', blockClick, { capture: true });
    window.addEventListener('pointerup', windowFailsafe);
    window.addEventListener('pointercancel', windowFailsafe);
    window.addEventListener('pointerup', releasePress);
    window.addEventListener('pointercancel', releasePress);

    return () => {
      bar.removeEventListener('pointerdown', onDown, { capture: true });
      bar.removeEventListener('pointermove', onMove, { capture: true });
      bar.removeEventListener('pointerup', onUp, { capture: true });
      bar.removeEventListener('pointercancel', onUp, { capture: true });
      cancelSeek();
      bar.removeEventListener('lostpointercapture', keepCapture);
      window.removeEventListener('blur', cancelSeek);
      bar.removeEventListener('click', blockClick, { capture: true });
      window.removeEventListener('pointerup', windowFailsafe);
      window.removeEventListener('pointercancel', windowFailsafe);
      window.removeEventListener('pointerup', releasePress);
      window.removeEventListener('pointercancel', releasePress);
    };
    // `seekLayer` moves the touch area to another element, so listen there.
  }, [seekToPosition, onSeekStart, onSeekEnd, seekLayer]);

  // Show the video whole (never cropped) whenever it isn't a perfect fit for the
  // frame: always in `letterbox` mode (desktop), otherwise only for non-portrait.
  // For a true 9:16 short this fills edge-to-edge, so the glass fill stays hidden.

  // Pinned to the very bottom of whichever box it lands in — the seek zone in
  // place, or the viewer's video container through the portal below. `z-20`
  // clears the action bar's gradient (`z-10`) once it is a sibling of it, and
  // it never takes a click either way: the zone below owns the interaction.
  const progressBar = (
    <div className={cn(
      "absolute bottom-0 left-0 right-0 z-20 pointer-events-none",
      isSeeking ? "h-2" : "h-1",
      "transition-[height] duration-150"
    )}>
      <div className="absolute inset-0 bg-white/20" />
      <div
        className="absolute inset-0 origin-left bg-white/80"
        style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }}
      />
      {/* Read only while a scrub is re-rendering this on every move. */}
      <StoryboardPreview
        storyboard={short.storyboard}
        fraction={progress}
        duration={isSeeking ? videoRef.current?.duration || 0 : 0}
        visible={isSeeking}
        armed={isActive}
      />
    </div>
  );

  // The scrubber as it is drawn in the viewer's bottom stack: a rounded line
  // with a dot, which swells into a glass lens while a finger is on it. The
  // lens shows the line under it enlarged, the way the app's drag toggles do.
  const fraction = Math.min(1, Math.max(0, progress));
  const lensUp = isSeeking || seekPressed;
  const slotScrubber = (
    <div
      ref={seekLayer ? progressBarRef : undefined}
      data-no-swipe
      data-no-pull
      data-shorts-scrubber
      data-seeking={lensUp || undefined}
      className="absolute inset-0 cursor-pointer touch-none select-none"
    >
      <div className={cn(
        // The grey hairline keeps the unplayed part visible on the white plain stage.
        "absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-white/30 shadow-[0_0_0_1px_rgba(128,128,128,0.3)] transition-[height] duration-200",
        lensUp ? "h-2.5" : "h-1.5",
      )}>
        <div className="absolute inset-0 origin-left bg-white" style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full transition-[width,height,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.3,1.5,0.5,1)] motion-reduce:transition-none",
          lensUp
            ? "h-9 w-[62px] border border-white/60 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_10px_26px_rgba(0,0,0,0.45)] [backdrop-filter:blur(2px)_saturate(1.9)_brightness(1.25)] [-webkit-backdrop-filter:blur(2px)_saturate(1.9)_brightness(1.25)]"
            : "h-3.5 w-3.5 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]",
        )}
        style={{ left: `${fraction * 100}%` }}
      >
        {lensUp && <>
          <span className="absolute inset-x-1.5 top-1/2 h-[15px] -translate-y-1/2 rounded-full" style={{ background: 'linear-gradient(90deg, #fff 50%, rgba(255,255,255,0.4) 50%)' }} />
          <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/55 via-transparent to-white/15" />
        </>}
      </div>
      <StoryboardPreview
        storyboard={short.storyboard}
        fraction={progress}
        duration={isSeeking ? videoRef.current?.duration || 0 : 0}
        visible={isSeeking}
        armed={isActive}
      />
      {isSeeking && !short.storyboard && !!videoRef.current?.duration && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white"
          style={{ left: `clamp(20px, ${fraction * 100}%, calc(100% - 20px))` }}
        >
          {formatDuration(Math.floor(fraction * videoRef.current.duration))}
        </span>
      )}
    </div>
  );

  // The frame stays `absolute inset-0` in every state, fullscreen included: it
  // is the viewer's container that goes fullscreen, and this frame simply fills
  // it as it always did. Nothing here may go `fixed` — the carousel transforms
  // each slide, and a transformed ancestor makes `fixed` resolve against that
  // wrapper rather than the viewport.
  return (
    <div data-shorts-picture data-keep-dark data-shorts-photo-slide={isPhotoSlide || undefined} data-shorts-clean-slide={cleanStage || undefined} className="absolute inset-0 bg-black" style={{ willChange: 'transform' }}>
      {/* Liquid glass fill behind letterboxed / non-portrait videos.
          One filtered layer plus a plain tint. It used to be a blurred layer
          with a second backdrop-blur pass stacked on it — blurring what was
          already a blur, on every slide in the window — and both were redrawn
          on every frame the player resized (comments opening/closing) or
          moved, which is where those transitions lost frames. The two blur
          and saturate passes are folded into the one filter. */}
      {glowStage && <ShortsLiveGlow videoRef={videoRef} thumbnail={thumbnail} live={isActive} look={phoneStage === 'floor' ? 'floor' : 'glow'} />}
      {fitWhole && thumbnail && !isPhotoSlide && !phoneStage && (
        <>
          <div
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${thumbnail})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(48px) saturate(270%)',
              transform: 'scale(1.1)',
            }}
          />
          <div data-keep-dark className="absolute inset-0 z-[1] bg-black/40" />
        </>
      )}

      {/* Video element. One tap model on every platform now: the reaction
          ladder, off pointer events. Desktop used to bind a competing onClick
          for centre-double-tap fullscreen; fullscreen kept its button and gave
          the gesture up, because one gesture cannot mean two things. */}
      <div data-shorts-media-slot className="absolute inset-0 z-[2]" style={cardClip || glowFeather ? { containerType: 'size', top: stageInsetTop || undefined } : undefined} {...tapGestures} {...side.handlers} {...pinch.handlers}>
        {/* A hold's speed-up shows nothing: the picture speeding up is the
            feedback. A double-tap jump shows a soft count on its side. */}
        {side.seekFlash && (
          <span
            key={side.seekFlash.run}
            data-shorts-seek-flash
            className={cn(
              'pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 text-xl font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.45)] animate-[shorts-seek-flash_800ms_ease-out_forwards]',
              side.seekFlash.side < 0 ? 'left-[10%]' : 'right-[10%]',
            )}
          >
            {side.seekFlash.side < 0 ? '−' : '+'}{side.seekFlash.total}s
          </span>
        )}
        {short.imageUrls?.length ? (
          <Suspense fallback={<img src={short.imageUrls[0]} alt="" className="w-full h-full object-contain" />}>
            <ShortsPhotoPager images={short.imageUrls} galleryKey={String(short.id)} />
          </Suspense>
        ) : null}
        {transcodingStatus === 'failed' ? (
          /* Transcode job failed server-side — videoUrl was written
             optimistically at upload time and the file was never actually
             produced, so a player here would just sit on a dead src. */
          <div data-keep-dark className="relative w-full h-full bg-zinc-900">
            {thumbnail && (
              <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
            )}
            <div data-keep-dark className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
              {/* Retry is offered on the post itself, not here: a slide in the
                  carousel carries no ownership, and the creator reaching their
                  own broken short does so through their profile. */}
              <Suspense fallback={<span className="text-white/80 text-xs">{t('videoPlayer.processingFailed')}</span>}>
                <TranscodeRetry tokenId={short.id} isOwner={false} />
              </Suspense>
            </div>
          </div>
        ) : transcodingStatus === 'pending' || transcodingStatus === 'on' ? (
          /* Still transcoding — same optimistic videoUrl, but recoverable
             once the job finishes, unlike the 'failed' branch above. */
          <div data-keep-dark className="relative w-full h-full bg-zinc-900">
            {thumbnail && (
              <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
              <Loader2 className="w-7 h-7 text-white animate-spin" />
              <span className="text-white/80 text-xs font-medium tracking-wide drop-shadow">
                {t('videoPlayer.processing')}
              </span>
            </div>
          </div>
        ) : (short.videoUrl || short.soundtrackUrl) ? (
          <div ref={pinch.targetRef} className="w-full h-full">
            <div
              ref={attachSlot}
              className={cn('w-full h-full', cardClip && 'px-3')}
              style={cardClip ? { clipPath: cardClip } : glowFeather ? { maskImage: glowFeather, WebkitMaskImage: glowFeather } : undefined}
            />
          </div>
        ) : (
          <div data-keep-dark className="w-full h-full flex items-center justify-center bg-zinc-900">
            <img 
              src={thumbnail} 
              alt={short.description || _copy("copy.e8faa500e9f4", { defaultValue: "Short video" })}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Subtitles for the playing short. They sit in the top part of the
          slide so the caption, creator row and buttons below stay clear. */}
      {isActive && captionSlot && !!short.videoUrl && !short.imageUrls?.length && (
        <div className="absolute inset-x-0 top-0 bottom-[34%] z-20 pointer-events-none">
          <Suspense fallback={null}>
            <VideoSubtitleOverlay tokenId={short.id} videoRef={videoRef} buttonPortalTarget={captionSlot} plainButton />
          </Suspense>
        </div>
      )}

      {(playbackPhase === 'failed' || playbackPhase === 'blocked') && isActive && <button type="button"
        className="absolute top-32 left-1/2 -translate-x-1/2 z-20 min-h-11 rounded-full bg-black/70 px-4 text-white"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          const media = videoRef.current;
          if (!media) return;
          void requestVideoPlayback(media).catch(() => {});
        }}>{playbackPhase === 'blocked' ? t('audioPost.play') : t('explorePage.retry')}</button>}

      {(playbackPhase === 'loading' || playbackPhase === 'retrying') && isActive &&
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"><Loader2 className="w-8 h-8 text-white animate-spin" /></div>}

      {/* The fullscreen toggle used to live here, and it showed: a slide is
          translated by the carousel, so the button slid along with the video on
          every step while the viewer's mute button — its neighbour in the same
          row — held still. It now sits beside the mute button in the viewer,
          which is also the only way the two can be guaranteed the same
          treatment. */}

      {/* 👍 / ❤️ for the tap ladder. Sits above the controls so the burst is not
          drawn under them, which is safe because every layer of it is
          pointer-events-none and cannot take a tap from the seek strip. */}
      {isActive && <TapReactionBurst postId={short.id} />}

      {/* Play/Pause indicator - only shown on explicit tap */}
      {showPlayIndicator && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="w-16 h-16 bg-black/40 backdrop-blur-[24px] backdrop-saturate-[180%] rounded-xl flex items-center justify-center border border-white/10"
          >
            {showPlayIndicator === 'play' ? (
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            ) : (
              <Pause className="w-8 h-8 text-white fill-white" />
            )}
          </motion.div>
        </div>
      )}

      {/* Bottom 15% seek zone. The bar it draws goes out to `progressLayer`
          when there is one, so the action bar's gradient cannot sit on top of
          it — see the prop. The zone itself never moves. */}
      {seekLayer ? createPortal(slotScrubber, seekLayer) : <>
        <div
          ref={progressBarRef}
          data-no-swipe
          data-no-pull
          className="absolute bottom-0 left-0 right-0 z-20 cursor-pointer touch-none select-none"
          style={{ height: '15%' }}
        >
          {!progressLayer && progressBar}
        </div>
        {progressLayer && createPortal(progressBar, progressLayer)}
      </>}
    </div>
  );
});

/**
 * A gated short's file is private: an entitled viewer plays a signed URL, and
 * anyone else is refused one and keeps the poster.
 */
function SignedVideoSlide(props: VideoSlideProps) {
  const viewer = useContext(AuthContext)?.walletAddress;
  const { data, refetch } = useVideoAccess(props.short.id, true, viewer);
  const onPlaybackFailed = useCallback(() => {
    if (data?.private && isVideoAccessExpiring(data)) void refetch();
  }, [data, refetch]);
  return <VideoSlideBody {...props} playbackSrc={data?.url ?? null} onPlaybackFailed={onPlaybackFailed} />;
}

export const VideoSlide = memo(function VideoSlide(props: VideoSlideProps) {
  return props.short.gated && !props.short.soundtrackUrl
    ? <SignedVideoSlide {...props} />
    : <VideoSlideBody {...props} />;
});

export default VideoSlide;
