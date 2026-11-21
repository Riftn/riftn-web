/**
 * The full-screen story viewer.
 *
 * One person's moments play in order: a photo for 5 s, a video for its
 * length. The glass capsule at the top fills as the moment plays and its
 * dots count the moments. Tap the right side for the next one, the left for
 * the one before, hold to pause, swipe down (or Esc) to close, swipe sideways
 * (or the arrows on desktop) for the next person.
 *
 * Watching is counted once per signed-in person. Replies go to the owner as a
 * direct message; likes and views show only to the owner. Your own moments
 * show who watched instead of a reply bar.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Eye, Heart, Link2, Loader2, Repeat2, Volume2, VolumeX } from 'lucide-react';
import Close from '@/components/ui/cut-icons/close';
import More from '@/components/ui/cut-icons/more';
import Send from '@/components/ui/cut-icons/send';
import ShareIcon from '@/components/ui/cut-icons/feedshare';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  type StoryViewer as StoryViewerRow,
} from '@/lib/api/dehub/stories';
import { useRefreshStoryShelf } from '@/hooks/use-story-shelf';
import { ageLabel, nameOf, startIndex } from './story-utils';
import { sendStoryReply } from './story-reply';
import '@/styles/stories.css';

interface Props {
  entries: ShelfEntry[];
  startAuthor: number;
  startItem: number;
  onClose: () => void;
}

const HOLD_MS = 220;
const ShareToDmModal = lazy(() => import('@/components/app/modals/ShareToDmModal').then(m => ({ default: m.ShareToDmModal })));
const REPORT_REASONS = [
  ['spam_misleading', 'Spam'],
  ['harassment_bullying', 'Bullying or harassment'],
  ['sexual_content', 'Nudity or sexual content'],
  ['violent_content', 'Violence'],
  ['hateful_content', 'Hate'],
  ['other', 'Something else'],
] as const;

export function StoryViewer({ entries: initial, startAuthor, startItem, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const refreshShelf = useRefreshStoryShelf();
  const me = walletAddress?.toLowerCase() ?? null;

  const [entries, setEntries] = useState(initial);
  const [authorIdx, setAuthorIdx] = useState(startAuthor);
  const [itemIdx, setItemIdx] = useState(() => (startItem >= 0 ? startItem : startIndex(initial[startAuthor])));
  const [progress, setProgress] = useState(0);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [sheet, setSheet] = useState<null | 'viewers' | 'more' | 'report' | 'delete' | 'share' | 'share-dm'>(null);
  const [muted, setMuted] = useState(false);
  // Which moment has its picture in, by id: a cached image can report in before
  // the reset for a new moment runs, so a plain flag could stick at "loading".
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [openingOriginal, setOpeningOriginal] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);

  const entry = entries[authorIdx];
  const item: StoryItem | undefined = entry?.items[itemIdx];
  const loaded = !!item && loadedId === item.id;
  const setLoaded = useCallback(() => setLoadedId(item?.id ?? null), [item?.id]);
  const own = !!entry && !!me && entry.author.address === me;
  const paused = held || typing || sheet !== null || openingOriginal || !loaded;

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const viewedRef = useRef(new Set<string>());
  const changedRef = useRef(false);
  const originalRequest = useRef<symbol | null>(null);

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
  useEffect(() => {
    elapsedRef.current = 0;
    setProgress(0);
    setSheet(s => (s === 'viewers' ? s : null));
    setOpeningOriginal(false);
    return () => { originalRequest.current = null; };
  }, [authorIdx, itemIdx]);

  useEffect(() => {
    if (!sheet) return;
    sheetRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [sheet]);

  const dismissSheet = useCallback(() => {
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
      const p = elapsedRef.current / Math.max(1000, item.durationMs);
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
    goItem(rel < 0.33 ? -1 : 1);
  };

  // ── Actions ───────────────────────────────────────────────────────
  const toggleLike = async () => {
    if (!item) return;
    if (!isAuthenticated) return openLoginModal();
    const liked = !item.liked;
    setEntries(list => list.map((e, i) => i !== authorIdx ? e : { ...e, items: e.items.map(it => it.id === item.id ? { ...it, liked } : it) }));
    try {
      await likeStory(item.id, liked);
    } catch {
      setEntries(list => list.map((e, i) => i !== authorIdx ? e : { ...e, items: e.items.map(it => it.id === item.id ? { ...it, liked: !liked } : it) }));
    }
  };

  const submitReply = async () => {
    const text = reply.trim();
    if (!item || !text || sending) return;
    setSending(true);
    try {
      const outcome = await sendStoryReply(item, text, t('stories.repliedToYourMoment', { defaultValue: 'Replied to your moment' }));
      if (outcome === 'paid-chat') {
        toast(t('stories.paidChat', { defaultValue: 'This person charges for messages. Open the chat to send it.' }));
      } else {
        toast.success(t('stories.replySent', { defaultValue: 'Reply sent' }));
        setReply('');
        (document.activeElement as HTMLElement | null)?.blur();
      }
    } catch {
      toast.error(t('stories.replyFailed', { defaultValue: "Couldn't send your reply. Try again." }));
    } finally {
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

  const openProfile = (address: string) => {
    close();
    navigate(`/app/profile?id=${address}`);
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
  const capFill = progress;
  const nextEntry = entries[authorIdx + 1];

  const body = (
    <div
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
        <div data-sv-media-frame>
          {item.type === 'video' ? (
            <video
              key={item.id}
              ref={videoRef}
              data-sv-media
              src={item.mediaUrl ?? undefined}
              poster={item.posterUrl ?? undefined}
              playsInline
              autoPlay
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
              data-fit={item.width && item.height && item.width > item.height ? 'contain' : undefined}
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

        <div data-sv-cap data-st-dark-glass>
          <span data-sv-fill style={{ width: `${Math.min(100, capFill * 100)}%` }} />
          <button type="button" className="relative flex items-center gap-2.5 min-w-0" onClick={() => openProfile(a.address)}>
            {face ? <img src={face} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" /> : <span className="w-8 h-8 rounded-full bg-white/20 shrink-0" />}
            <span className="min-w-0 text-left">
              <span className="block text-[14px] font-semibold leading-tight truncate">{own ? t('stories.yourDay', { defaultValue: 'Your day' }) : nameOf(a)}</span>
              <span className="block text-[11.5px] text-white/70 mt-0.5">{ageLabel(item.createdAt)}{item.audience === 'followers' ? ` · ${t('stories.followersOnly', { defaultValue: 'Followers' })}` : ''}</span>
            </span>
          </button>
          <span data-sv-dots className="relative">
            {entry.items.length > 1 && entry.items.map((it, i) => <i key={it.id} data-on={i === itemIdx ? 'true' : 'false'} />)}
          </span>
          {(item.type === 'video' && !item.muted) || item.song ? (
            <button type="button" className="relative w-9 h-9 grid place-items-center" onClick={() => setMuted(m => !m)} aria-label={muted ? 'Sound on' : 'Sound off'}>
              {muted ? <VolumeX className="w-[18px] h-[18px]" /> : <Volume2 className="w-[18px] h-[18px]" />}
            </button>
          ) : null}
          <button ref={moreButtonRef} type="button" className="relative w-9 h-9 shrink-0 grid place-items-center" onClick={() => setSheet('more')} aria-label={t('stories.moreActions', { defaultValue: 'Moment options' })} aria-expanded={sheet === 'more'}>
            <More className="w-5 h-5" />
          </button>
          <button type="button" className="relative w-9 h-9 grid place-items-center" onClick={close} aria-label={t('common.close', { defaultValue: 'Close' })}>
            <Close className="w-5 h-5" />
          </button>
        </div>

        {item.song && (
          <div data-sv-song data-st-dark-glass>
            {item.song.artworkUrl ? <img src={item.song.artworkUrl} alt="" /> : <Music className="w-4 h-4" />}
            <span>{item.song.title}{item.song.artist ? ` · ${item.song.artist}` : ''}</span>
          </div>
        )}

        {(item.caption || item.remixSourceId) && (
          <div data-sv-caption>
            {item.remixSourceId && (
              <button type="button" data-sv-original data-st-dark-glass onClick={openOriginal} disabled={openingOriginal}>
                <Repeat2 className="w-4 h-4" />
                {t('stories.watchOriginal', { defaultValue: 'Watch original moment' })}
              </button>
            )}
            {item.caption && <div>{item.caption}</div>}
          </div>
        )}

        <div data-sv-reply style={sheet ? { visibility: 'hidden' } : undefined}>
          {own ? (
            <button type="button" data-sv-viewers-trigger data-st-dark-glass className="h-11 rounded-full px-4 inline-flex items-center gap-2 text-[14px] font-semibold" onClick={() => setSheet('viewers')} aria-label={t('stories.whoWatched', { defaultValue: 'Who watched' })}>
              <Eye className="w-[18px] h-[18px]" />
              {formatCount(item.viewCount ?? 0)}
              {(item.likeCount ?? 0) > 0 && (<><Heart className="w-4 h-4 ml-1.5 fill-current text-[rgb(255_92_120)]" />{formatCount(item.likeCount ?? 0)}</>)}
            </button>
          ) : !isAuthenticated ? (
            <button type="button" data-st-dark-glass className="h-11 rounded-full px-4 text-[14px] flex-1 text-left text-white/80" onClick={() => openLoginModal()}>
              {t('stories.signInToReply', { defaultValue: 'Sign in to reply' })}
            </button>
          ) : item.allowReplies ? (
            <input
              data-st-dark-glass
              value={reply}
              maxLength={500}
              onChange={e => setReply(e.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onKeyDown={e => { if (e.key === 'Enter') submitReply(); }}
              placeholder={t('stories.replyTo', { name: nameOf(a), defaultValue: 'Reply to {{name}}' })}
            />
          ) : (
            <span className="flex-1 text-[13px] text-white/60 px-2">{t('stories.repliesOff', { defaultValue: 'Replies are off' })}</span>
          )}
          {!own && (
            <button type="button" data-sv-round data-st-dark-glass data-on={item.liked ? 'true' : 'false'} onClick={toggleLike} aria-label={t('stories.like', { defaultValue: 'Like' })}>
              <Heart className={`w-5 h-5 ${item.liked ? 'fill-current' : ''}`} />
            </button>
          )}
          {shareable && (
            <button type="button" data-sv-round data-st-dark-glass onClick={() => setSheet('share')} aria-label={t('stories.share', { defaultValue: 'Share' })}>
              <ShareIcon className="w-5 h-5" />
            </button>
          )}
          {!own && isAuthenticated && item.allowReplies && reply.trim() && (
            <button type="button" data-sv-round data-st-dark-glass onClick={submitReply} disabled={sending} aria-label={t('common.send', { defaultValue: 'Send' })}>
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          )}
        </div>

        {sheet === 'share-dm' && (
          <Suspense fallback={null}>
            <ShareToDmModal open url={momentUrl} aboveMoment onOpenChange={open => { if (!open) setSheet('share'); }} />
          </Suspense>
        )}
        {sheet && sheet !== 'share-dm' && (
          <div data-sv-sheet-backdrop onClick={dismissSheet}>
            <div ref={sheetRef} data-sv-sheet onClick={e => e.stopPropagation()}>
              {sheet === 'viewers' && <ViewersList item={item} onOpen={openProfile} onClose={dismissSheet} />}
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

      {authorIdx > 0 && (
        <div data-sv-nav style={{ left: 'calc(50% - min(92vh, 900px) * 9 / 32 - 64px)' }}>
          <button type="button" data-sv-round data-st-dark-glass onClick={() => goAuthor(-1)} aria-label={t('common.previous', { defaultValue: 'Previous' })}><ChevronLeft className="w-5 h-5" /></button>
        </div>
      )}
      {nextEntry && (
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

function ViewersList({ item, onOpen, onClose }: { item: StoryItem; onOpen: (address: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<StoryViewerRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [counts, setCounts] = useState({ views: item.viewCount ?? 0, likes: item.likeCount ?? 0 });

  useEffect(() => {
    let alive = true;
    getStoryViewers(item.id).then(r => {
      if (!alive) return;
      setRows(r.viewers);
      setNext(r.next);
      setCounts({ views: r.viewCount, likes: r.likeCount });
    }).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [item.id]);

  const more = async () => {
    if (!next) return;
    const r = await getStoryViewers(item.id, next).catch(() => null);
    if (!r) return;
    setRows(list => [...(list ?? []), ...r.viewers]);
    setNext(r.next);
  };

  return (
    <div>
      <div className="flex items-center gap-3 text-[14px] font-semibold">
        <span className="inline-flex items-center gap-1.5"><Eye className="w-4 h-4" />{formatCount(counts.views)}</span>
        <span className="inline-flex items-center gap-1.5"><Heart data-sv-heart className="w-4 h-4 fill-current" />{formatCount(counts.likes)}</span>
        <button type="button" className="ml-auto grid size-11 place-items-center rounded-full hover:bg-white/10" onClick={onClose} aria-label={t('common.close', { defaultValue: 'Close' })}>
          <Close className="size-[18px]" />
        </button>
      </div>
      {rows === null ? (
        <div className="py-6 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin opacity-70" /></div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-[14px] opacity-70">{t('stories.noViewersYet', { defaultValue: 'No one has watched it yet.' })}</p>
      ) : (
        <div className="flex flex-col">
          {rows.map(v => {
            const face = v.avatarImageUrl ? buildAvatarUrl(v.address, v.avatarImageUrl) : buildAvatarCdnFallbackUrl(v.address, undefined);
            const name = v.displayName || v.username || v.address.slice(0, 8);
            return (
              <button key={v.address} type="button" className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_1rem] items-center gap-3 py-2 text-start" onClick={() => onOpen(v.address)}>
                <Avatar className="size-9">
                  {face && <AvatarImage src={face} alt="" className="object-cover" />}
                  <AvatarFallback className="bg-white/15 text-[13px] text-white">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 overflow-hidden">
                  <span className="block text-[14px] font-medium truncate">{name}</span>
                  {v.username && <span className="block text-[12px] opacity-60 truncate">@{v.username}</span>}
                </span>
                {v.liked && <Heart data-sv-heart className="w-4 h-4 fill-current" />}
              </button>
            );
          })}
          {next && <button type="button" className="py-3 text-[14px] font-semibold" onClick={more}>{t('common.showMore', { defaultValue: 'Show more' })}</button>}
        </div>
      )}
    </div>
  );
}
