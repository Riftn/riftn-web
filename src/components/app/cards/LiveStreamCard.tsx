import { hasStreamEnded } from '@/lib/live-status';
import Minimize from "@/components/ui/cut-icons/exit-fullscreen";
import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft, draftIdentity } from '@/hooks/use-surface-draft';
import { tokenLabel } from '@/lib/token-label';
/**
 * Live Stream Card Component
 * ==========================
 * Displays a live stream with video player and "stream ended" fallback state.
 * Wired to Riftn API for likes, gifts, ending streams, and activity logs.
 */

import { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { getNFTInfo } from '@/lib/api/dehub/feed';
import { extractReplayUrl, formatReplayTime } from '@/lib/live-replay';
import { SEEK_JUMP_SECONDS } from '@/lib/video-hold-gestures';
import { useFeedPlaybackAllowed, useLivePlaybackAllowed, visualActivity } from '@/lib/visual-activity';
import { canPictureInPicture, catchUpToLiveEdge, onReturnToTab, togglePictureInPicture, useAutoPictureInPicture } from '@/lib/live-background';
import { usePictureInPicture } from '@/hooks/use-picture-in-picture';
import { isVideoInPictureInPicture, releaseAfterPictureInPicture } from '@/lib/picture-in-picture';
import { useVideoFullscreen } from '@/hooks/use-video-fullscreen';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useKeyboardOpen, useVisualViewportBox } from '@/hooks/use-keyboard-open';
import { useDarkSurface } from '@/contexts/ThemeContext';
import { AppState } from '@/components/app/AppState';
import { ButtonLoader } from '@/components/app/DeHubLoader';
import {
  claimMediaSession,
  releaseMediaSession,
  setMediaSessionPlaying,
} from '@/lib/media-session';
import { useNavigate } from 'react-router-dom';
import MoreVertical from "@/components/ui/cut-icons/morevertical";
import { Heart, StopCircle, Activity, Loader2, ChevronDown, Headphones } from "lucide-react";
import AssistantNavIcon from "@/components/ui/AssistantNavIcon";
import Flag from "@/components/ui/cut-icons/report";
import Ban from "@/components/ui/cut-icons/blocked";
import Volume2 from "@/components/ui/cut-icons/volume";
import VolumeX from "@/components/ui/cut-icons/mute";
import Maximize from "@/components/ui/cut-icons/fullscreen";
import MessageSquare from "@/components/ui/cut-icons/messages";
import PictureInPicture2 from "@/components/ui/cut-icons/picture-in-picture";
import Gift from "@/components/ui/cut-icons/gifts";
import Info from "@/components/ui/cut-icons/information";

import Bell from "@/components/ui/cut-icons/alerts";
import Play from "@/components/ui/cut-icons/play";
import Pause from "@/components/ui/cut-icons/pause";
import Rewind from "@/components/ui/cut-icons/rewind";
import FastForward from "@/components/ui/cut-icons/fast-forward";
import Bookmark from "@/components/ui/cut-icons/save";
import Gem from "@/components/ui/cut-icons/diamond";

import { useTranslation as useI18n } from 'react-i18next';
import { cn } from '@/lib/utils';
// Type-only: the hls.js runtime (~400 kB raw) loads dynamically at attach time
// so it stays out of the eager feed-card path (see the playback effect below).
import type Hls from 'hls.js';
import { CardHeader } from './CardHeader';
import { ActionBar } from './ActionBar';
import { VideoVolumeControl } from '@/components/app/video/VideoVolumeControl';
import { useMediaVolume, setVolume as vpSetVolume } from '@/lib/video-preferences';
import { CommentsWrapper } from './CommentsWrapper';
import { LiveEndedMedia } from './LiveEndedMedia';
import { StreamShopPinnedCard } from '../live/StreamShop';
import { ImmersiveLiveChrome } from '../live/ImmersiveLiveChrome';
import { PASS_THROUGH_STYLE, VERTICAL_FRAME_STYLE, VERTICAL_WINDOW_STYLE, verticalCropStyle, type VerticalCrop } from '@/lib/live-overlay/vertical-crop';
import { LiveClearedLayer } from '../live/LiveClearedLayer';
import { LiveViewerActionsProvider } from '../live/live-viewer-actions';
import { useLiveClip } from '../live/ClipButton';
import { ReactingToChip } from '../remix/LazyReactionChips';
import Scissors from '@/components/ui/cut-icons/trim';
import { ShopBoardLazy } from '../live/ShopBoardLazy';
import { PostAIChatLazy } from './PostAIChatLazy';
import { ReportModal } from '../modals/ReportModal';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { videoPlaybackManager } from '@/lib/video-playback-manager';
// The WHEP subscriber pulls in peer-connection code and loads on demand at
// attach time (see the playback effect) — a static import here would put it
// on the boot path, since this card is eager via HomeFeed. live-ingest is
// safe to import statically for the same reason: it is pure URL arithmetic
// with no imports of its own.
import {
  liveSourceFromHlsUrl,
  whepEndpointFor,
  edgeWhepEndpointFor,
  fetchTurnServers,
  isBigEventPlayback,
  BIG_EVENT_HLS_CONFIG,
} from '@/lib/live-ingest';
import type { WhepState, WhepSubscription } from '@/lib/livepeer/whep';
import { nativeLiveEdge, watchLiveProgress } from '@/lib/live/stall-watchdog';
import { NO_RELAY_CANDIDATE, firstWhepRoute, forgetWhepRouteBlocked, forgetWhepSilent, hasRealPicture, rememberWhepRouteBlocked, rememberWhepSilent, whepRecentlySilent, whepRouteBlocked, type WhepRoute } from '@/lib/live/whep-memory';
import { behindForRatio, liveEdgeSnap, timeForBehind, timelineSnap, type TimeshiftSnap } from '@/lib/live/timeshift';
import { LiveTimelineBar, type LiveTimeshift } from '@/components/app/live/LiveTimeline';
import { dropWarmLiveHls, LIVE_HLS_CONFIG, playsNativeHls, SLOW_KEYFRAME_SEC, takeWarmLiveHls, warmLiveHls } from '@/lib/live/hls-standby';
import { peekLiveSession, snapshot as snapshotLiveFrame, takeLiveSession } from '@/lib/live-handoff';
import { claimLiveMini, getLiveMiniVideo, openLiveMini, type LiveMiniMode } from '@/lib/live-mini';
import { useStreamActions, useStreamActivities } from '@/hooks/use-livestream';
import { useBlockAuthor } from '@/hooks/use-block-author';
import { useNotifyWhenLive } from '@/hooks/use-notify-when-live';
import { GatedMedia } from './GatedMedia';
import { useFeedViewTracking } from '@/hooks/use-view-tracking';
import { useStreamPresence } from '@/hooks/use-stream-presence';
import { useLivePlaybackFeedback } from '@/hooks/use-live-playback-feedback';
import { useStreamGifts } from '@/hooks/use-stream-gifts';
import { useGiftAnimations } from '@/hooks/use-gift-animations';
import { GiftAnimationOverlay } from '@/components/app/live/GiftAnimationOverlay';
import { useStreamOverlay } from '@/hooks/use-stream-overlay';
import { overlayOwnsCelebration as overlayReplacesCelebration } from '@/lib/live-overlay/built-in';
import { LiveReactionFlow, type SelfReaction } from '@/components/app/live/LiveReactionFlow';
import { useEngagementWeight } from '@/hooks/use-engagement-weight';
import type { PostReaction } from '@/lib/reactions';
import { GIFT_TIERS, tierFromAmount } from '@/lib/live/gift-tiers';

const LiveGiftBuyDrawer = lazy(() => import('@/components/app/live/LiveGiftBuyDrawer').then(m => ({ default: m.LiveGiftBuyDrawer })));
const GiftSubsDrawer = lazy(() => import('@/components/app/live/GiftSubsDrawer').then(m => ({ default: m.GiftSubsDrawer })));
const TipPayWith = lazy(() => import('@/components/app/tips/TipPayWith'));
// The creator's overlay; lazy, most streams have none.
const LiveOverlayLayer = lazy(() => import('@/components/app/live/overlay/LiveOverlayLayer'));
const StreamPetCorner = lazy(() => import('@/components/app/pet/StreamPetCorner'));
const HypeTrainBar = lazy(() => import('@/components/app/live/overlay/hype-train').then((m) => ({ default: m.HypeTrainBar })));
const CoStreamViewerLayer = lazy(() => import('@/components/app/live/costream/CoStreamViewerLayer'));
const CoStreamAskButton = lazy(() => import('@/components/app/live/costream/CoStreamAskButton'));
const ReplayOverlayLayer = lazy(() => import('@/components/app/live/overlay/ReplayOverlayLayer'));
import { speakTipMessage, warmTipTts, setTipTtsEnabled, MAX_TTS_CHARS } from '@/lib/live/tip-tts';
import { useAuth } from '@/contexts/AuthContext';
import { useBookmarkPost } from '@/hooks/use-bookmarks';
import { usePostTipCount } from '@/hooks/use-post-tip-count';
// The gift drawer's send is a REAL on-chain DHB tip (StreamController.sendTip
// via useTipPayment — wallet modules load dynamically inside tip()); the
// /api/live gift endpoint only records it afterwards for the activity feed.
import { useTipPayment, MIN_TIP_DHB } from '@/hooks/use-tip-payment';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fundTipFromSource } from '@/lib/tip-funding-run';
import type { DirectTipToken } from '@/lib/direct-tip-tokens';
import { DHB_PRELISTING_USD } from '@/lib/subscription-pricing';

import type { TipFundingSource } from '@/lib/tip-funding';
import { formatDistanceToNow } from 'date-fns';
// NOTE: stream-controller reaches wallet/contract code (aa-utils → wagmi) and
// this card is eager via HomeFeed — getDHBBalance is dynamically imported at
// call time below so the wallet stack stays out of the entry bundle
// (scripts/check-entry-bundle.mjs fails the build if it leaks in).
import { fromWei, DHB_TOKEN } from '@/lib/contracts/dhb-token';
import { getAuthToken } from '@/lib/api/dehub/core';
import { supabase } from '@/integrations/supabase/client';
import dehubCoin from '@/assets/dehub-coin.png';
import { DhbAmount } from '@/components/app/DhbAmount';
import { dhbText } from '@/lib/dhb-toast';
import { createLogger } from '@/lib/logger';
import { EndStreamConfirmDialog } from '@/components/app/modals/EndStreamConfirmDialog';
import type { LiveStream } from '@/types/feed.types';
import { publicChatShareTokenId } from '@/lib/live-public-chat-share';
import '@/styles/live-frame-ios.css';

import { formatCount } from '@/lib/format-count';
const logger = createLogger('LiveStreamCard');
/** Width the picture keeps beside the fullscreen chat column (w-[min(380px,40%)]). */
const CHAT_BESIDE_STYLE: React.CSSProperties = { width: 'calc(100% - min(380px, 40%))' };

/**
 * How long a negotiated WebRTC session gets to actually deliver a frame.
 * The nasty case is not an error — it is a session that connects cleanly and
 * plays nothing, which has no event to listen for.
 */
// Each stage has its own clock. One clock from the start ran through the
// offer's own wait, so a slow network was given up on as its answer landed,
// and the relay retry was abandoned before it could have connected: two full
// waits in front of every HLS fallback and neither could succeed.
/** The answer to the offer. Past this the ingest host is not reachable from here. */
const WHEP_ANSWER_TIMEOUT_MS = 3500;
/** After the answer a media route is found in well under a second where one exists. */
const WHEP_CONNECT_TIMEOUT_MS = 2000;
/** Connected: the first picture waits on the broadcast's next keyframe. */
const WHEP_FRAME_TIMEOUT_MS = 2500;

/** Where "live" is for this element: hls.js's sync point, or the native seekable end. */
function liveEdgeOf(video: HTMLVideoElement, hls: Hls | null | undefined): number | null {
  const sync = hls?.liveSyncPosition;
  if (typeof sync === 'number' && Number.isFinite(sync)) return sync;
  return nativeLiveEdge(video);
}

/**
 * The oldest moment that can still be played, i.e. the far left of the
 * timeline: the start of the server's playlist, or of what this player still
 * holds from before it if that reaches further back.
 */
function seekStartOf(video: HTMLVideoElement, hls?: Hls | null): number {
  const ranges = video.seekable;
  let start = ranges && ranges.length ? ranges.start(0) : 0;
  const windowStart = hls?.latestLevelDetails?.fragmentStart;
  if (typeof windowStart === 'number' && Number.isFinite(windowStart)) {
    start = windowStart;
    const held = video.buffered;
    for (let i = 0; i < held.length; i++) {
      if (held.start(i) < start && held.end(i) >= start) start = held.start(i);
    }
  }
  return start;
}

/**
 * Keep the picture the viewer paused on while the element swaps sources:
 * WebRTC's frame goes with its stream, so draw it into the poster first.
 */
