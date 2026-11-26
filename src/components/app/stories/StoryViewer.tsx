/**
 * The full-screen story viewer.
 *
 * One person's moments play in order: a photo for 5 s, a video for its
 * length. Each moment has a track above the header that fills as it plays.
 * Tap the right side for the next one, the left for
 * the one before, hold to pause, swipe down (or Esc) to close, swipe sideways
 * (or the arrows on desktop) for the next person.
 *
 * Watching is counted once per signed-in person. Replies go to the owner as a
 * direct message; likes and views show only to the owner. Your own moments
 * show who watched instead of a reply bar.
 */
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { suspendPageMediaSessions } from '@/lib/media-session';
import { pauseMediaOutside } from '@/lib/pause-media-in';
import { type InfiniteData, type UseInfiniteQueryResult, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowUpRight, ChevronLeft, ChevronRight, Eye, Heart, Link2, Loader2, Repeat2, Star, Volume2, VolumeX } from 'lucide-react';
import Close from '@/components/ui/cut-icons/close';
import MoreVertical from '@/components/ui/cut-icons/morevertical';
import Plus from '@/components/ui/cut-icons/add';
import Send from '@/components/ui/cut-icons/send';
import ShareIcon from '@/components/ui/cut-icons/feedshare';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Music from '@/components/ui/cut-icons/music';
import { useAuth } from '@/contexts/AuthContext';
import { buildAvatarUrl, buildAvatarCdnFallbackUrl } from '@/lib/media-url';
import { formatCount } from '@/lib/format-count';
import { useStoriesStore } from '@/store/storiesStore';
import {
  deleteStory,
  getStory,
  getStoryViewers,
  likeStory,
  markStoryViewed,
  reportStory,
  type ShelfEntry,
  type StoryItem,
} from '@/lib/api/dehub/stories';
import { useRefreshStoryShelf } from '@/hooks/use-story-shelf';
import { ageLabel, coverOf, localAge, nameOf, startIndex } from './story-utils';
import { sendStoryReply } from './story-reply';
import { muteUser } from '@/lib/api/dehub/mutes';
import { unfollowUser } from '@/lib/api/dehub/social';
import { StoryComments } from './StoryComments';
import { MomentCaption } from './MomentCaption';
import { StoryRoomChat, StoryRoomRows, useMomentComments } from './StoryRoomChat';
import { toggleFollowFor } from '@/hooks/use-follow';
import '@/styles/live-audience.css';
import { MomentComment, MomentHeart, MomentShare } from './moment-icons';
import '@/styles/stories.css';

interface Props {
  entries: ShelfEntry[];
  startAuthor: number;
  startItem: number;
  openComments?: boolean;
  onClose: () => void;
}

const HOLD_MS = 220;

/** "21h left", "40m left": how long until the moment goes away. */
function timeLeftLabel(expiresAt: string, t: (k: string, o: Record<string, unknown>) => string): string {
  const mins = Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 60000));
  if (mins >= 60) return t('stories.hoursLeft', { n: Math.floor(mins / 60), defaultValue: '{{n}}h left' });
  return t('stories.minutesLeft', { n: Math.max(1, mins), defaultValue: '{{n}}m left' });
}

/**
 * Fill the frame edge to edge when that crops only a little; otherwise keep
 * the whole moment (text and stickers near the sides stay readable on tall
 * phones, landscape moments stay whole).
 */
function fitFor(width: number | null | undefined, height: number | null | undefined, frame: { w: number; h: number } | null): 'cover' | 'contain' {
  const ratio = width && height ? width / height : 9 / 16;
  if (ratio > 1) return 'contain';
  if (!frame || !frame.w || !frame.h) return 'cover';
  const screen = frame.w / frame.h;
  return Math.abs(ratio - screen) / screen <= 0.1 ? 'cover' : 'contain';
}

function useFrameSize() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el || typeof ResizeObserver === 'undefined') return;
    ro.current = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      setSize(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.current.observe(el);
  }, []);
  return [ref, size] as const;
}

/** Wide screens park the comments in a panel beside the moment, like the live page. */
function useDocked(): boolean {
  const query = '(min-width: 1200px)';
  const [docked, setDocked] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setDocked(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return docked;
}
const ShareToDmModal = lazy(() => import('@/components/app/modals/ShareToDmModal').then(m => ({ default: m.ShareToDmModal })));
const REPORT_REASONS = [
  ['spam_misleading', 'Spam'],
  ['harassment_bullying', 'Bullying or harassment'],
  ['sexual_content', 'Nudity or sexual content'],
  ['violent_content', 'Violence'],
  ['hateful_content', 'Hate'],
  ['other', 'Something else'],
] as const;

export function StoryViewer({ entries: initial, startAuthor, startItem, openComments = false, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const refreshShelf = useRefreshStoryShelf();
  const me = walletAddress?.toLowerCase() ?? null;

  const [entries, setEntries] = useState(initial);
  const [authorIdx, setAuthorIdx] = useState(startAuthor);
  const [itemIdx, setItemIdx] = useState(() => (startItem >= 0 ? startItem : startIndex(initial[startAuthor])));
  const [progress, setProgress] = useState(0);
  const [held, setHeld] = useState(false);
  // A Moment made from a post keeps its "Go to post" button out of the way
  // until the viewer taps the post in the middle of the screen; that tap
  // also holds the Moment so there is time to press it.
  const [postPeekId, setPostPeekId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [sheet, setSheet] = useState<null | 'viewers' | 'comments' | 'more' | 'report' | 'delete' | 'share' | 'share-dm'>(openComments ? 'comments' : null);
  const [muted, setMuted] = useState(false);
  // Which moment has its picture in, by id: a cached image can report in before
  // the reset for a new moment runs, so a plain flag could stick at "loading".
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [hearts, setHearts] = useState<{ id: number; x: number; d: number }[]>([]);
  const docked = useDocked();
  const [frameRef, frameSize] = useFrameSize();
  const queryClient = useQueryClient();

  const entry = entries[authorIdx];
  const snapshot: StoryItem | undefined = entry?.items[itemIdx];
  const customAudience = snapshot?.audience === 'selected' || snapshot?.audience === 'except' || snapshot?.audience === 'close_friends';
  const delivery = useQuery({
    queryKey: ['private-story-playback', snapshot?.id, me],
    queryFn: () => getStory(snapshot!.id, true),
    enabled: customAudience && !!me,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 4 * 60 * 1000,
    retry: false,
  });
  const item = useMemo(() => {
    if (!customAudience) return snapshot;
    if (!snapshot || !me || !delivery.isSuccess) return undefined;
    const { mediaUrl, posterUrl, overlayUrl } = delivery.data.item;
    return { ...snapshot, mediaUrl, posterUrl, overlayUrl };
  }, [snapshot, customAudience, me, delivery.data, delivery.isSuccess]);
  useEffect(() => {
    if (customAudience && (!me || delivery.isError)) onClose();
  }, [customAudience, me, delivery.isError, onClose]);
  const loaded = !!item && loadedId === item.id;
  const setLoaded = useCallback(() => setLoadedId(item?.id ?? null), [item?.id]);
  const own = !!entry && !!me && entry.author.address === me;
  const audience = useInfiniteQuery({
    queryKey: ['moment-viewers', item?.id, me],
    queryFn: ({ pageParam }) => getStoryViewers(item!.id, pageParam),
    enabled: !!item && own && isAuthenticated && sheet === 'viewers',
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.next ?? undefined,
    refetchInterval: () => item && Date.parse(item.expiresAt) > Date.now() ? 10_000 : false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });
  const viewCount = audience.data?.pages[0]?.viewCount ?? item?.viewCount ?? 0;
  const viewsLabel = t('stories.viewsCount', { defaultValue: '{{formatted}} views', formatted: formatCount(viewCount) });
  const postPeek = item?.postTokenId != null && postPeekId === item.id;
  const paused = held || postPeek || typing || sending || sheet !== null || openingOriginal || !loaded;
  const room = useMomentComments(item?.id, isAuthenticated, !!item && (item.commentCount ?? 1) > 0);
  const roomComments = room.data?.comments ?? [];

  const viewerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const commentsButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreCommentsFocus = useRef(false);
  const viewedRef = useRef(new Set<string>());
  const changedRef = useRef(false);
  const originalRequest = useRef<symbol | null>(null);
  const replyInput = useRef<HTMLInputElement>(null);
  const sendingReply = useRef(false);

  const hasStory = !!entry && !!item;
  useLayoutEffect(() => {
    const viewer = viewerRef.current;
    if (!hasStory || !viewer) return;
    const releaseMedia = pauseMediaOutside(viewer);
    const releaseSessions = suspendPageMediaSessions();
    return () => {
      releaseMedia();
      releaseSessions();
    };
  }, [hasStory]);

  // ── Moving between moments ────────────────────────────────────────
  const close = useCallback(() => {
    originalRequest.current = null;
    if (changedRef.current) refreshShelf();
    onClose();
  }, [onClose, refreshShelf]);

  const goAuthor = useCallback((dir: 1 | -1) => {
    const next = authorIdx + dir;
    if (next < 0 || next >= entries.length) {
      if (dir === 1) close();
      return;
    }
    setAuthorIdx(next);
    setItemIdx(dir === 1 ? startIndex(entries[next]) : 0);
  }, [authorIdx, entries, close]);

  const goItem = useCallback((dir: 1 | -1) => {
    if (!entry) return;
    const next = itemIdx + dir;
    if (next >= entry.items.length) return goAuthor(1);
    if (next < 0) return goAuthor(-1);
    setItemIdx(next);
  }, [entry, itemIdx, goAuthor]);

  const elapsedRef = useRef(0);
  const previousPosition = useRef({ authorIdx, itemIdx });
  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
    if (previousPosition.current.authorIdx !== authorIdx || previousPosition.current.itemIdx !== itemIdx) {
      previousPosition.current = { authorIdx, itemIdx };
      setSheet(s => (s === 'viewers' ? s : null));
    }
    setOpeningOriginal(false);
    setReply('');
    setTyping(false);
    return () => { originalRequest.current = null; };
  }, [snapshot?.id]);

  useEffect(() => {
    if (sheet) {
      sheetRef.current?.querySelector('button')?.focus({ preventScroll: true });
    } else if (restoreCommentsFocus.current) {
      restoreCommentsFocus.current = false;
      // The comments control is hidden until the drawer has closed.
      (commentsButtonRef.current ?? closeButtonRef.current)?.focus({ preventScroll: true });
    }
  }, [item?.id, sheet]);

  const dismissSheet = useCallback(() => {
    restoreCommentsFocus.current = sheet === 'comments';
    setSheet(null);
    if (sheet === 'more') moreButtonRef.current?.focus({ preventScroll: true });
  }, [sheet]);

  // ── Counting the view ─────────────────────────────────────────────
  useEffect(() => {
    if (!item || !loaded || own || !isAuthenticated || viewedRef.current.has(item.id)) return;
    viewedRef.current.add(item.id);
    changedRef.current = true;
    setEntries(list => list.map((e, i) => i !== authorIdx ? e : {
      ...e,
      items: e.items.map(it => it.id === item.id ? { ...it, viewed: true } : it),
      seen: e.items.every(it => it.id === item.id || it.viewed),
    }));
    markStoryViewed(item.id).catch(() => {});
  }, [item, loaded, own, isAuthenticated, authorIdx]);

  // ── The clock ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!item || item.type === 'video') return;
    if (paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsedRef.current += now - last;
      last = now;
      const p = elapsedRef.current / Math.max(1000, item.durationMs || 5000);
      setProgress(Math.min(1, p));
      if (p >= 1) {
        goItem(1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [item, paused, goItem]);

  // Video drives its own progress.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || item?.type !== 'video') return;
    if (paused && loaded) v.pause();
    else if (loaded) v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}); });
  }, [paused, loaded, item]);

  // The song plays alongside, from its chosen start, looping.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !item?.song) return;
    if (paused) a.pause();
    else a.play().catch(() => {});
  }, [paused, item]);

  useEffect(() => {
    const a = audioRef.current;
    if (a && item?.song) {
      a.currentTime = (item.song.startMs || 0) / 1000;
    }
  }, [item]);

  // ── Preload the next picture ──────────────────────────────────────
  useEffect(() => {
    const after = entries[authorIdx + 1];
    const next = entry?.items[itemIdx + 1] ?? (after ? after.items[startIndex(after)] : undefined);
    if (next?.posterUrl) new Image().src = next.posterUrl;
  }, [entry, entries, authorIdx, itemIdx]);

  // ── Keys ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing) {
        if (e.key === 'Escape') (document.activeElement as HTMLElement | null)?.blur();
        return;
      }
      if (e.key === 'Escape') {
        if (sheet) dismissSheet();
        else close();
        return;
      }
      if (sheet || openingOriginal || (e.target as HTMLElement | null)?.closest?.('button, a')) return;
      if (e.key === 'ArrowRight') goItem(1);
      else if (e.key === 'ArrowLeft') goItem(-1);
      else if (e.key === ' ') { e.preventDefault(); setHeld(h => !h); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goItem, close, typing, sheet, openingOriginal, dismissSheet]);

  // No page scroll behind the viewer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Touch: tap, hold, swipe ───────────────────────────────────────
  const press = useRef<{ x: number; y: number; t: number; timer: number; onViewers: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (sheet || openingOriginal || typing || !e.isPrimary || e.button !== 0
      || (e.target as Element).closest('button:not([data-sv-viewers-trigger]), input, a')) return;
    const timer = window.setTimeout(() => setHeld(true), HOLD_MS);
    press.current = { x: e.clientX, y: e.clientY, t: performance.now(), timer,
      onViewers: !!(e.target as Element).closest('[data-sv-viewers-trigger]') };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      window.clearTimeout(p.timer);
      setDrag({ x: Math.abs(dx) > Math.abs(dy) ? dx : 0, y: Math.abs(dy) >= Math.abs(dx) ? Math.max(0, dy) : 0 });
    }
  };
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    setHeld(false);
    setDrag(null);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const wasHold = held;
    setHeld(false);
    setDrag(null);
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 90) {
      if (dy > 0) close();
      else if (own) setSheet('viewers');
      return;
    }
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) return goAuthor(dx < 0 ? 1 : -1);
    if (p.onViewers || wasHold || performance.now() - p.t > HOLD_MS || Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const page = (e.currentTarget as HTMLElement).querySelector('[data-sv-page]')?.getBoundingClientRect() ?? rect;
    const rel = (e.clientX - page.left) / page.width;
    if (item?.postTokenId != null && rel >= 0.33 && rel <= 0.67) {
      const id = item.id;
      setPostPeekId(prev => (prev === id ? null : id));
      return;
    }
    goItem(rel < 0.33 ? -1 : 1);
  };

  // ── Actions ───────────────────────────────────────────────────────
  const toggleLike = async () => {
    if (!item) return;
    if (!isAuthenticated) return openLoginModal();
    const liked = !item.liked;
    if (liked) {
      const now = Date.now();
      setHearts(list => [...list, ...[0, 1, 2, 3, 4].map(k => ({ id: now + k, x: Math.round((Math.random() - 0.5) * 24), d: k * 140 }))]);
      window.setTimeout(() => setHearts(list => list.filter(h => h.id < now || h.id > now + 4)), 2200);
    }
    setEntries(list => list.map((e, i) => i !== authorIdx ? e : { ...e, items: e.items.map(it => it.id === item.id ? { ...it, liked } : it) }));
    try {
      await likeStory(item.id, liked);
    } catch {
      setEntries(list => list.map((e, i) => i !== authorIdx ? e : { ...e, items: e.items.map(it => it.id === item.id ? { ...it, liked: !liked } : it) }));
    }
  };

  const submitReply = async () => {
    const text = reply.trim();
    if (!item?.allowReplies || own || !isAuthenticated || !text || sendingReply.current) return;
    sendingReply.current = true;
    setSending(true);
    const input = replyInput.current;
    try {
      const outcome = await sendStoryReply(item, text, t('stories.repliedToYourMoment', { defaultValue: 'Replied to your moment' }));
      if (outcome === 'paid-chat') {
        toast(t('stories.paidChat', { defaultValue: 'This person charges for messages. Open the chat to send it.' }));
      } else {
        toast.success(t('stories.replySent', { defaultValue: 'Reply sent' }));
        if (replyInput.current === input) {
          setReply('');
          input?.blur();
        }
      }
    } catch {
      toast.error(t('stories.replyFailed', { defaultValue: "Couldn't send your reply. Try again." }));
    } finally {
      sendingReply.current = false;
      setSending(false);
    }
  };

  const removeMoment = async () => {
    if (!item) return;
    try {
      await deleteStory(item.id);
      changedRef.current = true;
      const remaining = entry.items.filter(it => it.id !== item.id);
      if (!remaining.length) return close();
      setEntries(list => list.map((e, i) => (i === authorIdx ? { ...e, items: remaining } : e)));
      setItemIdx(i => Math.min(i, remaining.length - 1));
      setSheet(null);
      toast.success(t('stories.deleted', { defaultValue: 'Moment deleted' }));
    } catch {
      toast.error(t('stories.deleteFailed', { defaultValue: "Couldn't delete it. Try again." }));
    }
  };

  const report = (reason: string) => {
    if (!item) return;
    const send = () => {
      void reportStory(item.id, reason)
        .then(() => toast.success(t('stories.reported', { defaultValue: 'Thanks. We will take a look.' })))
        .catch(() => toast.error(t('stories.reportFailed', { defaultValue: "Couldn't send the report. Try again." })));
    };
    if (!isAuthenticated) {
      close();
      return openLoginModal({ then: send });
    }
    setSheet(null);
    send();
  };

  // Mute hides this person's Moments and posts (the shelf already leaves out
  // muted accounts); they are never told. Moves on to the next person.
  const muteAuthor = (address: string) => {
    setSheet(null);
    void muteUser(address)
      .then(result => {
        if (!result?.status) throw new Error('mute failed');
        changedRef.current = true;
        toast.success(t('stories.mutedToast', { defaultValue: "Muted. You won't see their Moments or posts." }));
        goAuthor(1);
      })
      .catch(() => toast.error(t('common.tryAgain', { defaultValue: 'Try again' })));
  };

  const unfollowAuthor = (address: string) => {
    setSheet(null);
    void unfollowUser(address)
      .then(result => {
        if (!result?.result) throw new Error('unfollow failed');
        changedRef.current = true;
        setEntries(list => list.map(e => e.author.address === address ? { ...e, following: false } : e));
        toast.success(t('stories.unfollowedToast', { defaultValue: 'Unfollowed' }));
      })
      .catch(() => toast.error(t('common.tryAgain', { defaultValue: 'Try again' })));
  };

  const openProfile = (address: string) => {
    close();
    navigate(`/app/profile?id=${address}`);
  };

  const openPost = (tokenId: number) => {
    close();
    navigate(`/app/post/${tokenId}`);
  };

  const followAuthor = () => {
    if (!entry) return;
    if (!isAuthenticated) return openLoginModal();
    const address = entry.author.address;
    setEntries(list => list.map(e => e.author.address === address ? { ...e, following: true } : e));
    changedRef.current = true;
    void toggleFollowFor(queryClient, address, false, { name: nameOf(entry.author) }).then(ok => {
      if (!ok) setEntries(list => list.map(e => e.author.address === address ? { ...e, following: false } : e));
    });
  };

  if (!entry || !item) return null;
  const a = entry.author;
  const shareable = item.shareable && Date.parse(item.expiresAt) > Date.now();
  const momentUrl = new URL(`/app/moment/${encodeURIComponent(item.id)}`, window.location.origin).href;
  const remix = () => {
    const source = { id: item.id, name: nameOf(a) };
    const openComposer = () => useStoriesStore.getState().openCreator(source);
    close();
    if (isAuthenticated) openComposer();
    else openLoginModal({ then: openComposer });
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(momentUrl);
      dismissSheet();
      toast.success(t('stories.linkCopied', { defaultValue: 'Link copied' }));
    } catch {
      toast.error(t('stories.copyLinkFailed', { defaultValue: "Couldn't copy the moment link." }));
    }
  };
  const shareOutside = async () => {
    try {
      await navigator.share({ url: momentUrl });
      dismissSheet();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) await copyLink();
    }
  };
  const openOriginal = async () => {
    if (!item.remixSourceId || originalRequest.current) return;
    const request = Symbol();
    originalRequest.current = request;
    setOpeningOriginal(true);
    try {
      const { author, item: original } = await getStory(item.remixSourceId);
      if (originalRequest.current !== request) return;
      if (!author || !original.shareable || Date.parse(original.expiresAt) <= Date.now()) {
        throw new Error('Original moment unavailable');
      }
      if (changedRef.current) refreshShelf();
      useStoriesStore.getState().openViewer(
        [{ author, own: author.address === me, following: false, seen: original.viewed, latestAt: original.createdAt, items: [original] }],
        0,
        { item: 0 },
      );
    } catch {
      if (originalRequest.current === request) toast.error(t('stories.originalUnavailable', { defaultValue: 'The original moment is no longer available.' }));
    } finally {
      if (originalRequest.current === request) {
        originalRequest.current = null;
        setOpeningOriginal(false);
      }
    }
  };
  const face = a.avatarImageUrl ? buildAvatarUrl(a.address, a.avatarImageUrl) : buildAvatarCdnFallbackUrl(a.address, undefined);
  const nextEntry = entries[authorIdx + 1];
  const fit = fitFor(item.width, item.height, frameSize);

  const body = (
    <div
      ref={viewerRef}
      data-stories
      data-story-viewer
      data-keep-dark
      role="dialog"
      aria-modal="true"
      aria-label={nameOf(a)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancelPress}
    >
      <div data-sv-backdrop style={{ backgroundImage: item.posterUrl ? `url("${item.posterUrl}")` : undefined }} />
      <div
        data-sv-page
        style={drag ? { transform: `${window.innerWidth >= 768 ? 'translate(-50%, -50%) ' : ''}translate(${drag.x * 0.4}px, ${drag.y}px) scale(${1 - Math.min(0.15, drag.y / 1600)})`, transition: 'none' } : undefined}
      >
        <div data-sv-media-frame ref={frameRef} data-fit={fit}>
          {item.type === 'video' ? (
            <video
              key={item.id}
              ref={videoRef}
              data-sv-media
              src={item.mediaUrl ?? undefined}
              poster={item.posterUrl ?? undefined}
              playsInline
              autoPlay={!sheet}
              muted={muted || item.muted}
              onLoadedData={() => setLoaded()}
              onTimeUpdate={e => {
                const v = e.currentTarget;
                if (v.duration) setProgress(v.currentTime / v.duration);
              }}
              onEnded={() => { if (!paused) goItem(1); }}
              onError={() => setLoaded()}
            />
          ) : (
            <img
              key={item.id}
              data-sv-media
              src={item.mediaUrl ?? item.posterUrl ?? undefined}
              alt={item.caption ?? ''}
              onLoad={() => setLoaded()}
              onError={() => setLoaded()}
              draggable={false}
            />
          )}
          {item.overlayUrl && <img data-sv-media src={item.overlayUrl} alt="" draggable={false} style={{ pointerEvents: 'none' }} />}
          {item.song && (
            <audio
              key={`song-${item.id}`}
              ref={audioRef}
              src={item.song.audioUrl.split('#')[0]}
              loop
              muted={muted}
              preload="auto"
            />
          )}
          <div data-sv-shade />
          {!loaded && (
            <div className="absolute inset-0 grid place-items-center z-[1]">
              <Loader2 className="w-7 h-7 animate-spin text-white/80" />
            </div>
          )}

          {item.mentions.length > 0 && (
            <div data-sv-mention-frame>
              {item.mentions.map(m => (
                <button
                  key={m.address}
                  type="button"
                  data-sv-mention
                  aria-label={t('stories.openProfile', { defaultValue: 'Open profile' })}
                  style={{
                    left: `${(m.x + m.w / 2) * 100}%`,
                    top: `${(m.y + m.h / 2) * 100}%`,
                    width: `${Math.max(m.w, 0.1) * 100}%`,
                    height: `${Math.max(m.h, 0.04) * 100}%`,
                  }}
                  onClick={() => openProfile(m.address)}
                />
              ))}
            </div>
          )}
        </div>

        <div data-sv-timing aria-hidden="true">
          {entry.items.map((story, index) => (
            <span key={story.id} data-played={index < itemIdx}>
              {index === itemIdx && <i style={{ transform: `scaleX(${Math.min(1, progress)})` }} />}
            </span>
          ))}
        </div>
        <div data-sv-scrim aria-hidden="true" />

        {/* Who posted it, straight on the picture like the live player: the
            face with Follow as a small glass +, name and age, then bare icons. */}
        <div data-sv-head>
          <span data-sv-face>
            <button type="button" onClick={() => openProfile(a.address)} aria-label={nameOf(a)}>
              {face ? <img src={face} alt="" /> : <span />}
            </button>
            {!own && !entry.following && (
              <button type="button" data-live-follow onClick={followAuthor} aria-label={t('follow.follow', { defaultValue: 'Follow' })}>
                <Plus className="h-3 w-3" />
              </button>
            )}
          </span>
          <button type="button" data-sv-who onClick={() => openProfile(a.address)}>
            <b>{own ? t('stories.yourDay', { defaultValue: 'Your day' }) : nameOf(a)}</b>
            <small>
              {/* Other languages bring their own "ago" ("9 sa. önce"); "now" never takes one. */}
              {!i18n.language?.startsWith('en') || ageLabel(item.createdAt) === 'now'
                ? localAge(item.createdAt, i18n.language)
                : t('stories.agoLabel', { time: ageLabel(item.createdAt), defaultValue: '{{time}} ago' })}
              {item.audience === 'followers' ? ` · ${t('stories.followersOnly', { defaultValue: 'Followers' })}` : ''}
              {item.closeFriends || item.audience === 'close_friends' ? (
                <span data-sv-close-friends> <Star className="inline size-3 -mt-px" fill="currentColor" aria-hidden /> {t('stories.closeFriends', { defaultValue: 'Close friends' })}</span>
              ) : null}
            </small>
          </button>
          {(item.type === 'video' && !item.muted) || item.song ? (
            <button type="button" data-sv-icon onClick={() => setMuted(m => !m)} aria-label={muted ? t('stages.unmute', { defaultValue: 'Unmute' }) : t('stages.mute', { defaultValue: 'Mute' })}>
              {muted ? <VolumeX className="w-[18px] h-[18px]" /> : <Volume2 className="w-[18px] h-[18px]" />}
            </button>
          ) : null}
          <button ref={moreButtonRef} type="button" data-sv-icon onClick={() => setSheet('more')} aria-label={t('stories.moreActions', { defaultValue: 'Moment options' })} aria-expanded={sheet === 'more'}>
            <MoreVertical className="w-5 h-5" />
          </button>
          <button ref={closeButtonRef} type="button" data-sv-icon onClick={close} aria-label={t('common.close', { defaultValue: 'Close' })}>
            <Close className="w-5 h-5" />
          </button>
        </div>

        {/* Status on one line, text on the picture like the live pills. */}
        <div data-sv-status>
          <span data-sv-pill>
            <span data-sv-tag>{t('stories.momentTag', { defaultValue: 'MOMENT' })}</span>
            {timeLeftLabel(item.expiresAt, t)}
          </span>
          {own && (
            <button type="button" data-sv-pill data-sv-viewers-trigger onClick={() => setSheet('viewers')} aria-label={t('stories.whoWatched', { defaultValue: 'Who watched' })}>
              <Eye className="w-3.5 h-3.5" />
              {viewsLabel}
              {(item.likeCount ?? 0) > 0 && (<><Heart className="w-3 h-3 ml-1 fill-current text-[rgb(255_45_122)]" />{formatCount(item.likeCount ?? 0)}</>)}
            </button>
          )}
          {item.song && (
            <span data-sv-pill data-sv-song-pill>
              {item.song.artworkUrl ? <img src={item.song.artworkUrl} alt="" /> : <Music className="w-3.5 h-3.5" />}
              <span>{item.song.title}{item.song.artist ? ` · ${item.song.artist}` : ''}</span>
            </span>
          )}
          {entry.items.length > 1 && (
            <span data-sv-pill>{t('stories.nOfM', { n: itemIdx + 1, m: entry.items.length, defaultValue: '{{n}} of {{m}}' })}</span>
          )}
        </div>

        {(item.caption || item.remixSourceId || postPeek) && (
          <div data-sv-caption data-with-room={roomComments.length > 0 && !docked ? 'true' : undefined}>
            {item.remixSourceId && (
              <button type="button" data-sv-original data-st-dark-glass onClick={openOriginal} disabled={openingOriginal}>
                <Repeat2 className="w-4 h-4" />
                {t('stories.watchOriginal', { defaultValue: 'Watch original moment' })}
              </button>
            )}
            {postPeek && (
              <button type="button" data-sv-original data-sv-go-post data-st-dark-glass onClick={() => openPost(item.postTokenId!)}>
                {t('stories.goToPost', { defaultValue: 'Go to post' })}
                {item.postAuthorName && <span data-sv-post-author dir="ltr">@{item.postAuthorName}</span>}
                <ArrowUpRight className="w-4 h-4" />
              </button>
            )}
            {item.caption && <MomentCaption key={item.id} text={item.caption} publicContent={item.shareable === true} />}
          </div>
        )}

        {!docked && !typing && <StoryRoomChat comments={roomComments} onOpen={() => setSheet('comments')} />}
        <div data-sv-flow aria-hidden="true">
          {hearts.map(h => (
            <i key={h.id} style={{ '--x': `${h.x}px`, '--d': `${h.d}ms` } as React.CSSProperties}><MomentHeart className="w-6 h-6" filled /></i>
          ))}
        </div>


        <div data-sv-reply style={sheet ? { visibility: 'hidden' } : undefined}>
          {own ? (
            <button type="button" data-sv-field data-sv-viewers-trigger onClick={() => setSheet('viewers')} aria-label={t('stories.whoWatched', { defaultValue: 'Who watched' })}>
              <Eye className="w-[18px] h-[18px]" />
              {viewsLabel}
              {(item.likeCount ?? 0) > 0 && (<><MomentHeart className="w-4 h-4 ml-1.5" filled />{formatCount(item.likeCount ?? 0)}</>)}
            </button>
          ) : !isAuthenticated ? (
            <button type="button" data-sv-field onClick={() => openLoginModal()}>
              {t('stories.signInToReply', { defaultValue: 'Sign in to reply' })}
            </button>
          ) : item.allowReplies ? (
            <input
              key={item.id}
              ref={replyInput}
              data-sv-field
              value={reply}
              maxLength={500}
              readOnly={sending}
              onChange={e => setReply(e.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submitReply(); }}
              placeholder={t('stories.privateReply', { defaultValue: 'Send a private reply…' })}
              aria-label={t('stories.sendPrivateReply', { defaultValue: 'Send a private reply' })}
            />
          ) : (
            <span data-sv-field data-off>{t('stories.repliesOff', { defaultValue: 'Replies are off' })}</span>
          )}
          {!own && (
            <button type="button" data-sv-key data-on={item.liked ? 'true' : 'false'} onClick={toggleLike} aria-label={t('stories.like', { defaultValue: 'Like' })} aria-pressed={item.liked}>
              <MomentHeart className="w-[22px] h-[22px]" filled={item.liked} />
            </button>
          )}
          {(!docked || own) && (
            <button ref={commentsButtonRef} type="button" data-sv-key onClick={() => setSheet('comments')} aria-label={t('stories.comments', { defaultValue: 'Comments' })}>
              <MomentComment className="w-[22px] h-[22px]" />
              {(item.commentCount ?? 0) > 0 && <span data-sv-count>{formatCount(item.commentCount ?? 0)}</span>}
            </button>
          )}
          {!own && isAuthenticated && item.allowReplies && (typing || reply || sending) ? (
            <Button type="button" size="icon" data-sv-key data-sv-send onPointerDown={e => e.preventDefault()}
              onClick={submitReply} disabled={!reply.trim()} loading={sending}
              aria-label={t('stories.sendPrivateReply', { defaultValue: 'Send a private reply' })}>
              {!sending && <Send className="!size-5" />}
            </Button>
          ) : shareable ? (
            <button type="button" data-sv-key onClick={() => setSheet('share')} aria-label={t('stories.share', { defaultValue: 'Share' })}>
              <MomentShare className="w-[22px] h-[22px]" />
            </button>
          ) : null}
        </div>


        {sheet === 'share-dm' && (
          <Suspense fallback={null}>
            <ShareToDmModal open url={momentUrl} aboveMoment onOpenChange={open => { if (!open) setSheet('share'); }} />
          </Suspense>
        )}
        {sheet && sheet !== 'share-dm' && (
          <div data-sv-sheet-backdrop onClick={dismissSheet}>
            <div ref={sheetRef} data-sv-sheet onClick={e => e.stopPropagation()}>
              {sheet === 'viewers' && own && <ViewersList item={item} audience={audience} viewsLabel={viewsLabel} onOpen={openProfile} onClose={dismissSheet} />}
              {sheet === 'comments' && (
                <StoryComments
                  key={item.id}
                  item={item}
                  signedIn={isAuthenticated}
                  onOpen={openProfile}
                  onClose={dismissSheet}
                  onSignIn={() => openLoginModal()}
                  onCount={n => {
                    void queryClient.invalidateQueries({ queryKey: ['moment-room-comments', item.id] });
                    setEntries(list => list.map((e, i) => i !== authorIdx ? e : { ...e, items: e.items.map(it => it.id === item.id ? { ...it, commentCount: n } : it) }));
                  }}
                />
              )}
              {sheet === 'share' && shareable && (
                <div className="flex flex-col">
                  {isAuthenticated && <SheetButton onClick={() => setSheet('share-dm')}><Send className="size-[18px]" />{t('copy.20e392c29da3', { defaultValue: 'Send in a message' })}</SheetButton>}
                  <SheetButton onClick={copyLink}><Link2 className="size-[18px]" />{t('postOptions.copyLink', { defaultValue: 'Copy link' })}</SheetButton>
                  {typeof navigator.share === 'function' && <SheetButton onClick={shareOutside}><ShareIcon className="size-[18px]" />{t('stories.share', { defaultValue: 'Share' })}</SheetButton>}
                  <SheetButton onClick={remix}><Repeat2 className="size-[18px]" />{t('stories.addToMoment', { defaultValue: 'Add to your Moment' })}</SheetButton>
                  <SheetButton onClick={dismissSheet}>{t('common.cancel', { defaultValue: 'Cancel' })}</SheetButton>
                </div>
              )}
              {sheet === 'more' && (
                <div className="flex flex-col">
                  {shareable && (
                    <>
                      <SheetButton onClick={remix}><Repeat2 className="w-[18px] h-[18px]" />{t('stories.remix', { defaultValue: 'Remix' })}</SheetButton>
                      <SheetButton onClick={copyLink}><Link2 className="w-[18px] h-[18px]" />{t('postOptions.copyLink', { defaultValue: 'Copy link' })}</SheetButton>
                    </>
                  )}
                  {own ? (
                    <>
                      <SheetButton onClick={() => setSheet('viewers')}>{t('stories.whoWatched', { defaultValue: 'Who watched' })}</SheetButton>
                      <SheetButton danger onClick={() => setSheet('delete')}>{t('stories.deleteMoment', { defaultValue: 'Delete moment' })}</SheetButton>
                    </>
                  ) : (
                    <>
                      <SheetButton onClick={() => openProfile(a.address)}>{t('stories.viewProfile', { defaultValue: 'View profile' })}</SheetButton>
                      {isAuthenticated && entry.following && (
                        <SheetButton onClick={() => unfollowAuthor(a.address)}>{t('stories.unfollow', { defaultValue: 'Unfollow' })}</SheetButton>
                      )}
                      {isAuthenticated && (
                        <SheetButton onClick={() => muteAuthor(a.address)}>{t('stories.mute', { defaultValue: 'Mute' })}</SheetButton>
                      )}
                      <SheetButton danger onClick={() => setSheet('report')}>{t('stories.report', { defaultValue: 'Report' })}</SheetButton>
                    </>
                  )}
                  <SheetButton onClick={dismissSheet}>{t('common.cancel', { defaultValue: 'Cancel' })}</SheetButton>
                </div>
              )}
              {sheet === 'report' && (
                <div className="flex flex-col">
                  <p className="text-[15px] font-semibold mb-2">{t('stories.whyReport', { defaultValue: "What's wrong with this moment?" })}</p>
                  {REPORT_REASONS.map(([key, label]) => (
                    <SheetButton key={key} onClick={() => report(key)}>{t(`stories.reasons.${key}`, { defaultValue: label })}</SheetButton>
                  ))}
                </div>
              )}
              {sheet === 'delete' && (
                <div className="flex flex-col">
                  <p className="text-[15px] font-semibold mb-1">{t('stories.deleteTitle', { defaultValue: 'Delete this moment?' })}</p>
                  <p className="text-[13px] opacity-70 mb-3">{t('stories.deleteBody', { defaultValue: 'It goes from your day and your archive.' })}</p>
                  <SheetButton danger onClick={removeMoment}>{t('common.delete', { defaultValue: 'Delete' })}</SheetButton>
                  <SheetButton onClick={() => setSheet(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</SheetButton>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {docked && (
        <aside data-sv-panel onPointerDown={e => e.stopPropagation()}>
          <header>
            <Button type="button" variant="ghost" size="lg" className="-ml-3 gap-2 px-3 text-base font-semibold" onClick={() => setSheet('comments')}>
              <MomentComment className="!size-5" />
              {t('stories.comments', { defaultValue: 'Comments' })}
            </Button>
            {own ? (
              <button type="button" data-sv-chip onClick={() => setSheet('viewers')}>
                <Eye className="w-4 h-4" />
                {viewsLabel}
              </button>
            ) : (item.commentCount ?? 0) > 0 ? (
              <span data-sv-panel-count>{formatCount(item.commentCount ?? 0)}</span>
            ) : null}
          </header>
          <StoryRoomRows
            comments={roomComments}
            onOpenProfile={openProfile}
            emptyLabel={t('stories.noCommentsYet', { defaultValue: 'No comments yet. Say something everyone can see.' })}
          />
        </aside>
      )}
      {docked && entries.length > authorIdx + 1 && (
        <nav data-sv-next aria-label={t('stories.upNext', { defaultValue: 'Up next' })}>
          {entries.slice(authorIdx + 1, authorIdx + 4).map((e, k) => {
            const cover = coverOf(e);
            const nextFace = e.author.avatarImageUrl ? buildAvatarUrl(e.author.address, e.author.avatarImageUrl) : buildAvatarCdnFallbackUrl(e.author.address, undefined);
            return (
              <button
                key={e.author.address}
                type="button"
                data-seen={e.seen ? 'true' : undefined}
                style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
                onClick={() => { setAuthorIdx(authorIdx + 1 + k); setItemIdx(startIndex(e)); }}
                aria-label={nameOf(e.author)}
              >
                {nextFace && <img src={nextFace} alt="" />}
              </button>
            );
          })}
          <span>{t('stories.upNext', { defaultValue: 'Up next' })}</span>
        </nav>
      )}
      {authorIdx > 0 && !docked && (
        <div data-sv-nav style={{ left: 'calc(50% - min(92vh, 900px) * 9 / 32 - 64px)' }}>
          <button type="button" data-sv-round data-st-dark-glass onClick={() => goAuthor(-1)} aria-label={t('common.previous', { defaultValue: 'Previous' })}><ChevronLeft className="w-5 h-5" /></button>
        </div>
      )}
      {nextEntry && !docked && (
        <div data-sv-nav style={{ right: 'calc(50% - min(92vh, 900px) * 9 / 32 - 64px)' }}>
          <button type="button" data-sv-round data-st-dark-glass onClick={() => goAuthor(1)} aria-label={t('common.next', { defaultValue: 'Next' })}><ChevronRight className="w-5 h-5" /></button>
        </div>
      )}
    </div>
  );

  return createPortal(body, document.body);
}

function SheetButton({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 w-full text-left py-3 px-1 text-[15px] border-b border-[var(--st-line)] last:border-0 ${danger ? 'text-[rgb(255_92_100)] font-semibold' : ''}`}
    >
      {children}
    </button>
  );
}

function ViewersList({
  item, audience, viewsLabel, onOpen, onClose,
}: {
  item: StoryItem;
  audience: UseInfiniteQueryResult<InfiniteData<Awaited<ReturnType<typeof getStoryViewers>>>>;
  viewsLabel: string;
  onOpen: (address: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rows = audience.data?.pages.flatMap(page => page.viewers) ?? [];
  const likes = audience.data?.pages[0]?.likeCount ?? item.likeCount ?? 0;

  return (
    <div>
      <div className="flex items-center gap-3 text-[14px] font-semibold">
        <span className="inline-flex items-center gap-1.5" aria-live="polite">
          <Eye className="size-4" aria-hidden />
          {viewsLabel}
        </span>
        <span className="inline-flex items-center gap-1.5"><Heart data-sv-heart className="size-4 fill-current" />{formatCount(likes)}</span>
        <Button type="button" variant="ghost" size="icon" className="ml-auto size-11 shrink-0 focus-visible:ring-white focus-visible:ring-offset-0" onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })}>
          <Close className="size-[18px]" />
        </Button>
      </div>
      {audience.isPending ? (
        <div role="status" className="py-6 grid place-items-center">
          <Loader2 className="size-5 animate-spin opacity-70" aria-hidden />
          <span className="sr-only">{t('common.loading', { defaultValue: 'Loading' })}</span>
        </div>
      ) : !audience.data ? (
        <Button type="button" variant="ghost" onClick={() => void audience.refetch()} loading={audience.isFetching}>{t('common.tryAgain', { defaultValue: 'Try again' })}</Button>
      ) : rows.length === 0 && !audience.hasNextPage ? (
        <p className="py-4 text-[14px] opacity-70">{t('stories.noViewersYet', { defaultValue: 'No one has watched it yet.' })}</p>
      ) : (
        <div className="flex flex-col">
          {rows.map(v => {
            const face = v.avatarImageUrl ? buildAvatarUrl(v.address, v.avatarImageUrl) : buildAvatarCdnFallbackUrl(v.address, undefined);
            const name = v.displayName || v.username || v.address.slice(0, 8);
            return (
              <Button key={v.address} type="button" variant="ghost" className="grid h-auto min-h-11 w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] justify-items-start gap-3 px-2 py-2 text-start focus-visible:ring-inset focus-visible:ring-white focus-visible:ring-offset-0" onClick={() => onOpen(v.address)}>
                <Avatar className="size-9">
                  {face && <AvatarImage src={face} alt="" className="object-cover" />}
                  <AvatarFallback className="bg-white/15 text-[13px] text-white">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="w-full min-w-0 overflow-hidden">
                  <span className="block text-[14px] font-medium truncate">{name}</span>
                  {v.username && <span className="block text-[12px] opacity-60 truncate">@{v.username}</span>}
                </span>
                {v.liked && <Heart data-sv-heart className="size-4 fill-current" />}
              </Button>
            );
          })}
          {audience.hasNextPage && (
            <Button type="button" variant="ghost" className="mt-2" disabled={audience.isFetching} loading={audience.isFetchingNextPage} onClick={() => void audience.fetchNextPage({ cancelRefetch: false })}>
              {t('common.showMore', { defaultValue: 'Show more' })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