function holdFrame(video: HTMLVideoElement): void {
  try {
    if (!video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    video.poster = canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    /* A frame we may not read: the stream's cover stays the poster. */
  }
}

/** What the player overlay says while playback is struggling; worded at render. */
type PlaybackError = 'reconnecting' | 'alternateSource' | 'connecting' | 'unavailable' | 'playFailed';

// Android's HLS path is the one used by the playing feed preview. Keep the
// post on that path too: WHEP can attach a track without producing a frame.
const preferAndroidHls = () =>
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

interface LiveStreamCardProps {
  stream: LiveStream;
  postPage?: boolean;
  /**
   * The stream's own chat, dropped down by the message button in the action
   * bar. When it is given, that button opens the chat rather than the post's
   * comments: a broadcast has one conversation, and it is the live one — the
   * chat used to be a second panel bolted under the player, which read as the
   * platform's chat sitting on somebody's stream.
   */
  chatSlot?: React.ReactNode;
  /**
   * Draw the stream full-bleed instead of as a card: the picture is the
   * screen and everything else floats on it. What the post page switches
   * on at phone widths, and what the app has always done.
   *
   * Chrome only. Every hook, effect and drawer below is shared with the
   * card — a second component would have been a second copy of the WHEP
   * ladder, the presence socket and the gift flow.
   */
  immersive?: boolean;
  /**
   * Set when the stream is a slide in the Shorts swipe viewer: the viewer's
   * swipe owns the vertical drag (so the chrome clears on a tap only), the
   * close button leaves the viewer, and the picture is cropped to the
   * creator's Vertical view box instead of letterboxed.
   */
  swipeFeed?: { onClose: () => void; verticalCrop: VerticalCrop | null };
}

/** What a gift of `dhb` costs in a dollar stablecoin, at the DHB sale peg. */
const giftCostIn = (dhb: number) => Math.round(dhb * DHB_PRELISTING_USD * 1e6) / 1e6;

export function LiveStreamCard({ stream: streamProp, postPage, chatSlot, immersive = false, swipeFeed }: LiveStreamCardProps) {
  const { t: _copy } = _useCopy();
  // A replay is saved a minute or so after the End button. A card loaded in
  // that gap (the creator's own profile, straight after ending) used to sit on
  // the cover for good; the late recording now swaps in without a reload.
  const [lateReplay, setLateReplay] = useState<string | undefined>();
  const stream = useMemo(
    () => (lateReplay && !streamProp.replayUrl ? { ...streamProp, replayUrl: lateReplay } : streamProp),
    [streamProp, lateReplay],
  );
  const keyboardOpen = useKeyboardOpen(immersive);
  // Live is a dark room in every theme: a light theme runs as its dark twin
  // while the stream is open, chat, sheets and portals included.
  useDarkSurface();
  // Full-bleed sits `fixed` over the post page, so a swipe on it (or past the
  // end of the chat) scrolled the page underneath and woke its videos. Hold
  // the page still while the stream owns the screen.
  useEffect(() => {
    if (!immersive) return;
    return lockBodyScroll('immersive-live');
  }, [immersive]);
  // Android shrinks the fixed root with the keyboard (interactive-widget);
  // iOS keeps it full height and draws the keys over the chat box. Fit the
  // root to what is visible above the keys when that happens.
  const visible = useVisualViewportBox(immersive && keyboardOpen);
  const keyboardFit =
    immersive && keyboardOpen && visible.height !== null &&
    (visible.offsetTop > 1 || visible.height < (typeof window === 'undefined' ? 0 : window.innerHeight) - 40)
      ? { top: visible.offsetTop, bottom: 'auto', height: visible.height }
      : undefined;
  // The chat is the post's only conversation, so on the page it starts open;
  // the comment button still folds it away. Full-bleed keeps it open either
  // way — it draws the room itself rather than through this.
  const [showComments, setShowComments] = useState(!!chatSlot);
  const { t } = useI18n();
  const navigate = useNavigate();
  const shareTokenId = publicChatShareTokenId(stream);
  const shareToPublicChat = shareTokenId
    ? () => navigate('/app/messages?chat=public', { state: { shareLiveTokenId: shareTokenId } })
    : undefined;
  // Bookmark state for the three-dot menu. The same action is an icon in the
  // ActionBar's left-anchored utility cluster on desktop; both read this one
  // shared query, so they cannot disagree.
  const { isBookmarked, isLoading: isBookmarkLoading, toggleBookmark } = useBookmarkPost(stream.id);
  const openPostInfoPage = useCallback(() => {
    navigate(`/app/post/${stream.id}/info`);
  }, [navigate, stream.id]);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showGiftDrawer, setShowGiftDrawer] = useState(false);
  // Desktop fullscreen: the chat as a column down the right of the picture,
  // opened from the chat button in the player's own bar.
  const [fullscreenChat, setFullscreenChat] = useState(false);
  // Phone, cleared screen: the room shown back over the picture on its own.
  const [clearedChat, setClearedChat] = useState(false);
  const [showGiftSubs, setShowGiftSubs] = useState(false);
  // Offered once the stream API takes gift checkouts; asked when the gift sheet first opens.
  const { data: giftSubsReady } = useQuery({
    queryKey: ['live-hype-supported'],
    queryFn: () => import('@/lib/api/dehub/live-hype').then((m) => m.liveHypeSupported()),
    enabled: showGiftDrawer,
    staleTime: Infinity,
    retry: false,
  });
  const [showBuyDrawer, setShowBuyDrawer] = useState(false);
  const [giftBalanceVersion, setGiftBalanceVersion] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // Starts loading: a live autoplays, so the first thing in the middle is the
  // spinner, not a Play button that flips to a spinner a moment later.
  const [isBuffering, setIsBuffering] = useState(true);
  // Keyed on the URLs' text, not the array: every refetch of the post builds
  // a fresh playbackUrls array, and the playback effects below (keyed on
  // urlsToTry) tore the player down and reloaded the stream each time, a
  // visible freeze every ~15 seconds while watching.
  const urlsKey = [
    stream.playbackUrl,
    ...(stream.playbackUrls || []).filter((u): u is string => !!u && u !== stream.playbackUrl),
  ].filter((u): u is string => !!u && u.includes('.m3u8')).join('\n');
  const urlsToTry = useMemo(() => (urlsKey ? urlsKey.split('\n') : []), [urlsKey]);
  const hasPlaybackUrl = urlsToTry.length > 0;
  // The feed card that was just tapped may have left its running WebRTC
  // session behind for this page (lib/live-handoff). It decides the transport
  // and the first frame.
  const handoffPlaybackId = liveSourceFromHlsUrl(urlsToTry[0])?.playbackId;
  const [handoff, setHandoff] = useState(() => peekLiveSession(handoffPlaybackId));
  // Usually not there yet on the first render: this page renders in the same
  // commit as the route change, and the card only stashes its session in its
  // effect cleanup, which runs after that render. Effect cleanups all run
  // before any new effect does, so it is there by now. Declared ahead of the
  // WebRTC effect below, which takes it.
  useEffect(() => {
    // The same live playing in the corner hands its session and seat back to
    // this viewer; any other minimised live closes (one live at a time).
    claimLiveMini(streamProp.streamId, getLiveMiniVideo());
    if (handoff) return;
    const late = peekLiveSession(handoffPlaybackId);
    if (late) setHandoff(late);
    // Mount only: a session is only ever handed to the page being opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isMuted, setIsMuted] = useState(true);
  // A handed-over session is proof the stream is on air, so it plays before
  // the status merge lands. The grace runs out so a stream that really has
  // ended still falls to the ended screen.
  const [handoffGrace, setHandoffGrace] = useState(!!handoff);
  useEffect(() => {
    if (handoff) setHandoffGrace(true);
  }, [handoff]);
  useEffect(() => {
    if (!handoffGrace) return;
    const timer = setTimeout(() => setHandoffGrace(false), 10_000);
    return () => clearTimeout(timer);
  }, [handoffGrace]);
  const liveNow = stream.isLive || handoffGrace;
  // The WebRTC route reuses the id already embedded in the HLS URL, so nothing
  // new has to be threaded through the feed mappers to reach it.
  const whepSource = useMemo(
    () => (liveNow ? liveSourceFromHlsUrl(urlsToTry[0]) : null),
    [liveNow, urlsToTry]
  );
  const whepPlaybackId = whepSource?.playbackId ?? null;
  // A big event never opens a WebRTC session: one per viewer is exactly the
  // load that mode exists to avoid. It plays HLS from deep behind live.
  const bigEvent = isBigEventPlayback(urlsToTry[0]);
  // A handed-over session is already delivering frames, which answers the
  // Android worry below — keep it rather than dropping to HLS.
  const [transport, setTransport] = useState<'whep' | 'hls'>(
    !bigEvent && (handoff || (!preferAndroidHls() && !whepRecentlySilent(whepPlaybackId) && firstWhepRoute(whepSource?.provider === 'mediamtx') !== null)) && typeof RTCPeerConnection !== 'undefined' && !!whepPlaybackId ? 'whep' : 'hls'
  );
  // A source swap pauses the element; keep the viewer's intent through fallback.
  const playbackRequestedRef = useRef(true);
  // The same intent as state, for what should follow it rather than the
  // element: a browser pausing a muted live in a background tab, a buffer, or
  // the WebRTC → HLS swap all pause the <video> without the viewer leaving.
  const [playbackWanted, setPlaybackWantedState] = useState(true);
  const setPlaybackWanted = useCallback((wanted: boolean) => {
    playbackRequestedRef.current = wanted;
    setPlaybackWantedState(wanted);
  }, []);
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const whepPlaybackIdRef = useRef(whepPlaybackId);
  whepPlaybackIdRef.current = whepPlaybackId;
  const bigEventRef = useRef(bigEvent);
  bigEventRef.current = bigEvent;
  /**
   * Watching behind the live edge on purpose: paused, or moved back along the
   * timeline. `resume` is where to stand once the HLS copy is loaded (WebRTC
   * keeps nothing to go back to, so a pause or a rewind there swaps to HLS),
   * as seconds behind live at a moment in time; the wait since then is added.
   */
  const timeshiftRef = useRef<{ active: boolean; fromWhep: boolean; resume: { behind: number; at: number } | null }>({ active: false, fromWhep: false, resume: null });
  // If stream.isLive is false, treat as ended immediately — don't try to play a dead HLS URL
  const [streamEnded, setStreamEnded] = useState(!liveNow);
  const { broadcastPaused, broadcastEnded, waitingTooLong } = useLivePlaybackFeedback(stream.streamId, isBuffering, liveNow && !streamEnded, stream.liveStatus);
  const broadcastPausedRef = useRef(broadcastPaused);
  broadcastPausedRef.current = broadcastPaused;
  // The room says it is over: show the ended state now, not on the next refetch.
  useEffect(() => { if (broadcastEnded) setStreamEnded(true); }, [broadcastEnded]);
  const replayTokenId = stream.tokenId;
  const waitingForReplay = streamEnded && !stream.replayUrl && !!replayTokenId && !stream.isPPV && !stream.isLocked;
  useEffect(() => {
    if (!waitingForReplay) return;
    let cancelled = false;
    let tries = 0;
    let timer: number | undefined;
    const check = async () => {
      tries += 1;
      try {
        const nft = await getNFTInfo(String(replayTokenId));
        const url = extractReplayUrl((nft as { stream?: unknown })?.stream);
        if (cancelled) return;
        if (url) { setLateReplay(url); return; }
      } catch { /* try again on the next beat */ }
      // About five minutes: a replay that is not ready by then is not coming.
      if (!cancelled && tries < 20) timer = window.setTimeout(check, 15000);
    };
    timer = window.setTimeout(check, 5000);
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [waitingForReplay, replayTokenId]);
  // The viewer's own thumb, played on tap rather than on the echo — see
  // LiveReactionFlow's `self`. The room still gets theirs off the broadcast.
  const [selfReaction, setSelfReaction] = useState<SelfReaction | null>(null);
  const selfReactionNonce = useRef(0);
  const liveReactionWeight = useEngagementWeight();
  const sendLiveReaction = useCallback((reaction: PostReaction) => {
    if (!stream.isLive || streamEnded) return;
    selfReactionNonce.current += 1;
    setSelfReaction({ type: reaction, weight: liveReactionWeight, nonce: selfReactionNonce.current });
    // A missing stream id only costs the room its copy, never the sender theirs.
    if (!stream.streamId) return;
    void import('@/lib/api/dehub/stream-presence').then(({ sendStreamReaction }) => {
      sendStreamReaction(stream.streamId!, reaction);
    }).catch(() => undefined);
  }, [stream.streamId, stream.isLive, streamEnded, liveReactionWeight]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<PlaybackError | null>(null);
  const [giftAmount, setGiftAmount] = useSurfaceDraft("components/app/cards/LiveStreamCard.tsx:giftAmount", '', draftIdentity(stream));
  const [giftMessage, setGiftMessage] = useSurfaceDraft("components/app/cards/LiveStreamCard.tsx:giftMessage", '', draftIdentity(stream));
  // USDC/USDT to pay the gift with, sent straight to the creator. The gift is
  // still picked in DHB tiers; it costs those DHB at the sale peg in dollars.
  const [giftPayWith, setGiftPayWith] = useState<TipFundingSource | null>(null);
  const giftDirect = giftPayWith?.direct ?? null;
  // The token of the gift on its way, read when it is submitted (the payment
  // reports the stablecoin amount; the room counts the DHB it stands for).
  const sendingGiftToken = useRef<DirectTipToken | null>(null);
  const [fundingGift, setFundingGift] = useState(false);
  const [dhbBalance, setDhbBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackAllowed = useFeedPlaybackAllowed();
  // The live itself keeps playing with the tab in the background or the
  // window unfocused (see lib/live-background); only a call or leaving the
  // page stops it. The replay below is a normal video and keeps the feed rule.
  const livePlaybackAllowed = useLivePlaybackAllowed();
  useEffect(() => {
    if (!livePlaybackAllowed && (!isVideoInPictureInPicture(videoRef.current) || visualActivity.isCallBusy())) videoRef.current?.pause();
  }, [livePlaybackAllowed]);
  // Full-bleed only. A live can't be paused, so the picture itself is the
  // clear button: a tap on it, or a swipe down over the lower half as the
  // shorts viewer does, clears the chrome. Only a small rotate button stays,
  // to flip between portrait and landscape. A tap or a swipe up brings it all
  // back, in portrait.
  const [chromeHidden, setChromeHidden] = useState(false);
  // The click that follows the touch which cleared the chrome would land on
  // the restore layer and bring it straight back.
  const chromeToggledAt = useRef(0);
  const setHidden = useCallback((hidden: boolean) => {
    if (Date.now() - chromeToggledAt.current < 400) return;
    chromeToggledAt.current = Date.now();
    setChromeHidden(hidden);
  }, []);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) { swipeStart.current = null; return; }
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const onSwipeEnd = useCallback((e: React.TouchEvent, direction: 'down' | 'up') => {
    const start = swipeStart.current;
    swipeStart.current = null;
    const touch = e.changedTouches[0];
    if (!start || !touch) return;
    const dy = touch.clientY - start.y;
    const dx = Math.abs(touch.clientX - start.x);
    if (direction === 'down' && dy > 40 && dy > dx) setHidden(true);
    if (direction === 'up' && -dy > 40 && -dy > dx) setHidden(false);
  }, [setHidden]);
  // Landscape: the real screen lock where the browser has one (Android
  // Chrome, in fullscreen), else the picture is turned a quarter in CSS
  // (iPhone Safari has no orientation lock).
  const [rotation, setRotation] = useState<'none' | 'native' | 'css'>('none');
  // In the Shorts swipe a landscape stream fills the phone, cropped to the box
  // the creator chose. Turned to landscape it is the whole picture again.
  const cropToVertical = immersive && rotation === 'none' && swipeFeed?.verticalCrop?.enabled ? swipeFeed.verticalCrop : null;
  const unrotate = useCallback(() => {
    setRotation((current) => {
      if (current === 'native') {
        try { (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.(); } catch { /* not locked */ }
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      }
      return 'none';
    });
  }, []);
  const toggleRotation = useCallback(async () => {
    if (rotation !== 'none') { unrotate(); return; }
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      await (screen.orientation as ScreenOrientation & { lock: (o: string) => Promise<void> }).lock('landscape');
      setRotation('native');
    } catch {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setRotation('css');
    }
  }, [rotation, unrotate]);
  useEffect(() => { if (!chromeHidden) unrotate(); }, [chromeHidden, unrotate]);
  useEffect(() => { if (!chromeHidden) setClearedChat(false); }, [chromeHidden]);
  useEffect(() => () => unrotate(), [unrotate]);
  /**
   * The replay timeline, for the scrub line the chrome draws.
   *
   * Only a recording has one. A broadcast on air has nothing behind the
   * live edge to move to, so only a recording supplies a playback clock.
   */
  const replayRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = replayRef.current;
    if (!video) return;
    return () => releaseAfterPictureInPicture(video, () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  }, [streamEnded, stream.replayUrl]);
  useEffect(() => {
    if (!playbackAllowed && (!isVideoInPictureInPicture(replayRef.current) || visualActivity.isCallBusy())) replayRef.current?.pause();
  }, [playbackAllowed]);
  const [replayClock, setReplayClock] = useState<{ position: number; duration: number } | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayBuffering, setReplayBuffering] = useState(false);
  useEffect(() => {
    setReplayBuffering(false);
    setReplayPlaying(false);
    setReplayClock(null);
  }, [streamEnded, stream.replayUrl]);
  const toggleReplay = useCallback(() => {
    if (!visualActivity.isFeedPlaybackAllowed()) return;
    const el = replayRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, []);
  const syncReplayClock = useCallback((video: HTMLVideoElement) => {
    const { currentTime, duration } = video;
    if (!Number.isFinite(duration) || duration <= 0) {
      setReplayClock(null);
      return;
    }
    const position = immersive ? currentTime : Math.floor(currentTime);
    setReplayClock(previous => previous && previous.position === position && previous.duration === duration
      ? previous
      : { position, duration });
  }, [immersive]);
  const seekReplay = useCallback((ratio: number) => {
    const video = replayRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(video.duration, ratio * video.duration));
    syncReplayClock(video);
  }, [syncReplayClock]);
  const jumpReplay = useCallback((direction: -1 | 1) => {
    const video = replayRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    seekReplay((video.currentTime + direction * SEEK_JUMP_SECONDS) / video.duration);
  }, [seekReplay]);
  /**
   * Clip: on air, or on a replay that exists. Never on a stream sold per view
   * or locked — a free Short of it would give the paid part away. The server
   * refuses those too; this only keeps the button off them.
   */
  // Clips are keyed by the numeric NFT tokenId; a fallback card carrying a
  // 24-hex Mongo _id would only get a "tokenId required" error.
  const clippable = /^\d+$/.test(stream.id ?? '') && !stream.isPPV && !stream.isLocked && (streamEnded ? !!stream.replayUrl : !!stream.isLive);
  const getReplayTime = useCallback(
    () => (streamEnded && replayRef.current ? replayRef.current.currentTime : undefined),
    [streamEnded],
  );
  const liveClip = useLiveClip(stream.id, getReplayTime);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggleFullscreen } = useVideoFullscreen(videoRef, containerRef, { escapeAncestors: true });
  // Fullscreen chat open: the picture steps left to sit beside the chat
  // column instead of running under it.
  const chatBeside = !immersive && isFullscreen && fullscreenChat && !!chatSlot;
  // Records the view once the player has been on screen long enough to mean it.
  const viewRef = useFeedViewTracking(stream.tokenId || stream.id);
  // Read here rather than below the presence hook: whether this viewer is the
  // creator decides whether presence runs at all.
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const isOwnStream = Boolean(
    walletAddress &&
      stream.creatorId &&
      walletAddress.toLowerCase() === stream.creatorId.toLowerCase()
  );
  // Ask to join sits in the live's own controls (not on the picture); it
  // hides itself unless the host takes requests.
  const canAskToJoin = !!stream.streamId && !!stream.isLive && !streamEnded && !isOwnStream;
  /*
   * Counts this tab among the viewers (web was never counted before) and
   * reads the live number back, falling back to the stored total. The
   * creator is never counted in their own audience.
   */
  const livePresence = useStreamPresence(
    stream.streamId,
    // Following the viewer's intent, not the element: a tab switch or a
    // stall paused the <video> and walked them out of the room ("left" in
    // chat, the count dropping) while they were still watching.
    !!stream.isLive && !streamEnded && playbackWanted && !isOwnStream
  );

  /*
   * Gift celebrations: the sender's own plays at submit, everyone else's off
   * `streamer.tip`, whose echo of the sender's own is dropped below.
   */
  const { items: giftCelebrations, enqueue: enqueueGift } = useGiftAnimations();
  // A creator's own tip alert replaces the built-in celebration, never both.
  // A replay draws the overlay too, from the stream's own log (ReplayOverlayLayer).
  const { data: streamOverlay } = useStreamOverlay(stream.streamId, (!!stream.isLive && !streamEnded) || (streamEnded && !!stream.replayUrl));
  const [showChatOverlay, setShowChatOverlay] = useState(true);
  const canToggleChatOverlay = !!stream.isLive && !streamEnded && !!stream.streamId && !!streamOverlay &&
    streamOverlay.version > 0 && streamOverlay.renderIn === 'app' &&
    streamOverlay.widgets.some((widget) => widget.enabled && widget.kind === 'chat_box');
  const overlayOwnsCelebration = overlayReplacesCelebration(streamOverlay);
  /**
   * The tier the amount currently in the box will play — whether it was
   * picked from a tile or typed. A custom amount is not a lesser gift; it
   * still lands on a rung, and the drawer says which one so nobody sends
   * 499,000 DHB expecting a Golden Screen.
   */
  const selectedGiftTier = useMemo(() => {
    const amt = Number(giftAmount);
    return Number.isFinite(amt) && amt > 0 ? tierFromAmount(amt) : null;
  }, [giftAmount]);
  /**
   * Hashes of the gifts this card itself submitted. The broadcast carries
   * the tx hash back, and that is the one key that says "mine" whatever
   * address form the backend stamped on the row — the wallet compare below
   * misses when the row carries the signer EOA and the session the Safe,
   * and the miss was a paid-for celebration playing twice.
   */
  const ownGiftHashes = useRef<Set<string>>(new Set());
  const isOwnGift = (gift: { address?: string; transactionHash?: string }) => {
    if (gift.transactionHash && ownGiftHashes.current.has(gift.transactionHash)) return true;
    const me = walletAddress?.toLowerCase();
    return !!(me && gift.address && gift.address === me);
  };
  useStreamGifts(
    stream.streamId,
    !!stream.isLive,
    (gift) => {
      if (isOwnGift(gift)) return;
      enqueueGift(gift);
    },
    // Read aloud only once PAID: the unpaid broadcast carries whatever any
    // client posted. The sender's own copy is spoken at submit time below.
    (paid) => {
      if (isOwnGift(paid) || streamOverlay?.controls?.readAloudMuted) return;
      speakTipMessage(paid.message);
    },
  );

  // Get the device voices ready while the viewer is watching rather than when
  // the first gift lands, so the first message of a stream is read on the beat
  // of its celebration. Only for a stream actually live.
  useEffect(() => {
    if (stream.isLive && !streamEnded) warmTipTts();
  }, [stream.isLive, streamEnded]);
  const hlsRef = useRef<Hls | null>(null);
  /** The WebRTC session on screen, and the one handed to the corner window. */
  const whepSessionRef = useRef<WhepSubscription | null>(null);
  const handedToMiniRef = useRef<WhepSubscription | null>(null);
  /** One WebRTC attempt per card: once it fails, HLS keeps the element. */
  const whepFailedRef = useRef(false);
  /** The WebRTC route the picture on screen came by, for the network memory. */
  const whepRouteRef = useRef<WhepRoute>('direct');
  const videoId = `live-${stream.id}`;

  const queryClient = useQueryClient();
  const isStreamOwner = isOwnStream;
  const notifyWhenLive = useNotifyWhenLive();
  const { gift, end, isEnding } = useStreamActions();
  const { blockAuthor } = useBlockAuthor();
  // Every /api/live/{id}/* interaction route takes the Mongo ObjectId, never
  // the NFT tokenId — a tokenId there is a guaranteed CastError 500.
  const apiStreamId = stream.streamId || null;
  const { activities, isLoading: activitiesLoading } = useStreamActivities(
    showActivityLog && apiStreamId ? apiStreamId : null
  );
  const { data: tipCount = 0 } = usePostTipCount(stream.id);

  // stream.isLive routinely flips true AFTER mount: LivePostWithStatus merges
  // the Supabase live flag in asynchronously, and the platform marks streams
  // live before any ingest connects. The ended latch must follow the flip or
  // a viewer landing in that window is stuck on "Stream ended" for a stream
  // that is live — with the <video> never mounted, so playback can't recover.
  useEffect(() => {
    setStreamEnded(!liveNow);
  }, [liveNow]);

  // Same flip, second consequence: the WebRTC id only exists once the card
  // knows the stream is live, which is usually a beat after mount. Take the
  // fast path when it appears — unless it has already been tried and failed.
  // A handed-over session also overrides the Android HLS preference, since it
  // is already delivering frames.
  useEffect(() => {
    if (!bigEvent && whepPlaybackId && (handoff || (!preferAndroidHls() && !whepRecentlySilent(whepPlaybackId) && firstWhepRoute(whepSource?.provider === 'mediamtx') !== null)) && !whepFailedRef.current && !timeshiftRef.current.active) setTransport('whep');
  }, [whepPlaybackId, whepSource?.provider, handoff, bigEvent]);

  // Fetch DHB balance when gift drawer opens
  useEffect(() => {
    if (!showGiftDrawer || !walletAddress) return;
    let cancelled = false;
    setBalanceLoading(true);
    import('@/lib/contracts/stream-controller')
      .then(m => m.getDHBBalance(walletAddress))
      .then((bal) => {
        if (!cancelled) {
          const formatted = fromWei(bal);
          setDhbBalance(Number(formatted).toLocaleString(undefined, { maximumFractionDigits: 2 }));
        }
      })
      .catch(() => {
        if (!cancelled) setDhbBalance(null);
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });


  return () => { cancelled = true; };
  }, [showGiftDrawer, walletAddress, giftBalanceVersion]);

  /**
   * WebRTC first (about a second behind), HLS second (a few seconds). HLS is
   * made ready in the background the moment WebRTC starts, so whichever way
   * WebRTC fails, the picture comes from something already loaded.
   */
  useEffect(() => {
    if (transport !== 'whep' || streamEnded || !whepPlaybackId) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let pendingWhep: AbortController | null = null;
    let session: WhepSubscription | null = null;
    let stopWatch: (() => void) | undefined;

    const fallBack = (reason: string) => {
      if (cancelled) return;
      logger.info('Falling back to HLS', { reason, streamId: stream.id });
      // Latched: without it the promote-on-live effect below would flip the
      // transport straight back and the two would trade the element forever.
      whepFailedRef.current = true;
      // The stream itself cannot be shown over WebRTC in time (silent, refused
      // by the server, or keyframes far apart): next open goes straight to HLS.
      if (reason === 'no frames' || reason === 'refused' || reason === 'slow keyframes') rememberWhepSilent(whepPlaybackId);
      setTransport('hls');
    };

    // A session that negotiates but never delivers media is the worst case:
    // no error to catch and nothing on screen. Each stage gets its own wait.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (ms: number, reason: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!cancelled && !hasRealPicture(video)) void failOver(reason);
      }, ms);
    };

    const selfHosted = whepSource?.provider === 'mediamtx';
    let route: WhepRoute = 'direct';
    let attempts = 0;
    let triedRelay = false;
    let connected = false;
    /** The direct attempt never connected, so a relay that does says why. */
    let directDead = false;

    // A self-hosted stream has a second WebRTC route before HLS: signaling
    // via the api.dehub.io edge with TURN carrying the media. It is for a
    // network that cannot reach the ingest host at all, where the HLS
    // "fallback" below is on the same unreachable host and saves nothing,
    // and for a picture that froze mid-watch. Livepeer streams skip straight
    // to the ladder as before.
    const failOver = async (reason: string) => {
      if (cancelled) return;
      stopWatch?.();
      // Whatever this attempt still has on the way is no longer wanted.
      const failedAttempt = ++attempts;
      clearTimeout(timer);
      pendingWhep?.abort();
      // Answered, and still no way through for the media: that is this
      // network, not this stream. The next live opens on the route after.
      const blocked = reason === 'no media route' || (route === 'relay' && (reason === 'no answer' || reason === NO_RELAY_CANDIDATE));
      if (selfHosted && blocked) rememberWhepRouteBlocked(route);
      if (route === 'direct' && !connected) directDead = true;
      // The host answered, so HLS will too: show that picture now rather
      // than sit through a second connect. A session that connected and sent
      // nothing is the stream itself, and the relay would only repeat it.
      // The same goes for a stream the server refused, or one HLS will show
      // sooner: neither is the network's doing.
      const streamsOwn = reason === 'refused' || reason === 'not on air' || reason === 'slow keyframes';
      const relayNext = !triedRelay && selfHosted && !streamsOwn && reason !== 'no media route' && !(reason === 'no frames' && connected) && !whepRouteBlocked('relay');
      if (relayNext) {
        triedRelay = true;
        const relay = await fetchTurnServers();
        if (cancelled || failedAttempt !== attempts) return;
        if (relay.length) {
          logger.info('WHEP direct failed; retrying via the signaling edge', {
            reason,
            streamId: stream.id,
          });
          const old = session;
          session = null;
          void old?.stop();
          if (!cancelled) await start('relay', relay);
          return;
        }
      }
      fallBack(reason);
    };

    const start = async (which: WhepRoute, iceServers?: RTCIceServer[]) => {
      const attempt = ++attempts;
      route = which;
      whepRouteRef.current = which;
      if (which === 'relay') triedRelay = true;
      connected = false;
      setIsBuffering(playbackRequestedRef.current);
      arm(WHEP_ANSWER_TIMEOUT_MS, 'no answer');
      const onStateChange = (state: WhepState, detail?: string) => {
        if (cancelled || attempt !== attempts) return;
        if (state === 'playing') {
          connected = true;
          setError(null);
          // The relay carried what the direct route could not: start the
          // next live on it instead of waiting the direct one out again.
          if (which === 'relay' && directDead && selfHosted) rememberWhepRouteBlocked('direct');
          if (!hasRealPicture(video)) arm(WHEP_FRAME_TIMEOUT_MS, 'no frames');
        }
        else if (state === 'reconnecting') setError('reconnecting');
        else if (state === 'failed') void failOver(detail || 'connection failed');
      };
      try {
        // The feed card's session, still running: adopt it instead of
        // negotiating a second one, so the picture never drops.
        const handed = which === 'direct' ? takeLiveSession(whepPlaybackId) : null;
        let opened: WhepSubscription;
        if (handed) {
          handed.setStateListener(onStateChange);
          opened = handed;
          connected = true;
        } else {
          const { subscribeToWhep } = await import('@/lib/livepeer/whep');
          if (cancelled || attempt !== attempts) return;
          const controller = new AbortController();
          pendingWhep = controller;
          try {
            opened = await subscribeToWhep({
              playbackId: whepPlaybackId,
              endpoint: (which === 'relay' ? edgeWhepEndpointFor : whepEndpointFor)({
                provider: whepSource?.provider,
                playbackId: whepPlaybackId,
              }),
              iceServers,
              signal: controller.signal,
              onStateChange,
            });
          } finally {
            if (pendingWhep === controller) pendingWhep = null;
          }
        }
        // Given up on while its answer was on the way: hang it up, or it
        // would take the element back from whatever replaced it.
        if (cancelled || attempt !== attempts) {
          await opened.stop();
          return;
        }
        session = opened;
        whepSessionRef.current = opened;
        video.srcObject = opened.stream;
        stopWatch = watchLiveProgress(video, {
          stallMs: 6000,
          preferVideoFrames: () => true,
          shouldWatch: () => playbackRequestedRef.current && !broadcastPausedRef.current && video.videoWidth > 0,
          onStall: () => void failOver('frozen picture'),
        });
        if (!hasRealPicture(video)) {
          if (connected) arm(WHEP_FRAME_TIMEOUT_MS, 'no frames');
          else arm(WHEP_CONNECT_TIMEOUT_MS, 'no media route');
        }
        if (playbackRequestedRef.current && visualActivity.isLivePlaybackAllowed()) {
          await video.play().catch(() => {
            if (!cancelled && attempt === attempts) setIsBuffering(false);
          });
        }
        if (cancelled || attempt !== attempts) return;
        videoPlaybackManager.register(videoId, () => {
          setPlaybackWanted(false);
          video.pause();
          setIsPlaying(false);
        }, undefined, undefined, () => video, true);
      } catch (e) {
        if (cancelled || attempt !== attempts) return;
        // Answered with a refusal: no other route changes that. A 404 is a
        // stream between two broadcasts, which says nothing about the next
        // one, so only the other refusals are remembered.
        if ((e as Error)?.name === 'WhepRefusedError') {
          void failOver((e as { status?: number }).status === 404 ? 'not on air' : 'refused');
        } else void failOver((e as Error)?.message || 'subscribe failed');
      }
    };

    // A network already seen to drop direct media starts on the relay. A
    // session handed over by the feed card is direct and already running.
    const open = async () => {
      if (firstWhepRoute(selfHosted) === 'relay' && !peekLiveSession(whepPlaybackId)) {
        const relay = await fetchTurnServers();
        if (cancelled) return;
        if (relay.length) await start('relay', relay);
        else fallBack('relay unavailable');
        return;
      }
      await start('direct');
    };

    // HLS, loaded in the background while WebRTC tries. Its first playlist
    // also says how far apart this stream's keyframes are: WebRTC can only
    // start on one, so when they are seconds apart HLS shows a picture first.
    // Not for a session handed over by the feed card: its picture is up.
    const standbyUrl = urlsToTry[0];
    if (!peekLiveSession(whepPlaybackId) && !playsNativeHls(video, standbyUrl)) {
      warmLiveHls(standbyUrl, LIVE_HLS_CONFIG, (segmentSeconds) => {
        if (cancelled || segmentSeconds < SLOW_KEYFRAME_SEC || hasRealPicture(video)) return;
        void failOver('slow keyframes');
      });
    }
    const onPicture = () => {
      if (video.srcObject && hasRealPicture(video)) dropWarmLiveHls(standbyUrl);
    };
    video.addEventListener('resize', onPicture);
    video.addEventListener('loadeddata', onPicture);

    void open();

    return () => {
      cancelled = true;
      pendingWhep?.abort();
      clearTimeout(timer);
      stopWatch?.();
      video.removeEventListener('resize', onPicture);
      video.removeEventListener('loadeddata', onPicture);
      videoPlaybackManager.unregister(videoId);
      if (whepSessionRef.current === session) whepSessionRef.current = null;
      // Minimised: the corner window owns the session now.
      if (session && handedToMiniRef.current === session) {
        if (video.srcObject === session.stream) video.srcObject = null;
        return;
      }
      releaseAfterPictureInPicture(video, () => {
        void session?.stop();
        // Leaving a dead srcObject attached stops the HLS path from ever
        // getting a picture onto this element.
        if (session && video.srcObject === session.stream) video.srcObject = null;
      });
    };
    // urlsToTry is read for the standby only; a new list for the same stream
    // must not restart a WebRTC session that is playing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, whepPlaybackId, whepSource?.provider, streamEnded, videoId, stream.id, setPlaybackWanted]);

  useEffect(() => {
    if (transport !== 'hls') return;
    const video = videoRef.current;
    const shouldAttemptPlayback = stream.isLive || hasPlaybackUrl;
    if (!video || !shouldAttemptPlayback || urlsToTry.length === 0) return;

    let urlIndex = 0;
    const currentUrl = () => urlsToTry[urlIndex];
    logger.info('Initializing player', {
      streamId: stream.id,
      isLive: stream.isLive,
      urlsToTry: urlsToTry.length,
      currentUrl: currentUrl(),
    });
    const resumePlayback = () => {
      if (!playbackRequestedRef.current || !visualActivity.isLivePlaybackAllowed()) return;
      setIsBuffering(true);
      void video.play().catch(() => setIsBuffering(false));
    };
    // Where the viewer asked to be (a pause or a rewind that came from
    // WebRTC, or a reload after a long freeze), applied once the playlist
    // says where live is. Until then the element is left alone.
    let hlsForEdge: Hls | null = null;
    const applyResume = () => {
      const want = timeshiftRef.current.resume;
      if (!want) return;
      const edge = liveEdgeOf(video, hlsForEdge);
      if (edge == null) return;
      timeshiftRef.current.resume = null;
      const behind = want.behind + (Date.now() - want.at) / 1000;
      video.currentTime = timeForBehind(edge, seekStartOf(video, hlsForEdge), behind);
    };
    video.addEventListener('loadedmetadata', applyResume);
    video.addEventListener('loadeddata', applyResume);
    video.addEventListener('canplay', applyResume);
    const stopResumeListeners = () => {
      video.removeEventListener('loadedmetadata', applyResume);
      video.removeEventListener('loadeddata', applyResume);
      video.removeEventListener('canplay', applyResume);
    };
    /** Remember the spot before a reload, so the reload carries on from it. */
    const holdPlace = () => {
      const edge = liveEdgeOf(video, hlsForEdge);
      if (edge == null) return;
      timeshiftRef.current.resume = { behind: Math.max(0, edge - video.currentTime), at: Date.now() };
    };

    // Native HLS where the browser has it (Safari, iOS): cooler than hls.js
    // and skips its download. Not for a self-hosted ladder carrying Opus,
    // which a positive native probe does not promise to play — the server's
    // AAC copy, which is what such a browser is handed, is fine.
    if (playsNativeHls(video, currentUrl())) {
      // Native playback has none of hls.js's built-in resilience, so re-create
      // the essentials here: multi-CDN failover through urlsToTry, bounded
      // reconnect attempts for live streams, and the error overlay.
      let nativeUrlIndex = 0;
      let nativeRetries = 0;
      const nativeTimeouts = new Set<ReturnType<typeof setTimeout>>();
      const scheduleNative = (fn: () => void, delay: number) => {
        const id = setTimeout(() => {
          nativeTimeouts.delete(id);
          fn();
        }, delay);
        nativeTimeouts.add(id);
      };
      const loadCurrent = () => {
        video.src = urlsToTry[nativeUrlIndex];
        video.load();
        resumePlayback();
      };
      const onNativeError = () => {
        if (nativeUrlIndex < urlsToTry.length - 1) {
          nativeUrlIndex++;
          setError('alternateSource');
          loadCurrent();
        } else if (stream.isLive && nativeRetries < 5) {
          nativeRetries++;
          nativeUrlIndex = 0;
          setError('reconnecting');
          scheduleNative(loadCurrent, 3000 * nativeRetries);
        } else {
          setError('unavailable');
          if (!stream.isLive) setStreamEnded(true);
        }
      };
      const onNativePlaying = () => {
        nativeRetries = 0;
        setError(null);
      };
      // Safari can fire `ended` on a live playlist that missed a refresh. The
      // broadcast is still going (its status says when it really stops), so
      // pick the playlist back up instead of showing "Stream ended".
      const onNativeEnded = () => {
        if (!stream.isLive) return;
        nativeUrlIndex = 0;
        scheduleNative(loadCurrent, 1500);
      };
      // Native HLS has no stall recovery of its own: a missed segment leaves
      // the picture frozen on `waiting` forever. A slow connection should not
      // cost the viewer what they were watching, so first step just past the
      // hole, then reload the playlist and carry on from the same spot. Only
      // a third freeze in a row jumps to live.
      const stopWatch = watchLiveProgress(video, {
        stallMs: 8000,
        shouldWatch: () => playbackRequestedRef.current,
        onStall: (count) => {
          logger.info('Live picture frozen', { streamId: stream.id, count, native: true });
          if (count === 1) {
            video.currentTime = video.currentTime + 0.25;
            resumePlayback();
            return;
          }
          if (count === 2) {
            holdPlace();
            loadCurrent();
            return;
          }
          const edge = nativeLiveEdge(video);
          if (edge != null && edge > video.currentTime + 1) {
            video.currentTime = edge;
            resumePlayback();
          } else {
            loadCurrent();
          }
        },
      });
      video.addEventListener('error', onNativeError);
      video.addEventListener('playing', onNativePlaying);
      video.addEventListener('ended', onNativeEnded);
      video.src = urlsToTry[0];
      resumePlayback();
      videoPlaybackManager.register(videoId, () => {
        setPlaybackWanted(false);
        video.pause();
        setIsPlaying(false);
      }, undefined, undefined, () => video, true);
      return () => {
        nativeTimeouts.forEach(clearTimeout);
        stopWatch();
        stopResumeListeners();
        video.removeEventListener('error', onNativeError);
        video.removeEventListener('playing', onNativePlaying);
        video.removeEventListener('ended', onNativeEnded);
        videoPlaybackManager.unregister(videoId);
      };
    }

    let disposed = false;
    let stopHlsWatch: (() => void) | undefined;
    // Retry timers must die with the effect — a timer firing after cleanup
    // would call loadSource/startLoad on a destroyed hls instance.
    const retryTimeouts = new Set<ReturnType<typeof setTimeout>>();
    const scheduleRetry = (fn: () => void, delay: number) => {
      const id = setTimeout(() => {
        retryTimeouts.delete(id);
        if (disposed) return;
        fn();
      }, delay);
      retryTimeouts.add(id);
    };
    (async () => {
    // Made ready while WebRTC was trying: playlists and the first piece of
    // video are already here, so attaching the element is all that is left.
    const warmed = await (takeWarmLiveHls(currentUrl()) ?? null);
    if (disposed) {
      warmed?.hls.destroy();
      return;
    }
    const { default: Hls } = warmed ? { default: warmed.Hls } : await import('hls.js');
    if (disposed) return;
    if (Hls.isSupported()) {
      const hls = warmed?.hls ?? new Hls({
        ...LIVE_HLS_CONFIG,
        ...(bigEvent ? BIG_EVENT_HLS_CONFIG : {}),
      });

      hlsForEdge = hls;
      hls.on(Hls.Events.LEVEL_LOADED, applyResume);
      const tryLoad = () => {
        const streamUrl = currentUrl();
        logger.info('HLS loading source...', { urlIndex, streamUrl });
        hls.loadSource(streamUrl);
      };

      if (!warmed) tryLoad();
      hls.attachMedia(video);
      resumePlayback();

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          logger.error('HLS Fatal Error', { type: data.type, details: data.details }, data);

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            const retryCount = (hls as any)._networkRetryCount || 0;
            // Live streams get many more retries — connection blips shouldn't kill the player
            const maxRetriesPerUrl = stream.isLive ? 20 : 5;

            if (retryCount < maxRetriesPerUrl) {
              (hls as any)._networkRetryCount = retryCount + 1;
              // Back off: 1s, 2s, 3s → 5s → 10s. A playlist that is not up yet is
              // usually only a beat away; a flat 3s made every miss cost a full wait.
              const delay = retryCount < 3 ? 1000 * (retryCount + 1) : retryCount < 10 ? 5000 : 10000;
              logger.info(`Network error, retrying in ${delay / 1000}s... (${retryCount + 1}/${maxRetriesPerUrl})`);
              setError('connecting');
              scheduleRetry(() => {
                // Any manifest/level error = full source reload (not just resume)
                // manifestParsingError: server returned non-HLS content (stream not ready yet)
                // manifestLoadError / levelLoadError: HTTP-level failure
                const needsReload = (
                  data.details === 'manifestLoadError' ||
                  data.details === 'manifestParsingError' ||
                  data.details === 'manifestLoadTimeOut' ||
                  data.details === 'levelLoadError' ||
                  data.details === 'levelLoadTimeOut'
                );
                if (needsReload) {
                  hls.loadSource(currentUrl());
                } else {
                  hls.startLoad();
                }
              }, delay);
            } else if (urlIndex < urlsToTry.length - 1) {
              // Try next CDN URL
              urlIndex++;
              (hls as any)._networkRetryCount = 0;
              logger.info('Trying alternate CDN URL...', { urlIndex, url: currentUrl() });
              setError('alternateSource');
              tryLoad();
            } else if (stream.isLive) {
              // Live stream: cycle back through all URLs and keep retrying — never give up
              urlIndex = 0;
              (hls as any)._networkRetryCount = 0;
              logger.info('All URLs exhausted on live stream, cycling back in 15s...');
              setError('reconnecting');
              scheduleRetry(tryLoad, 15000);
            } else {
              // Ended/recording stream: give up
              setError('unavailable');
              setStreamEnded(true);
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            logger.info('Attempting media error recovery...');
            hls.recoverMediaError();
          } else {
            // Other fatal errors (e.g. internal): only end for non-live streams
            if (!stream.isLive) {
              hls.destroy();
              setStreamEnded(true);
            } else {
              // For live streams, try reloading the source instead of ending
              logger.warn('Non-network fatal error on live stream, reloading source...');
              setError('reconnecting');
              scheduleRetry(() => hls.loadSource(currentUrl()), 5000);
            }
          }
        } else {
          logger.warn('HLS Non-fatal error', { type: data.type, details: data.details });
        }
      });

      // hls.js nudges small gaps itself. A longer freeze keeps the viewer's
      // place: load again from where the picture stopped, then a fresh
      // playlist that carries on from the same spot. Only a third freeze in
      // a row gives up on it and jumps to live.
      stopHlsWatch = watchLiveProgress(video, {
        stallMs: 10000,
        shouldWatch: () => playbackRequestedRef.current && stream.isLive,
        onStall: (count) => {
          if (disposed) return;
          logger.info('Live picture frozen', { streamId: stream.id, count, native: false });
          if (count === 1) {
            hls.startLoad(video.currentTime);
            resumePlayback();
            return;
          }
          if (count === 2) {
            holdPlace();
            hls.loadSource(currentUrl());
            hls.startLoad();
            return;
          }
          const sync = hls.liveSyncPosition;
          if (sync != null && sync > video.currentTime + 1) {
            video.currentTime = sync;
            resumePlayback();
          } else {
            hls.loadSource(currentUrl());
            hls.startLoad();
          }
        },
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = currentUrl();
    }
    })().catch(() => {
      // hls.js chunk failed to load (flaky network / deploy skew)
      if (!disposed) setError('unavailable');
    });

    videoPlaybackManager.register(videoId, () => {
      setPlaybackWanted(false);
      video.pause();
      setIsPlaying(false);
    }, undefined, undefined, () => video, true);

    return () => {
      disposed = true;
      stopHlsWatch?.();
      stopResumeListeners();
      retryTimeouts.forEach(clearTimeout);
      retryTimeouts.clear();
      const hls = hlsRef.current;
      releaseAfterPictureInPicture(video, () => hls?.destroy());
      videoPlaybackManager.unregister(videoId);
    };
    // streamEnded is a dependency on purpose: the <video> only mounts when it
    // is false, and when the late-isLive resync clears the latch this effect
    // must run again on the re-render that mounts the element — the isLive
    // flip alone fires it one render too early, against a null videoRef.
  }, [stream.isLive, stream.thumbnail, videoId, hasPlaybackUrl, urlsToTry, streamEnded, transport, bigEvent]);

  const togglePlay = useCallback(() => {
    if (!visualActivity.isLivePlaybackAllowed()) return;
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying || isBuffering) {
      setPlaybackWanted(false);
      setIsBuffering(false);
      // A pause is a place to come back to. WebRTC keeps nothing behind the
      // edge, so the paused frame stays up while the HLS copy loads under it
      // and Play carries on from here instead of from live.
      if (!streamEnded && stream.isLive && hasPlaybackUrl) {
        const onWhep = transportRef.current === 'whep';
        timeshiftRef.current = {
          active: true,
          fromWhep: onWhep || timeshiftRef.current.fromWhep,
          resume: onWhep ? { behind: 0, at: Date.now() } : null,
        };
        if (onWhep) {
          holdFrame(video);
          setTransport('hls');
        }
      }
      video.pause();
      videoPlaybackManager.stop(videoId);
    } else {
      setPlaybackWanted(true);
      setError(null);
      setIsBuffering(true);
      videoPlaybackManager.play(videoId);
      video.play().catch(() => {
        setIsBuffering(false);
        setIsPlaying(false);
        setError('playFailed');
      });
    }
  }, [isPlaying, isBuffering, videoId, streamEnded, stream.isLive, hasPlaybackUrl, setPlaybackWanted]);

  /**
   * Pause, rewind and back-to-live, for the timeline and the LIVE tag. Built
   * once: the controls poll `snapshot` themselves, so moving along the
   * timeline never re-renders this card around the playing video.
   */
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  const timeshiftLiveRef = useRef(false);
  timeshiftLiveRef.current = !!stream.isLive && !streamEnded && hasPlaybackUrl;
  const timeshift = useMemo<LiveTimeshift>(() => {
    const play = (video: HTMLVideoElement) => {
      setPlaybackWanted(true);
      setError(null);
      videoPlaybackManager.play(videoId);
      void video.play().catch(() => setIsBuffering(false));
    };
    return {
      snapshot: (): TimeshiftSnap | null => {
        const video = videoRef.current;
        if (!video || !timeshiftLiveRef.current) return null;
        const paused = video.paused || !playbackRequestedRef.current;
        const want = timeshiftRef.current.resume;
        if (want) return liveEdgeSnap(paused, want.behind + (paused ? (Date.now() - want.at) / 1000 : 0));
        if (video.srcObject) return liveEdgeSnap(paused);
        const edge = liveEdgeOf(video, hlsRef.current);
        if (edge == null) return liveEdgeSnap(paused);
        const snap = timelineSnap(video.currentTime, edge, seekStartOf(video, hlsRef.current), paused);
        // Caught back up by itself (a short freeze that cleared): live again.
        if (!paused && snap.behind < 1) timeshiftRef.current.active = false;
        return snap;
      },
      seek: (ratio: number) => {
        const video = videoRef.current;
        if (!video || !timeshiftLiveRef.current) return;
        const edge = video.srcObject ? null : liveEdgeOf(video, hlsRef.current);
        const windowSec = edge != null ? timelineSnap(video.currentTime, edge, seekStartOf(video, hlsRef.current), video.paused).windowSec : liveEdgeSnap(false).windowSec;
        const behind = behindForRatio(ratio, windowSec);
        if (transportRef.current === 'whep' || edge == null) {
          // Nothing behind the edge here yet: swap to HLS and stand there once it loads.
          timeshiftRef.current = { active: true, fromWhep: transportRef.current === 'whep' || timeshiftRef.current.fromWhep, resume: { behind, at: Date.now() } };
          if (transportRef.current === 'whep') {
            holdFrame(video);
            setTransport('hls');
          }
        } else {
          timeshiftRef.current.active = true;
          video.currentTime = timeForBehind(edge, seekStartOf(video, hlsRef.current), behind);
        }
        if (playbackRequestedRef.current || !video.paused) play(video);
      },
      goLive: () => {
        const video = videoRef.current;
        if (!video) return;
        const { fromWhep } = timeshiftRef.current;
        timeshiftRef.current = { active: false, fromWhep: false, resume: null };
        // Came off WebRTC to look back: go back to it, a second behind live
        // instead of HLS's few.
        if (fromWhep && transportRef.current === 'hls' && whepPlaybackIdRef.current && !whepFailedRef.current && !bigEventRef.current) {
          setPlaybackWanted(true);
          setIsBuffering(true);
          setTransport('whep');
          return;
        }
        const edge = liveEdgeOf(video, hlsRef.current);
        if (edge != null && !video.srcObject) video.currentTime = edge;
        play(video);
      },
      togglePlay: () => togglePlayRef.current(),
    };
  }, [videoId, setPlaybackWanted]);

  /**
   * Back from another tab or app: still the same player and the same room,
   * so carry on from the live edge — no reload, no spinner. Also covers a
   * browser that paused the element on its own while hidden, and a bfcache
   * restore after `pagehide` stopped every player on the page.
   */
  useEffect(() => {
    if (streamEnded) return;
    const resume = () => {
      const video = videoRef.current;
      if (!video || !playbackRequestedRef.current || !visualActivity.isLivePlaybackAllowed()) return;
      // Behind on purpose (rewound along the timeline): stay there.
      if (!timeshiftRef.current.active) catchUpToLiveEdge(video, hlsRef.current);
      if (video.paused) void video.play().catch(() => undefined);
    };
    const stopListening = onReturnToTab(resume);
    return stopListening;
  }, [streamEnded]);
  useEffect(() => {
    if (!livePlaybackAllowed || streamEnded) return;
    const video = videoRef.current;
    if (video?.paused && playbackRequestedRef.current && (video.srcObject || video.currentSrc)) {
      void video.play().catch(() => undefined);
    }
  }, [livePlaybackAllowed, streamEnded]);

  // Switching tabs drops the live into a floating window where the browser
  // can (Chrome/Edge/Safari); the button below does it by hand anywhere.
  useAutoPictureInPicture(videoRef, isPlaying && !streamEnded);
  const inPictureInPicture = usePictureInPicture(videoRef);
  const [pipAvailable, setPipAvailable] = useState(false);
  useEffect(() => { setPipAvailable(canPictureInPicture(videoRef.current)); }, [streamEnded, transport]);
  const togglePip = useCallback(() => { void togglePictureInPicture(videoRef.current); }, []);

  /*
   * Minimise: keep the live playing in a corner window (or as a listen bar)
   * while the viewer browses. The running WebRTC session and an audience
   * seat go with it, so the picture never drops and the creator never sees
   * a leave and a join.
   */
  const canMinimise = !swipeFeed && !!stream.streamId && !!stream.isLive && !streamEnded && hasPlaybackUrl;
  const minimisingRef = useRef(false);
  const minimiseLive = useCallback(async (mode: LiveMiniMode = 'video') => {
    const streamId = stream.streamId;
    const video = videoRef.current;
    // Only the mounted, unlocked viewer can hand off playback.
    if (!canMinimise || !streamId || !video || minimisingRef.current) return;
    minimisingRef.current = true;
    const path = `${window.location.pathname}${window.location.search}`;
    let seat: { leave: () => void } | null = null;
    if (!isOwnStream) {
      try {
        const { joinStreamPresence } = await import('@/lib/api/dehub/stream-presence');
        if (videoRef.current !== video || path !== `${window.location.pathname}${window.location.search}`) {
          minimisingRef.current = false;
          return;
        }
        seat = joinStreamPresence(streamId);
      } catch {
        // Presence may be temporarily unavailable while the media still plays.
      }
    }
    if (videoRef.current !== video) { minimisingRef.current = false; return; }
    const session = transportRef.current === 'whep' ? whepSessionRef.current : null;
    const playingUrl = hlsRef.current?.url ?? video.currentSrc;
    const urls = playingUrl && urlsToTry.includes(playingUrl)
      ? [playingUrl, ...urlsToTry.filter((url) => url !== playingUrl)]
      : urlsToTry;
    if (session) handedToMiniRef.current = session;
    openLiveMini({
      streamId,
      playbackId: whepPlaybackId,
      urls,
      title: stream.title,
      host: stream.creatorUsername ? `@${stream.creatorUsername}` : stream.streamer,
      avatar: stream.avatar,
      path,
      session,
      poster: snapshotLiveFrame(video),
      seat,
      mode,
    });
    if (isFullscreen) toggleFullscreen();
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/app');
  }, [canMinimise, stream.streamId, stream.title, stream.creatorUsername, stream.streamer, stream.avatar, isOwnStream, whepPlaybackId, urlsToTry, isFullscreen, toggleFullscreen, navigate]);

  /**
   * Hold the OS media session while this stream is audible, keyed on the
   * same `videoId` the playback manager uses. No seek handlers: live has
   * nowhere to scrub to.
   */
  useEffect(() => {
    if (!isPlaying || isMuted || streamEnded) {
      releaseMediaSession(videoId);
      return;
    }
    claimMediaSession(
      videoId,
      {
        title: stream.title || _copy("copy.fe1ed8de5976", { defaultValue: "Riftn live" }),
        artist: stream.streamer,
        artwork: stream.thumbnail || null,
      },
      {
        play: togglePlay,
        pause: togglePlay,
        stop: togglePlay,
      },
    );
    setMediaSessionPlaying(videoId, true);
  }, [isPlaying, isMuted, streamEnded, videoId, stream.title, stream.streamer, stream.thumbnail, togglePlay, _copy]);

  // A card scrolled out of the virtualised feed, or a route change, must not
  // leave the OS holding a session for a player that is gone.
  useEffect(() => () => releaseMediaSession(videoId), [videoId]);

  // On screen as a guest: the broadcast runs seconds behind, so letting it
  // play would hand the guest their own voice back. Silence it while the
  // guest room is open; they unmute themselves after, as with any stream.
  const quietForGuestRoom = useCallback((open: boolean) => {
    if (!open) return;
    const video = videoRef.current;
    if (video) video.muted = true;
    setIsMuted(true);
  }, []);

  // The speaker's own level (the same saved level every video uses). Hover the
  // speaker on a desktop and a slider comes up; click still mutes.
  const volume = useMediaVolume();
  const [volumeOpen, setVolumeOpen] = useState(false);
  useEffect(() => {
    for (const el of [videoRef.current, replayRef.current]) if (el) el.volume = volume;
  }, [volume, isPlaying, streamEnded]);
  /** Dragging to zero mutes and dragging off zero unmutes, so the icon and slider agree. */
  const setVolumeTo = useCallback((next: number) => {
    const level = Math.max(0, Math.min(1, next));
    vpSetVolume(level);
    const video = videoRef.current ?? replayRef.current;
    if (video) video.volume = level;
    const shouldMute = level === 0;
    if (shouldMute !== isMuted) {
      if (video) video.muted = shouldMute;
      setIsMuted(shouldMute);
      videoPlaybackManager.globalMuted = shouldMute;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    // Whichever video is on screen. An ended stream with a recording plays
    // through `replayRef` and never mounts the live element at all, so this
    // used to return on the first line and the mute button did nothing at
    // all on a replay — which is most of what anyone opens after the fact.
    const video = videoRef.current ?? replayRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
    videoPlaybackManager.globalMuted = !isMuted;
  }, [isMuted]);


  // Muting the stream mutes the tip readings with it, and cuts one already
  // mid-sentence. They are synthesised locally, so nothing about the player's
  // own volume would otherwise touch them — a viewer who muted a stream in a
  // quiet room would otherwise have had tip messages read out loud at them.
  useEffect(() => {
    setTipTtsEnabled(!isMuted);
  }, [isMuted]);


  // The on-chain tip path encodes the tokenId with BigInt(), so it must be
  // the numeric NFT tokenId — the livestream-API fallback route can hand this
  // card a 24-hex Mongo _id as stream.id, which would throw mid-flow (after
  // a possible approval tx). Gate gifting on it instead.
  const numericTokenId = /^\d+$/.test(stream.id) ? stream.id : undefined;

  // The real payment: an on-chain DHB tip to the streamer on Base, recorded
  // in tip_records under the NFT tokenId (feeding the post tip counter and
  // the backend's receivedTips crediting). onSubmitted then records it on the
  // stream itself so the activity log and GiftSent broadcast fire.
  const { tip: sendGiftTip, isTipping: isSendingGift } = useTipPayment({
    creatorAddress: stream.creatorId,
    tokenId: numericTokenId,
    onSubmitted: (txHash, paid) => {
      ownGiftHashes.current.add(String(txHash).toLowerCase());
      const paidToken = sendingGiftToken.current;
      sendingGiftToken.current = null;
      // Tiers, celebrations and the stream total are all in DHB.
      const amount = paidToken ? Math.round(paid / DHB_PRELISTING_USD) : paid;
      if (!paidToken) queryClient.setQueryData(['post-tip-count', stream.id], (old: number | undefined) => (old || 0) + amount);
      if (!apiStreamId || !stream.creatorId) return;
      // Play the celebration the sender paid for straight away, before the
      // record round-trips.
      const spokenMessage = giftMessage.trim().slice(0, MAX_TTS_CHARS);
      enqueueGift({
        amount,
        selectedTier: tierFromAmount(amount).name,
        username: t('liveGift.you', 'You'),
        message: spokenMessage || undefined,
      });
      // The sender hears their own message on the same beat as the celebration
      // they paid for. Their echo off `streamer.tip` is dropped on the wallet
      // address, so this is the only place it is spoken for them.
      speakTipMessage(spokenMessage);
      const payload = {
        transactionHash: txHash,
        tokenId: stream.id,
        amount,
        recipient: stream.creatorId,
        tokenAddress: paidToken?.address ?? DHB_TOKEN.address,
        // The tier the amount bought, by its English name. Mobile's viewer
        // reads exactly this field to choose which celebration to play, so a
        // web gift without it was downgraded to the bottom tier on every
        // phone in the room.
        selectedTier: tierFromAmount(amount).name,
        // The line the room hears read out. The backend already carries it
        // through to `gift.meta.message` on the `streamer.tip` broadcast, so
        // filling it in is the whole of the wire work for tip-to-speech.
        message: spokenMessage || undefined,
        timestamp: Date.now(),
      };
      // The backend accepts gift records only while ITS status is LIVE or
      // PAUSED, which flips on the Livepeer ingest webhook — often seconds
      // after this card already renders live (the platform flags streams
      // live before ingest connects). Retry with backoff so a gift sent in
      // that window still lands in the activity feed. The DHB itself already
      // moved on-chain either way.
      const record = (attempt: number) => {
        gift(apiStreamId, payload).catch((err) => {
          if (attempt < 3) {
            setTimeout(() => record(attempt + 1), attempt === 1 ? 8000 : 20000);
          } else {
            logger.warn('Gift activity record failed after retries', err);
          }
        });
      };
      record(1);
    },
    onSuccess: () => {
      setGiftAmount.complete(giftAmount, '');
      setGiftMessage.complete(giftMessage, '');
    },
  });

  const handleSendGift = useCallback(() => {
    if (!isAuthenticated) {
      openLoginModal();
      return;
    }
    if (streamEnded) {
      toast.info(_copy("copy.05f74cfe05cd", { defaultValue: "Stream ended, tune in live to engage" }));
      return;
    }
    if (!numericTokenId) {
      toast.error(_copy("copy.e1d1843963c8", { defaultValue: "Gifting is unavailable for this stream" }));
      return;
    }
    const amount = parseFloat(giftAmount);
    if (!amount || amount < MIN_TIP_DHB) {
      toast.error(dhbText(_copy("copy.645b3cac6cc1", { defaultValue: "Minimum gift is {{value1}} DHB", value1: MIN_TIP_DHB })));
      return;
    }
    // The drawer goes away on the tap. The chain work runs behind it with
    // its own progress and error toasts, and the celebration plays over the
    // stream the moment the operation is submitted — nobody should sit in a
    // sheet watching a spinner for a payment that is already on its way. The
    // amount and message stay in state until it succeeds, so a failed send
    // reopens with everything still filled in.
    if (giftDirect) {
      const cost = giftCostIn(amount);
      const balance = giftPayWith ? Number(giftPayWith.balance) / 10 ** giftPayWith.decimals : 0;
      if (cost > balance) {
        toast.error(t('liveGift.notEnoughToken', { symbol: giftDirect.symbol, defaultValue: 'Not enough {{symbol}} for this gift' }));
        return;
      }
      setShowGiftDrawer(false);
      sendingGiftToken.current = giftDirect;
      void sendGiftTip(cost, giftDirect).finally(() => { sendingGiftToken.current = null; });
      return;
    }
    setShowGiftDrawer(false);
    if (!giftPayWith || !walletAddress) {
      void sendGiftTip(amount);
      return;
    }
    setFundingGift(true);
    void fundTipFromSource(giftPayWith, amount, walletAddress, t)
      .then(ready => { if (ready) return sendGiftTip(amount); })
      .finally(() => setFundingGift(false));
  }, [isAuthenticated, openLoginModal, streamEnded, numericTokenId, giftAmount, sendGiftTip, giftPayWith, giftDirect, walletAddress, t, _copy]);

  const handleEndStream = useCallback(async () => {
    if (!isAuthenticated) return;
    // PATCH /api/live/{id}/settings requires the Mongo ObjectId. Without it
    // the old code fell back to the tokenId, which endLiveStream silently
    // skips — the UI said "Stream ended" while every other surface kept the
    // stream live. Note the PATCH plants the client-honored settings marker;
    // the backend's own status only transitions once ingest stops and the
    // Livepeer idle webhook fires.
    if (!apiStreamId) {
      toast.error(_copy("copy.7318cd73d9bd", { defaultValue: "Could not end the stream from here — use the Go Live panel" }));
      return;
    }
    try {
      await end(apiStreamId);
      // Also clear the Supabase live-session row: it is what keeps this post
      // rendering as live for viewers whenever the API status lags or fails.
      const token = getAuthToken();
      const addr = walletAddress?.toLowerCase();
      if (token && addr) {
        supabase.functions.invoke('end-stream-session', {
          body: { tokenId: stream.id },
          headers: { 'x-wallet-address': addr, 'x-dehub-token': token },
        }).then(({ error: fnError }) => {
          if (fnError) logger.warn('end-stream-session failed (non-blocking)', fnError);
        }).catch((e) => logger.warn('end-stream-session failed (non-blocking)', e));
      }
      setStreamEnded(true);
      toast.success(_copy("copy.a5813ef6159a", { defaultValue: "Stream ended" }));
    } catch (err) {
      console.error('[LiveStream] End failed:', err);
      toast.error(_copy("copy.567c78188a0c", { defaultValue: "Failed to end stream" }));
    }
  }, [stream.id, apiStreamId, isAuthenticated, end, walletAddress, _copy]);

  const playbackErrorText = (code: PlaybackError) => {
    switch (code) {
      case 'reconnecting': return _copy("copy.27b80374e115", { defaultValue: "Reconnecting…" });
      case 'alternateSource': return _copy("copy.664926fff019", { defaultValue: "Trying alternate source…" });
      case 'connecting': return _copy("copy.fcdb7e76af21", { defaultValue: "Connecting to stream…" });
      case 'unavailable': return _copy("copy.a018e81b341d", { defaultValue: "Stream unavailable" });
      case 'playFailed': return _copy("copy.1b8ea5833a26", { defaultValue: "Failed to play stream" });
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart className="w-3 h-3 text-red-400" />;
      case 'gift': return <Gem className="w-3 h-3 text-zinc-200" />;
      case 'join': return <Activity className="w-3 h-3 text-green-400" />;
      case 'leave': return <Activity className="w-3 h-3 text-zinc-500" />;
      default: return <Activity className="w-3 h-3 text-zinc-400" />;
    }
  };

  const chatOverlayOption = canToggleChatOverlay ? (
    <DropdownMenuCheckboxItem
      checked={showChatOverlay}
      onCheckedChange={setShowChatOverlay}
      className="cursor-pointer text-white focus:bg-zinc-700 focus:text-white"
    >
      {t('liveOverlay.showCreatorChat', 'Show creator’s chat overlay')}
    </DropdownMenuCheckboxItem>
  ) : null;

  const optionsTrigger = (
    <DropdownMenuTrigger asChild>
      <button type="button" onClick={(e) => { if (!walletAddress && !canToggleChatOverlay) { e.preventDefault(); e.stopPropagation(); openLoginModal(); } }} aria-label={_copy("copy.2545613b2ba8", { defaultValue: "Post options" })} className={immersive ? "flex h-10 w-10 items-center justify-center text-white [filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.7))]" : "w-8 h-[37.5px] rounded-xl flex items-start justify-center pt-[6.25px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"}>
        <MoreVertical className="w-[23.5px] h-[23.5px]" />
      </button>
    </DropdownMenuTrigger>
  );

  // Above the full-bleed viewer (z-[55]) on phones.
  const optionsClassName = cn("bg-zinc-800 border-zinc-700", immersive && "z-[60]");
  const optionsMenu = !walletAddress && canToggleChatOverlay ? (
    <DropdownMenu>
      {optionsTrigger}
      <DropdownMenuContent align="end" className={optionsClassName}>
        {chatOverlayOption}
        <DropdownMenuItem
          onSelect={() => openLoginModal()}
          className="cursor-pointer text-white focus:bg-zinc-700 focus:text-white"
        >
          {t('auth.signIn', 'Sign in')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
          <DropdownMenu>
            {optionsTrigger}
            <DropdownMenuContent align="end" className={optionsClassName}>
              {chatOverlayOption}
              {/* Bookmark / Post info. Also on the action bar as icons on desktop —
                  the menu carries them at every width so there is one
                  reliable place to look. */}
              <DropdownMenuItem
                onClick={() => { if (!walletAddress) { openLoginModal(); return; } setShowAIChat(true); }}
                className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
                <AssistantNavIcon className="w-4 h-4" /> {t("postOptions.aiOverview", "AI overview")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toggleBookmark()}
                disabled={isBookmarkLoading}
                className={cn(
                  "hover:bg-zinc-700 cursor-pointer gap-2",
                  isBookmarked ? "text-yellow-500" : "text-white"
                )}
              >
                <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current")} />
                {isBookmarked ? t("postOptions.removeBookmark", "Remove bookmark") : t("postOptions.bookmark", "Bookmark")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={openPostInfoPage}
                className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
                <Info className="w-4 h-4" /> {t("postInfo.title", "Post info")}
              </DropdownMenuItem>
              {pipAvailable && !streamEnded && (
                <DropdownMenuItem
                  onClick={togglePip}
                  className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                  {_copy("copy.c49677dc5ccd", { defaultValue: "Picture in picture" })}
                </DropdownMenuItem>
              )}
              {canMinimise && (
                <DropdownMenuItem
                  onClick={() => { void minimiseLive('video'); }}
                  className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
                >
                  <ChevronDown className="w-4 h-4" /> {t('liveMini.minimiseHint', 'Keep watching while you browse')}
                </DropdownMenuItem>
              )}
              {canMinimise && (
                <DropdownMenuItem
                  onClick={() => { void minimiseLive('listen'); }}
                  className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
                >
                  <Headphones className="w-4 h-4" /> {t('liveMini.soundOnly', 'Sound only')}
                </DropdownMenuItem>
              )}
              {clippable && (
                <DropdownMenuItem
                  onClick={() => { void liveClip.start(); }}
                  className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
                >
                  <Scissors className="w-4 h-4" /> {t('liveClips.button', 'Clip this moment')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setShowActivityLog(true)}
                className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
                <Activity className="w-4 h-4" /> {t('postOptions.activityLog')}
              </DropdownMenuItem>
              {!isStreamOwner && (
                <DropdownMenuItem
                  onClick={() => { void notifyWhenLive(stream.creatorId, stream.streamer); }}
                  className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
                >
                  <Bell className="w-4 h-4" /> {t('postOptions.notifyWhenLive')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setShowReportModal(true)}
                className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
              >
                <Flag className="w-4 h-4" /> {t('postOptions.report')}
              </DropdownMenuItem>
              {!isStreamOwner && (
                <DropdownMenuItem
                  onClick={() => {
                    if (!walletAddress) { openLoginModal(); return; }
                    if (!stream.creatorId) return;
                    blockAuthor(stream.creatorId, stream.streamer || undefined);
                  }}
                  className="text-white hover:bg-zinc-700 cursor-pointer gap-2"
                >
                  <Ban className="w-4 h-4" /> {t('postOptions.blockCreator')}
                </DropdownMenuItem>
              )}
              {/* End stream - only for the stream creator while live */}
              {!streamEnded && isAuthenticated && isStreamOwner && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    // Keep the menu's own close from unmounting the dialog it
                    // opens — Radix closes the content on select by default.
                    e.preventDefault();
                    setConfirmEnd(true);
                  }}
                  disabled={isEnding}
                  className="text-red-400 hover:bg-zinc-700 cursor-pointer gap-2"
                >
                  {isEnding ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                  {t('postOptions.endStream')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
  );

  return (
    <div
      style={keyboardFit}
      data-live-frame={immersive ? '' : undefined}
      className={cn(
        immersive
          ? // The picture is the screen. `fixed` rather than a tall block in
            // the page: the post page still scrolls under it, and a stream
            // is not a thing you scroll past on a phone.
            'fixed inset-0 z-[55] bg-black isolate overscroll-contain'
          // No box of its own: the post page's bento already frames the
          // live post, and a second border inside it read as a card in a card.
          : 'isolate'
      )}
    >
      {/* Header with AI and menu buttons. Full-bleed has its own, drawn
          over the picture — see ImmersiveLiveChrome below. */}
      <div className={cn('flex items-center justify-between', immersive && 'hidden')}>
        <CardHeader
          postPage={postPage}
          username={stream.streamer}
          handle={stream.creatorUsername}
          avatarSeed={stream.avatar}
          contentType="live"
          isLive={stream.isLive && !streamEnded}
          creatorId={stream.creatorId}
          creatorUsername={stream.creatorUsername}
          badgeBalance={stream.creatorBadgeBalance}
        />
        <div className="flex items-center gap-2 pr-3">
          {/* Liking a live post is the same reaction as on any other post —
              it lives in the ActionBar below with the tray, the counts and the
              viewer's own state. A stream-only heart here kept a second
              counter nobody else could see and never showed as pressed. */}
          {/* Gifting is the diamond in the action bar under the picture,
              beside every other button; a second one up here was a copy. */}
          {optionsMenu}
        </div>
      </div>

      {/* Video Player or Stream Ended State */}
      <div
        ref={containerRef}
        data-media-full
        className={cn(
          'bg-black overflow-hidden',
          isFullscreen
            ? 'fixed inset-0 z-[9999] w-screen h-[100dvh]'
            : immersive
              ? // Fills the fixed root above rather than holding a 16:9 box:
                // a portrait broadcast on a phone is the whole frame, and a
                // landscape one letterboxes inside it as object-contain.
                'absolute inset-0'
              : 'relative aspect-video rounded-lg'
        )}
        style={
          immersive && rotation === 'css'
            ? {
                position: 'fixed', top: '50%', left: '50%', width: '100dvh', height: '100vw', zIndex: 60,
                transform: 'translate(-50%, -50%) rotate(90deg)',
              }
            : undefined
        }
      >

        {/* The paywall. It wraps the player rather than covering it, so a
            gated stream never mounts the <video> at all — no WHEP subscription
            and no HLS ladder for a broadcast the viewer has not paid for. The
            replay is behind the same gate: a stream sold per view is not free
            the day after. */}
        <GatedMedia
          gate={{
            tokenId: stream.tokenId || stream.id,
            creatorAddress: stream.creatorId,
            creatorName: stream.streamer,
            isPPV: stream.isPPV,
            ppvPrice: stream.ppvPrice,
            ppvCurrency: stream.ppvCurrency,
            ppvChainId: stream.ppvChainId,
            isLocked: stream.isLocked,
            lockedPrice: stream.lockedPrice,
            lockedCurrency: stream.lockedCurrency,
            lockedTokenAddress: stream.lockedTokenAddress,
            lockedChainId: stream.lockedChainId,
            subscriberPlans: stream.subscriberPlans,
            contentRating: stream.contentRating,
            canBypass: !!isStreamOwner || stream.isOwner || stream.isUnlocked,
          }}
          preview={stream.thumbnail || undefined}
        >
        {/* A live stream recorded no view at all. Every other post type tracks
            one — VideoCard by watch progress, PostCard and ImageCard by dwell —
            but nothing on the live surfaces ever called it, and the viewer
            bounty is decided from exactly those rows. So a creator who switched
            Watch2Earn on locked their DHB in escrow at mint against a reward no
            viewer could ever become eligible for.

            Inside GatedMedia on purpose: it renders its children only once the
            viewer is through the paywall, so a locked stream cannot bank a view
            for a broadcast nobody watched. */}
        <div ref={viewRef} aria-hidden className="absolute inset-0 pointer-events-none" />
        {streamEnded && stream.replayUrl ? (
          <div className="group/replay absolute inset-0">
            <video
              key={stream.replayUrl}
              ref={replayRef}
              className="w-full h-full object-contain"
              style={chatBeside ? CHAT_BESIDE_STYLE : undefined}
              src={stream.replayUrl}
              /* Controlled, like the live element beside it. Without this the
                 button could flip `isMuted` all day and the recording would
                 keep playing at whatever it started at. */
              muted={isMuted}
              poster={stream.thumbnail || undefined}
              /* Full-bleed draws its own scrub line on the floor of the
                 screen, so the native bar would be a second timeline a
                 centimetre above it. */
              controls={!immersive}
              onLoadedMetadata={(e) => syncReplayClock(e.currentTarget)}
              onDurationChange={(e) => syncReplayClock(e.currentTarget)}
              onTimeUpdate={(e) => syncReplayClock(e.currentTarget)}
              onPlay={(e) => {
                if (!visualActivity.isFeedPlaybackAllowed() && !isVideoInPictureInPicture(e.currentTarget)) { e.currentTarget.pause(); return; }
                setReplayPlaying(true);
                setReplayBuffering(e.currentTarget.readyState < 3);
              }}
              onPause={() => { setReplayPlaying(false); setReplayBuffering(false); }}
              onWaiting={(e) => setReplayBuffering(!e.currentTarget.paused)}
              onSeeking={(e) => setReplayBuffering(!e.currentTarget.paused)}
              onPlaying={() => setReplayBuffering(false)}
              onCanPlay={() => setReplayBuffering(false)}
              onError={() => setReplayBuffering(false)}
              playsInline
              preload="metadata"
              {...{"webkit-playsinline": ""}}
            />
            {immersive && replayBuffering && (
              <div role="status" aria-label={t('common.loading', 'Loading')} className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                <ButtonLoader size={40} className="!filter-none" />
              </div>
            )}
            {(!immersive || !chromeHidden) && (
              <div
                data-no-navigate
                data-replay-transport
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 transition-opacity',
                  !immersive && replayPlaying && 'pointer-events-none opacity-0 group-hover/replay:pointer-events-auto group-hover/replay:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100',
                )}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={!replayClock}
                    onClick={() => jumpReplay(-1)}
                    aria-label={_copy('copy.ba85bf0351d5', { defaultValue: 'Rewind {{value1}} seconds', value1: SEEK_JUMP_SECONDS })}
                    className="flex size-10 flex-col items-center justify-center rounded-xl border border-white/10 bg-black/40 text-white backdrop-blur-sm disabled:opacity-50"
                  >
                    <Rewind className="size-4" aria-hidden="true" />
                    <span aria-hidden="true" className="text-[10px] font-semibold">{SEEK_JUMP_SECONDS}s</span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleReplay}
                    aria-label={replayPlaying ? t('audioPost.pause', 'Pause') : t('audioPost.play', 'Play')}
                    className="flex size-16 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-white backdrop-blur-sm"
                  >
                    {replayPlaying ? <Pause className="size-8 fill-white" aria-hidden="true" /> : <Play className="ml-1 size-8 fill-white" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    disabled={!replayClock}
                    onClick={() => jumpReplay(1)}
                    aria-label={_copy('copy.e4ee35029d20', { defaultValue: 'Skip forward {{value1}} seconds', value1: SEEK_JUMP_SECONDS })}
                    className="flex size-10 flex-col items-center justify-center rounded-xl border border-white/10 bg-black/40 text-white backdrop-blur-sm disabled:opacity-50"
                  >
                    <FastForward className="size-4" aria-hidden="true" />
                    <span aria-hidden="true" className="text-[10px] font-semibold">{SEEK_JUMP_SECONDS}s</span>
                  </button>
                </div>
                {!immersive && replayClock && (
                  <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                    {formatReplayTime(replayClock.position)} / {formatReplayTime(replayClock.duration)}
                  </span>
                )}
              </div>
            )}

            {/* PARTIAL when the capture was cut to the creator's daily
                allowance — presenting the opening stretch as the whole
                broadcast would be a lie viewers notice mid-video. */}
            <span
              className={cn(
                'rounded bg-black/70 px-2 py-0.5 text-xs font-semibold text-white',
                // Full-bleed drops it: top-3 left-3 is the creator capsule's
                // corner, and a tag saying a finished stream is a recording is
                // not worth a line of a phone screen. The card keeps it.
                immersive ? 'hidden' : 'absolute top-3 left-3'
              )}
              title={
                stream.replayTruncated
                  ? _copy("copy.da42fb903b0e", { defaultValue: "Only the start of this stream was kept — the replay hit the creator’s daily limit" })
                  : undefined
              }
            >
              {stream.replayTruncated ? _copy("copy.7874ebc95c83", { defaultValue: "PARTIAL REPLAY" }) : _copy("copy.92d23f5381ea", { defaultValue: "REPLAY" })}
            </span>
          </div>
        ) : streamEnded ? (
          /* Past live with nothing recorded: show the stream's cover image if
             there is one, otherwise a staticy TV screen — never an empty
             black frame. */
          <LiveEndedMedia
            thumbnail={stream.thumbnail}
            // A status that is not live but not ended either (the post is out
            // before ingest connects, or the broadcaster is reconnecting) is
            // re-read every few seconds and flips back on its own; calling it
            // ended there told viewers to leave a stream that was about to play.
            label={!stream.liveStatus || hasStreamEnded({ status: stream.liveStatus })
              ? _copy("copy.a5813ef6159a", { defaultValue: "Stream ended" })
              : t('stages.startingSoon', 'Starting soon')}
            rounded="rounded-none"
            hideBadge={immersive}
          />
        ) : (
          <>
            {/* The crop wrappers stay mounted (display: contents when not
                cropping) so toggling the crop never remounts the player. */}
            <div style={cropToVertical ? VERTICAL_FRAME_STYLE : PASS_THROUGH_STYLE}>
            <div style={cropToVertical ? VERTICAL_WINDOW_STYLE : PASS_THROUGH_STYLE}>
            <video
              ref={videoRef}
              className={cropToVertical ? 'object-cover' : 'w-full h-full object-contain'}
              style={cropToVertical ? verticalCropStyle(cropToVertical) : chatBeside ? CHAT_BESIDE_STYLE : undefined}
              autoPlay
              playsInline
              {...{"webkit-playsinline": ""}}
              muted={isMuted}
              poster={handoff?.poster || stream.thumbnail || undefined}
              onPlay={(e) => {
                if (!visualActivity.isLivePlaybackAllowed() && !isVideoInPictureInPicture(e.currentTarget)) { e.currentTarget.pause(); return; }
                setIsPlaying(true); setIsBuffering(true);
              }}
              onPlaying={(e) => {
                if (!visualActivity.isLivePlaybackAllowed() && !isVideoInPictureInPicture(e.currentTarget)) { e.currentTarget.pause(); return; }
                setIsPlaying(true); setIsBuffering(false); setError(null);
                if (e.currentTarget.srcObject && hasRealPicture(e.currentTarget)) { forgetWhepSilent(whepPlaybackId); forgetWhepRouteBlocked(whepRouteRef.current); }
              }}
              onWaiting={(e) => { if (!e.currentTarget.paused) setIsBuffering(true); }}
              onPause={() => { setIsPlaying(false); setIsBuffering(false); }}
              /* A live element "ends" whenever its source does: a WebRTC
                 session closed during failover, or a playlist Safari gave up
                 on. Only a finished broadcast latches the ended screen; the
                 live status flip (liveNow) is what says a live one stopped. */
              onEnded={() => { if (!liveNow) setStreamEnded(true); }}
            />
            </div>
            </div>
            {/* No separate "Unmute" pill: the speaker in the control bar is
                the one sound control, and it showed muted already. */}
            {/* Playback feedback stays visible even when the controls are hidden. */}
            {(isBuffering || error || broadcastPaused) && (
              <div role="status" aria-label={error ? playbackErrorText(error) : t('common.loading', 'Loading')} className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-center px-4">
                  {!broadcastPaused && !waitingTooLong && error !== 'unavailable' && error !== 'playFailed' && <ButtonLoader size={40} className="!filter-none" />}
                  {(broadcastPaused || waitingTooLong || error) && <p className="text-white/80 text-sm bg-black/60 rounded px-2 py-1">{broadcastPaused ? _copy("copy.91b75d1b48f9", { defaultValue: "Live paused" }) : waitingTooLong ? _copy("copy.510db6ad26be", { defaultValue: "Waiting for live video" }) : error && playbackErrorText(error)}</p>}
                </div>
              </div>
            )}
            
            {/* While the picture is loading the spinner is the only thing in
                the middle: the play/pause button stays tappable but never
                draws over it. A paused live shows Play and no spinner. While
                any status is up (connecting, reconnecting, waiting) there is
                nothing to pause yet, so Pause stays hidden even on hover;
                Play still shows when playback actually stopped. */}
            <div className={cn('absolute inset-0 flex items-center justify-center transition-opacity',
              (isBuffering && !error && !broadcastPaused) || ((isBuffering || error || broadcastPaused) && isPlaying)
                ? 'opacity-0'
                : isPlaying ? 'bg-black/30 opacity-0 hover:opacity-100 focus-within:opacity-100' : 'bg-black/30 opacity-100',
              // Full-bleed: a tap on the picture clears the chrome, so only a
              // paused live's Play sits above that layer and takes the tap.
              immersive && 'pointer-events-none z-[16]')}>
              <button
                onClick={togglePlay}
                data-no-navigate
                style={immersive ? { pointerEvents: isPlaying ? 'none' : 'auto' } : undefined}
                aria-label={isPlaying ? t('audioPost.pause', 'Pause') : t('audioPost.play', 'Play')}
                className="w-16 h-16 rounded-xl bg-black/40 backdrop-blur-[24px] backdrop-saturate-[180%] flex items-center justify-center border border-white/10 hover:bg-black/60 transition-colors"
              >
                {isPlaying ? <Pause className="w-8 h-8 text-white fill-white" /> : <Play className="w-8 h-8 text-white fill-white ml-1" />}
              </button>
            </div>
            
            {/* The card's own control bar. Full-bleed replaces all of it:
                the state moved to a pill, the audience to the header, and
                mute to a chrome circle beside it. */}
            <div className={cn('absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent', immersive && 'hidden', isFullscreen && fullscreenChat && chatSlot && 'right-[min(380px,40%)]')}>
              <div className="flex items-center justify-between">
                {/* Pause, the LIVE tag and the last few minutes as a timeline:
                    behind live the tag goes white, and a click on it (or the
                    red end of the line) is back to live. */}
                <LiveTimelineBar timeshift={timeshift} className="mr-3" />
                <div className="flex items-center gap-2">
                  {/* Like (tap again and again, every tap floats one), the
                      emoji tray (hover or hold) and share, on the picture only
                      in fullscreen: the action row under the player has the
                      same buttons, so inline they were a second copy. In
                      fullscreen the share sheet can't draw over the player,
                      so share reposts straight away there. */}
                  {isFullscreen && (
                  <div
                    data-no-navigate
                    data-live-player-actions
                    onClick={(e) => e.stopPropagation()}
                    // The bar's own size: the composer-sized 46px squares read as
                    // a second, heavier control row next to mute and fullscreen.
                    className="[&>div>button]:!h-9 [&>div>button]:!w-9 [&>div>span>button]:!h-9 [&>div>span>button]:!w-9"
                  >
                    <ActionBar
                      compact
                      quickRepost={isFullscreen}
                      onLiveReaction={sendLiveReaction}
                      postId={stream.id}
                      tokenId={parseInt(stream.id, 10) || undefined}
                      isLiked={stream.isLiked}
                      isDisliked={stream.isDisliked}
                      myReaction={stream.myReaction}
                      reactionCounts={stream.reactionCounts}
                      likeCount={stream.likeCount}
                      dislikeCount={stream.dislikeCount}
                      commentCount={stream.commentCount}
                      nativeShare={{ title: stream.title }}
                    />
                  </div>
                  )}
                  {isFullscreen && canAskToJoin && (
                    <Suspense fallback={null}>
                      <CoStreamAskButton streamId={stream.streamId} owner={stream.creatorId} variant="square" />
                    </Suspense>
                  )}
                  {isFullscreen && chatSlot && (
                    <button
                      type="button"
                      data-live-fullscreen-chat-toggle
                      onClick={(e) => { e.stopPropagation(); setFullscreenChat(open => !open); }}
                      aria-pressed={fullscreenChat}
                      aria-label={fullscreenChat ? t('stages.hideChat', 'Hide chat') : t('stages.showChat', 'Show chat')}
                      className={cn('p-2 text-white hover:bg-white/20 rounded transition-colors', fullscreenChat && 'bg-white/20')}
                    >
                      <MessageSquare className="w-5 h-5" />
                    </button>
                  )}
                  <VideoVolumeControl
                    layout="above"
                    volume={volume}
                    muted={isMuted || volume === 0}
                    onToggleMute={() => { if (volume === 0) setVolumeTo(0.8); else toggleMute(); }}
                    onVolume={setVolumeTo}
                    open={volumeOpen}
                    onOpenChange={setVolumeOpen}
                    label={isMuted || volume === 0 ? t('stages.unmute', 'Unmute') : t('stages.mute', 'Mute')}
                    sliderLabel={t('videoPlayer.volume')}
                    wrapperData={{ 'data-live-volume': true }}
                    buttonClassName="p-2 text-white hover:bg-white/20 rounded transition-colors"
                  >
                    {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </VideoVolumeControl>
                  {canMinimise && !immersive && (
                    <button
                      type="button"
                      data-live-minimise
                      onClick={(e) => { e.stopPropagation(); void minimiseLive('video'); }}
                      aria-label={t('liveMini.minimiseHint', 'Keep watching while you browse')}
                      title={t('liveMini.minimiseHint', 'Keep watching while you browse')}
                      className="p-2 text-white hover:bg-white/20 rounded transition-colors"
                    >
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? t('stages.exitFullscreen', 'Exit fullscreen') : t('stages.fullscreen', 'Fullscreen')}
                    className="p-2 text-white hover:bg-white/20 rounded transition-colors"
                  >
                    {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* The product the host has put "on air". Sits inside the player
                container so it survives fullscreen, and above the control bar
                so it never covers play/mute. Renders nothing until something
                is pinned. */}
            <StreamShopPinnedCard tokenId={stream.id} />

            {/* The creator's affiliate board. Inside the player container for
                the same reason as the pinned card — it has to survive
                fullscreen — and anchored bottom-left, clear of the mute and
                fullscreen controls on the right. */}
            <ShopBoardLazy tokenId={stream.tokenId || stream.id} links={stream.shopLinks} listingCount={stream.shopListingCount} />
          </>
        )}
        </GatedMedia>

        {/* Celebrations play in a box pinned to the bottom-right of the player.
            Sits OUTSIDE GatedMedia so a gift still plays over a paywalled
            stream the viewer has not unlocked — they can see the room reacting
            — and INSIDE the fullscreen container so the effect follows the
            player into fullscreen, where it lands over the chat column rather
            than animating behind it. */}
        {!overlayOwnsCelebration && <GiftAnimationOverlay items={giftCelebrations} />}
        {/* Only once the creator has saved an overlay (version > 0). */}
        {streamOverlay && streamOverlay.version > 0 && stream.streamId && stream.isLive && !streamEnded && (
          <Suspense fallback={null}>
            <LiveOverlayLayer
              streamId={stream.streamId}
              tokenId={stream.id}
              overlay={streamOverlay}
              showChatOverlay={showChatOverlay}
              videoRef={videoRef}
              initialViewers={Number(livePresence) || 0}
              creator={stream.creatorId}
            />
          </Suspense>
        )}
        {streamOverlay && streamOverlay.version > 0 && streamOverlay.renderIn === 'app' && streamEnded && stream.replayUrl && stream.streamId && (
          <Suspense fallback={null}>
            <ReplayOverlayLayer streamId={stream.streamId} overlay={streamOverlay} videoRef={replayRef} />
          </Suspense>
        )}
        {/* A hype train is the room's, whatever overlay the creator has: drawn
            for anyone watching, top-centre, clear of the close button. */}
        {stream.streamId && stream.isLive && !streamEnded && isPlaying && (
          <Suspense fallback={null}>
            <HypeTrainBar
              streamId={stream.streamId}
              className={cn('absolute left-1/2 z-20 w-[min(92%,26rem)] -translate-x-1/2', immersive ? 'top-[max(3.25rem,calc(env(safe-area-inset-top)+3.25rem))]' : 'top-3')}
            />
          </Suspense>
        )}
        {/* The creator's stream pet, bottom-right above the room, for everyone
            watching. A tap opens its card, where viewers can buy it a snack
            with their channel points. */}
        {stream.streamId && stream.isLive && !streamEnded && (
          <Suspense fallback={null}>
            <StreamPetCorner
              streamId={stream.streamId}
              own={isOwnStream}
              signedIn={!!isAuthenticated}
              className={cn(
                'absolute right-3 z-20 transition-opacity duration-300',
                immersive ? 'bottom-[calc(45%+0.75rem)]' : 'bottom-16',
                chromeHidden && 'invisible pointer-events-none opacity-0',
              )}
            />
          </Suspense>
        )}
        {/* React live: the Riftn video on screen, credited and one tap away. */}
        <ReactingToChip
          streamTokenId={stream.tokenId || stream.id}
          live={!!stream.isLive && !streamEnded}
          className={cn('absolute left-3 z-20 max-w-[70%]', immersive ? 'top-[max(6.5rem,calc(env(safe-area-inset-top)+6.5rem))]' : 'top-14')}
        />
        <LiveReactionFlow streamId={stream.streamId} enabled={!!stream.isLive && !streamEnded} bottom={immersive ? 100 : 56} self={selfReaction} />
        {/* Fullscreen chat, YouTube style: a column down the right edge. The
            chat under the card steps aside while this one is open, so the
            room is only ever joined once. */}
        {!immersive && isFullscreen && fullscreenChat && chatSlot && (
          <div
            data-no-navigate
            data-live-fullscreen-chat
            data-keep-dark
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 z-30 flex w-[min(380px,40%)] flex-col justify-end overflow-y-auto overscroll-contain border-l border-white/10 bg-black/75 p-3 backdrop-blur-xl"
          >
            {chatSlot}
          </div>
        )}
        {stream.streamId && stream.isLive && !streamEnded && !isOwnStream && (
          <Suspense fallback={null}>
            <CoStreamViewerLayer streamId={stream.streamId} owner={stream.creatorId} hostAvatar={stream.avatar?.startsWith('http') ? stream.avatar : null} onRoomChange={quietForGuestRoom} />
          </Suspense>
        )}

        {/* Full-bleed chrome. Inside the media container so it travels with
            the picture, and after the overlays so nothing is drawn on top
            of the close button. */}
        {/* Clear the chrome: a tap anywhere on the open picture, or a swipe
            down over its lower half. Under the chrome, so the chat and
            buttons keep their own touches. Once cleared, the whole frame
            takes a tap or a swipe up to bring it all back, and only the
            rotate button is drawn. */}
        {immersive && !chromeHidden && (
          <div
            aria-hidden
            data-no-navigate
            data-live-swipe-zone
            className="absolute inset-0 z-[15] touch-pan-x"
            onTouchStart={swipeFeed ? undefined : onSwipeStart}
            onTouchEnd={swipeFeed ? undefined : (e) => onSwipeEnd(e, 'down')}
            onClick={(e) => { e.stopPropagation(); setHidden(true); }}
          />
        )}
        {immersive && chromeHidden && (
          <LiveClearedLayer
            onToggleChat={chatSlot && rotation !== 'css' ? () => setClearedChat(open => !open) : undefined}
            chatOpen={clearedChat}
            onRestore={() => setHidden(false)}
            onRotate={() => void toggleRotation()}
            onTouchStart={swipeFeed ? undefined : onSwipeStart}
            onTouchEnd={swipeFeed ? undefined : (e) => onSwipeEnd(e, 'up')}
          />
        )}
        {immersive && (
          <ImmersiveLiveChrome
            streamerName={stream.streamer}
            creatorUsername={stream.creatorUsername}
            creatorId={stream.creatorId}
            badgeBalance={stream.creatorBadgeBalance}
            avatar={stream.avatar}
            title={stream.title?.trim() || undefined}
            isLive={!!stream.isLive && !streamEnded}
            isEnded={streamEnded}
            viewers={livePresence}
            giftTotal={stream.totalTips ?? 0}
            startedAt={stream.startedAt ?? null}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            optionsSlot={optionsMenu}
            likeCount={stream.likeCount}
            progress={streamEnded && replayClock ? replayClock.position / replayClock.duration : undefined}
            replayDuration={streamEnded ? replayClock?.duration : undefined}
            onSeek={streamEnded && replayClock ? seekReplay : undefined}
            hidden={chromeHidden}
            streamId={stream.streamId}
            onClose={swipeFeed?.onClose}
            onMinimise={canMinimise ? () => { void minimiseLive('video'); } : undefined}
            timeshift={timeshift}
          />
        )}
      </div>

      {/* Info & Actions.

          Full-bleed has neither. The engagement bar was a strip of seven
          icons and their counts laid across someone's broadcast; what is
          left is three controls in the bottom-right corner — gift, share,
          and the thumb that holds open the reaction tray — with the room
          along the foot. The title and the audience line are gone too:
          they are a pill and a header chip now, and repeating them here is
          how the phone layout ended up with three copies of "LIVE". */}
      {immersive ? (
        /* The room, over the picture — no panel and no fill of its own, and
           the gift/share/thumb buttons ride the composer's own row through
           the provider rather than floating over the messages. */
        <div
          data-no-navigate
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'absolute inset-x-3 bottom-0 z-20 flex max-h-[45%] flex-col justify-end transition-opacity duration-300',
            keyboardOpen ? 'pb-2' : streamEnded && replayClock
              ? 'pb-[calc(max(0.75rem,env(safe-area-inset-bottom))+1.25rem)]'
              : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
            chromeHidden && !(clearedChat && rotation !== 'css') && 'invisible pointer-events-none opacity-0',
            chromeHidden && clearedChat && rotation !== 'css' && 'z-[45] right-16'
          )}
        >
          <LiveViewerActionsProvider
            value={
              // Chat opened over a cleared screen sits beside the round chat and
              // rotate buttons: the gift/share/thumb row would squeeze the
              // message box to a few letters there, so it is left out.
              chromeHidden && clearedChat ? null : (
              <div className="flex items-center gap-2">
              <ActionBar
                compact
                onShareToPublicChat={shareToPublicChat}
                onLiveReaction={sendLiveReaction}
                postId={stream.id}
                tokenId={parseInt(stream.id, 10) || undefined}
                isLiked={stream.isLiked}
                isDisliked={stream.isDisliked}
                myReaction={stream.myReaction}
                reactionCounts={stream.reactionCounts}
                likeCount={stream.likeCount}
                dislikeCount={stream.dislikeCount}
                commentCount={stream.commentCount}
                tipCount={tipCount}
                onTip={() => setShowGiftDrawer(true)}
                nativeShare={{ title: stream.title }}
              />
              {canAskToJoin && (
                <Suspense fallback={null}>
                  <CoStreamAskButton streamId={stream.streamId} owner={stream.creatorId} variant="square" />
                </Suspense>
              )}
              </div>
              )
            }
          >
            {chatSlot}
          </LiveViewerActionsProvider>
        </div>
      ) : (
        <div className="pt-3">
          <ActionBar
            onLiveReaction={sendLiveReaction}
            onShareToPublicChat={shareToPublicChat}
            postId={stream.id}
            tokenId={parseInt(stream.id, 10) || undefined}
            isLiked={stream.isLiked}
            isDisliked={stream.isDisliked}
            myReaction={stream.myReaction}
            reactionCounts={stream.reactionCounts}
            likeCount={stream.likeCount}
            dislikeCount={stream.dislikeCount}
            commentCount={stream.commentCount}
            tipCount={tipCount}
            onTip={() => setShowGiftDrawer(true)}
            nativeShare={{ title: stream.title }}
            utilityDesktopAnchor
            onComment={() => setShowComments(prev => !prev)}
            className="p-0 mb-2"
          />
          <div className="mt-1 flex items-start gap-3">
            <h3 className="min-w-0 flex-1 text-white text-sm">{stream.title}</h3>
            {canAskToJoin && (
              <Suspense fallback={null}>
                <CoStreamAskButton streamId={stream.streamId} owner={stream.creatorId} className="-mt-1.5" />
              </Suspense>
            )}
          </div>
          <p className="text-zinc-500 text-xs mt-1">{stream.game}</p>
        </div>
      )}

      {/* The chat, or the comments when there is no chat to show — same
          button, same drop-down position under the action bar. */}
      {chatSlot ? (
        !immersive && showComments && !(isFullscreen && fullscreenChat) && (
          <div className="mt-3" data-no-navigate onClick={(e) => e.stopPropagation()}>
            {chatSlot}
          </div>
        )
      ) : (
        <CommentsWrapper
          open={showComments}
          onOpenChange={setShowComments}
          tokenId={stream.id}
        />
      )}

      {/* Gift Drawer */}
      <Drawer open={showGiftDrawer && !showBuyDrawer} onOpenChange={setShowGiftDrawer}>
        <DrawerContent column glass className="px-4 pb-8 max-h-[85dvh]">
          <DrawerHeader className="border-b border-white/10 mb-4">
            <DrawerTitle className="text-white flex items-center gap-2">
              <Gem className="w-5 h-5 text-white" />{_copy("copy.2ba9ebf4b84b", { defaultValue: "Send a Gift" })}</DrawerTitle>
          </DrawerHeader>
          <div data-vaul-no-drag className="space-y-4 min-h-0 overflow-y-auto overscroll-contain">
            {/* Balance display — gifts move real DHB, so show the real balance */}
            <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5 border border-white/10">
              <span className="text-xs text-zinc-400">{_copy("copy.dc8089593385", { defaultValue: "Your balance" })}</span>
              <div className="flex items-center gap-1.5">
                <img src={dehubCoin} alt={tokenLabel()} className="w-4 h-4" />
                <span className="text-sm font-medium text-white">
                  {balanceLoading ? '...' : (dhbBalance ?? '—')}
                </span>
              </div>
            </div>

            {/* The ladder. Tapping a tile fills the amount below rather than
                sending anything — the gift is still one on-chain DHB tip, and
                the tier is what that amount buys on screen. Cheapest first:
                the picker opens on what most viewers will actually send. */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">
                {t('liveGift.pickTier', 'Pick a celebration')}
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y]">
                {[...GIFT_TIERS].reverse().map((tier) => {
                  const selected = Number(giftAmount) === tier.min;


  return (
                    <button
                      key={tier.key}
                      type="button"
                      onClick={() => setGiftAmount(String(tier.min))}
                      aria-pressed={selected}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border p-2 text-left transition-colors',
                        selected
                          ? 'border-white/60 bg-white/15'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      )}
                    >
                      <span aria-hidden className="shrink-0 rounded-xl bg-white/10 p-2">
                          <span className="block w-4 h-4 text-base leading-4 text-center">{tier.emoji}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-semibold text-white">
                          {t(tier.labelKey, tier.name)}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                          {tier.min.toLocaleString()}
                          <img src={dehubCoin} alt={tokenLabel()} className="w-3 h-3" />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedGiftTier && (
                <p className="text-[11px] text-zinc-400">
                  {t(selectedGiftTier.descKey, selectedGiftTier.descFallback)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-400 flex items-center gap-1.5">{_copy("copy.49e96d7cdf58", { defaultValue: "Amount" })}<img src={dehubCoin} alt={tokenLabel()} className="w-4 h-4" />
              </label>
              <Input
                type="number"
                value={giftAmount}
                onChange={(e) => setGiftAmount(e.target.value)}
                placeholder={_copy("copy.2d700ab23246", { defaultValue: "Enter amount" })}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                min={MIN_TIP_DHB}
                step="1"
              />
              <p className="text-[11px] text-zinc-500">{_copy("copy.50413ca0f259", { defaultValue: "Sent on-chain to the streamer's wallet and shown in the stream activity." })}</p>
              {selectedGiftTier && (
                <p className="text-[11px] text-zinc-300">
                  {t('liveGift.plays', 'Plays {{tier}} on the stream', {
                    tier: t(selectedGiftTier.labelKey, selectedGiftTier.name),
                  })}
                </p>
              )}
            </div>

            {/* Tip-to-speech. Optional: a gift with an empty box is exactly the
                gift it was before, and nothing is spoken. The cap is the
                synthesiser's, not a style choice — past it a single tip holds
                the stream's audio for too long. */}
            <div className="space-y-2">
              <label
                htmlFor={`gift-tts-${stream.id}`}
                className="text-sm text-zinc-400 flex items-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" />
                {t('liveGift.ttsLabel', 'Say something out loud')}
              </label>
              <div className="relative">
                <Textarea
                  id={`gift-tts-${stream.id}`}
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value.slice(0, MAX_TTS_CHARS))}
                  placeholder={t('liveGift.ttsPlaceholder', 'Read out to the stream…')}
                  rows={2}
                  className="resize-none bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 pr-14"
                />
                <span className="absolute right-3 bottom-2 text-[10px] text-zinc-500 pointer-events-none">
                  {giftMessage.length}/{MAX_TTS_CHARS}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">
                {t(
                  'liveGift.ttsHint',
                  'Read aloud to everyone watching when your gift lands.',
                )}
              </p>
            </div>

            {showGiftDrawer && walletAddress ? (
              <Suspense fallback={null}>
                <TipPayWith
                  amountDhb={0}
                  value={giftPayWith}
                  onChange={setGiftPayWith}
                  direct
                  recipientName={stream.streamer || stream.creatorUsername}
                />
              </Suspense>
            ) : null}

            <div className="space-y-2">
              <Button
                onClick={handleSendGift}
                disabled={isSendingGift || fundingGift || !giftAmount}
                className="w-full bg-white hover:bg-zinc-200 text-black py-5 font-semibold rounded-xl"
              >
                {isSendingGift || fundingGift ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Gem className="w-4 h-4 mr-2" />}{_copy("copy.1c5ccbd708df", { defaultValue: "Send Gift" })}
                {giftDirect && Number(giftAmount) > 0 ? <span className="ml-1.5 tabular-nums">· {giftCostIn(Number(giftAmount))} <span>{giftDirect.symbol}</span></span> : null}</Button>
              {giftSubsReady && stream.creatorId && !isOwnStream && (
                <Button
                  variant="glass"
                  className="w-full py-5 rounded-xl"
                  onClick={() => {
                    setShowGiftDrawer(false);
                    setShowGiftSubs(true);
                  }}
                >
                  <Gift className="w-4 h-4 mr-2" />
                  {t('liveHype.gift.open')}
                </Button>
              )}
              <Button variant="glass" className="w-full py-5 rounded-xl" onClick={() => setShowBuyDrawer(true)}>{_copy("copy.1dffe3aad33c", { defaultValue: "Buy tokens" })}</Button>
              <Button variant="glass" className="w-full py-5 rounded-xl" onClick={() => setShowGiftDrawer(false)}>{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {showGiftSubs && stream.creatorId && (
        <Suspense fallback={null}>
          <GiftSubsDrawer
            open={showGiftSubs}
            onOpenChange={setShowGiftSubs}
            creatorAddress={stream.creatorId}
            creatorName={stream.streamer || stream.creatorUsername}
            streamId={stream.isLive && !streamEnded ? stream.streamId : null}
          />
        </Suspense>
      )}

      {showBuyDrawer && (
        <Suspense fallback={null}>
          <LiveGiftBuyDrawer
            open={showBuyDrawer}
            onOpenChange={setShowBuyDrawer}
            neededDhb={Math.max(1, Number(giftAmount) - Number((dhbBalance || '0').replace(/,/g, '')))}
            onFunded={() => { setShowBuyDrawer(false); setGiftBalanceVersion(v => v + 1); }}
          />
        </Suspense>
      )}

      {/* Activity Log Drawer */}
      <Drawer open={showActivityLog} onOpenChange={setShowActivityLog}>
        <DrawerContent column glass className="px-4 pb-8 max-h-[70dvh]">
          <DrawerHeader className="border-b border-white/10 mb-4">
            <DrawerTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5" />{_copy("copy.5c69a7dca8ac", { defaultValue: "Stream Activity" })}</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto space-y-1">
            {activitiesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            ) : activities.length === 0 ? (
              <AppState icon="live" title={_copy("copy.0a12b92ce789", { defaultValue: "No activity yet" })} size="compact" />
            ) : (
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-zinc-800/50 transition-colors"
                >
                  {getActivityIcon(activity.type)}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white font-medium">
                      {activity.username || activity.address?.slice(0, 8)}
                    </span>
                    <span className="text-sm text-zinc-400 ml-1.5">
                      {activity.type === 'gift'
                        ? (
                          <>{_copy("copy.7afbb3347fb7", { defaultValue: "sent" })}<DhbAmount
                              amount={activity.giftAmount}
                              currency={activity.giftCurrency}
                              iconClassName="h-3.5 w-3.5"
                            />
                          </>
                        )
                        : activity.type === 'like'
                        ? _copy("copy.a180411d503d", { defaultValue: "liked the stream" })
                        : activity.type === 'join'
                        ? _copy("copy.6b963cc1c2d7", { defaultValue: "joined" })
                        : activity.type === 'leave'
                        ? _copy("copy.360f84035942", { defaultValue: "left" })
                        : activity.message || activity.type}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500 flex-shrink-0">
                    {activity.timestamp && !Number.isNaN(new Date(activity.timestamp).getTime())
                      ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })
                      : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* AI Chat */}
      <PostAIChatLazy
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        postContext={{
          tokenId: stream.tokenId,
          type: 'live',
          author: stream.streamer,
          title: stream.title,
          caption: `${streamEnded ? 'Ended stream' : 'Playing'} ${stream.game}${!streamEnded ? ` with ${formatCount(stream.viewers)} viewers` : ''}`,
          imageUrl: stream.thumbnail
        }}
      />

      {clippable && liveClip.sheet}

      {/* Report Modal */}
      <ReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        tokenId={stream.id}
        contentType="video"
      />

      <EndStreamConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        onConfirm={() => {
          setConfirmEnd(false);
          void handleEndStream();
        }}
      />
    </div>
  );
}
