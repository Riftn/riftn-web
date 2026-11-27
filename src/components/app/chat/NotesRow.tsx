/**
 * Notes
 * =====
 * A note is a short line with an optional song, GIF or place that stays up for
 * 24 hours. The Notes sheet opens from the + in Messages and from the note
 * button in a chat. A status opens like a Moment: full screen on phones (a
 * drawer in the middle column on desktop), big words on a blurred copy of the
 * person's photo or a colour they picked, tap or swipe through everyone's,
 * reply or heart at the bottom.
 */
import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, Eye, Heart, Loader2, MapPin, Music2, Play, Plus, SendHorizontal, X } from 'lucide-react';
import Languages from '@/components/ui/cut-icons/language';
import { supabase } from '@/integrations/supabase/client';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl } from '@/lib/media-url';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { soundWindow } from '@/lib/sound-window';
import { SoundPicker } from '@/features/post/components/SoundPicker';
import type { AttachedSound } from '@/features/post/hooks/usePostSound';
import { EmojiGifPicker } from './EmojiGifPicker';
import { useNoteWords } from './note-translate';
import { formatCount } from '@/lib/format-count';
import type { StoryAuthor, StorySong } from '@/lib/api/dehub/stories';
import {
  deleteNote, getNotes, isNoteGif, likeNote, NOTE_LOCATION_MAX, NOTE_TEXT_MAX, putNote,
  type Note, type NoteEntry, type NoteInput,
} from '@/lib/api/dehub/notes';
import { BoldText, stripBold } from '@/lib/bold-markup';
import { activityMenuEvents, useActivityMenu } from '@/hooks/use-activity-menu';
import { getActivityShelfPreferences, setActivityBarHidden, useActivityShelfPreferences } from '@/lib/activity-shelf-preferences';

const StatusMenu = lazy(() => import('../stories/ActivityShelfMenu').then(module => ({ default: module.ActivityShelfMenu })));
const statusKey = (entry: NoteEntry) => `status:${entry.note.id}`;
const visibleNotes = (notes: NoteEntry[], dismissed: string[]) => notes.filter(entry => !dismissed.includes(statusKey(entry)));

// A tiny shared store instead of react-query, so the row also renders where
// there is no QueryClientProvider (tests, the state gallery).
type NotesData = { mine: NoteEntry | null; notes: NoteEntry[] };
let notesData: NotesData | null = null;
let notesFetchedAt = 0;
let notesRequest = 0;
let activeNotesReaders = 0;
let notesRefreshTimer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
export function refreshNotes(): void {
  notesFetchedAt = Date.now();
  const request = ++notesRequest;
  getNotes().then(d => {
    if (request !== notesRequest) return;
    notesData = d;
    emit();
  }).catch(() => {});
}
export function useNotes({ enabled = true, refreshOnStart = false } = {}): NotesData | null {
  const pageActive = useContext(CachedPageActiveContext);
  const { dismissed } = useActivityShelfPreferences();
  const data = useSyncExternalStore(
    useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []),
    () => notesData,
    () => null,
  );
  useEffect(() => {
    if (!enabled || !pageActive) return;
    if (refreshOnStart || Date.now() - notesFetchedAt > 60_000) refreshNotes();
    activeNotesReaders += 1;
    notesRefreshTimer ??= setInterval(refreshNotes, 5 * 60_000);
    return () => {
      activeNotesReaders -= 1;
      if (activeNotesReaders === 0) {
        clearInterval(notesRefreshTimer);
        notesRefreshTimer = undefined;
      }
    };
  }, [enabled, pageActive, refreshOnStart]);
  return useMemo(() => data ? { ...data, notes: visibleNotes(data.notes, dismissed) } : null, [data, dismissed]);
}

const nameOf = (a: StoryAuthor) => a.displayName || a.username || `${a.address.slice(0, 6)}…`;

function songFrom(sound: AttachedSound): StorySong | null {
  const raw = sound.url.split('#')[0];
  const audioUrl = /^https:\/\//.test(raw) ? raw : getMediaUrl(raw);
  if (!audioUrl || !/^https:\/\//.test(audioUrl)) return null;
  return {
    title: sound.title,
    artist: sound.creator,
    audioUrl,
    artworkUrl: sound.creatorAvatar && /^https:\/\//.test(sound.creatorAvatar) ? sound.creatorAvatar : undefined,
    startMs: Math.round((soundWindow(sound.url)?.start ?? 0) * 1000),
  };
}

/** Note bubbles use the kit chip material, so every theme (light ones too) paints them. */
const BUBBLE_STYLE = { background: 'var(--kit-chip-bg)', boxShadow: 'inset 0 0 0 1px var(--kit-hairline)' } as const;

/** The small speech bubble above an avatar. */
function NoteBubble({ note, placeholder, own }: { note: Note | null; placeholder?: string; own?: boolean }) {
  const words = useNoteWords(note?.text, own).shown;
  if (!note) {
    return (
      <span data-note-bubble style={BUBBLE_STYLE} className="flex max-w-[84px] items-center gap-1 truncate rounded-[10px] px-2 py-1 text-[11px] text-zinc-400">
        <Plus className="h-3 w-3 shrink-0" />{placeholder}
      </span>
    );
  }
  return (
    <span data-note-bubble style={BUBBLE_STYLE} className="flex max-w-[84px] flex-col items-center gap-0.5 rounded-[10px] px-2 py-1 text-[11px] font-medium leading-tight text-white">
      {note.gifUrl && <img src={note.gifUrl} alt="" className="h-8 w-12 rounded-md object-cover" loading="lazy" />}
      {note.text && <span className="line-clamp-2 break-words text-center"><BoldText text={words} /></span>}
      {!note.text && note.song && <span className="flex max-w-full items-center gap-0.5 truncate"><Music2 className="h-3 w-3 shrink-0" /><span className="truncate">{note.song.title}</span></span>}
      {!note.text && !note.song && note.location && <span className="flex max-w-full items-center gap-0.5 truncate"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{note.location}</span></span>}
    </span>
  );
}

/** Share of the 24 hours a note has left, 0..1, refreshed every minute. */
export function useNoteLeft(note: Note | null): number {
  const calc = useCallback(() => {
    if (!note) return 0;
    const start = Date.parse(note.postedAt);
    const end = Date.parse(note.expiresAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
    return Math.min(1, Math.max(0, (end - Date.now()) / (end - start)));
  }, [note]);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    // Starts empty and sweeps in on the next frame, so the ring animates.
    const raf = requestAnimationFrame(() => setLeft(calc()));
    const id = setInterval(() => setLeft(calc()), 60_000);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, [calc]);
  return left;
}

/**
 * Countdown ring: a rounded-square line that drains as the 24 hours run out.
 * Drawn in currentColor (text-white), so light themes repaint it with the ink.
 */
export function NoteRing({ left, size = 64, radius = 14 }: { left: number; size?: number; radius?: number }) {
  const stroke = 2.5;
  const side = size - stroke;
  const len = 4 * (side - 2 * radius) + 2 * Math.PI * radius;
  const box = { x: stroke / 2, y: stroke / 2, width: side, height: side, rx: radius, ry: radius, fill: 'none', strokeWidth: stroke };
  return (
    <svg data-note-ring width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white" aria-hidden>
      <rect {...box} stroke="currentColor" strokeOpacity={0.16} />
      <rect
        {...box}
        stroke="currentColor"
        strokeLinecap="round"
        strokeDasharray={`${len} ${len}`}
        strokeDashoffset={len * (1 - left)}
        style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)' }}
      />
    </svg>
  );
}

/**
 * One note in the row. Every tile is the same size: a bubble slot on top
 * (empty when there are no words), the face inside its countdown ring, and
 * the name. A GIF note shows the GIF in place of the face.
 */
export function NoteTile({ author, note, label, own, onClick, inCard }: { author: StoryAuthor; note: Note | null; label: string; own?: boolean; onClick: () => void; inCard?: boolean }) {
  const { t } = useTranslation();
  const avatar = buildAvatarUrl(author.address, author.avatarImageUrl, 112);
  const left = useNoteLeft(note);
  const gif = note?.gifUrl || null;
  const showBubble = !note || !!note.text || (!gif && (!!note.song || !!note.location));
  const Root = inCard ? 'span' : 'button';
  return (
    <Root
      {...(inCard
        ? { role: 'button', tabIndex: 0, onClick: (e: React.MouseEvent) => { e.stopPropagation(); onClick(); }, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(); } } }
        : { type: 'button' as const, onClick })}
      data-note-tile={own ? 'own' : ''}
      className="relative flex w-[84px] shrink-0 flex-col items-center gap-1 pt-1 text-center"
    >
      <span className="flex h-9 items-end justify-center">
        {showBubble && <NoteBubble own={own} note={note && gif ? { ...note, gifUrl: null } : note} placeholder={t('notes.add', { defaultValue: 'Note' })} />}
      </span>
      <span className="relative flex h-16 w-16 items-center justify-center">
        {gif ? (
          <img data-note-gif-face src={gif} alt="" loading="lazy" className="h-14 w-14 rounded-xl object-cover" />
        ) : (
          <Avatar className="h-14 w-14 rounded-xl">
            {avatar && <AvatarImage src={avatar} className="rounded-xl" />}
            <AvatarFallback className="rounded-xl bg-zinc-700 text-white">{nameOf(author).charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        {note && <NoteRing left={left} />}
      </span>
      <span className="w-full truncate text-[11px] text-zinc-400">{label}</span>
    </Root>
  );
}

// ── The open status (Instagram Notes style) ─────────────────────────────
// Tapping a status opens a short sheet: the person's face big, and the same
// white cloud as in the row above it, grown up. Writing your own happens IN
// that cloud, over your own face, so what you see is what friends see.

// ── The status screen ────────────────────────────────────────────────────
// A status opens like a Moment: full screen on phones, a drawer in the middle
// column on desktop. The words sit big in the middle on a blurred copy of the
// person's photo (or the colour they picked), bars on top, and a reply box and
// a heart at the bottom. Tap the sides or swipe to go through everyone's.

/** How long one status stays before the next one comes up. */
const NOTE_PAGE_MS = 7000;

/** Colours a status can sit on, besides the person's own photo. */
const BACKDROPS: Record<string, string> = {
  violet: 'linear-gradient(160deg,#a194ff 0%,#6c52f0 55%,#3a289c 100%)',
  pink: 'linear-gradient(160deg,#ff90c2 0%,#f0477f 55%,#981e4b 100%)',
  ink: 'linear-gradient(160deg,#2a2a31 0%,#0b0b0c 100%)',
  mint: 'linear-gradient(160deg,#94e6d2 0%,#5fb0e6 55%,#3a6cb5 100%)',
};
const BACKDROP_KEYS = ['photo', 'violet', 'pink', 'ink', 'mint'] as const;
/** White words stay readable on every backdrop, the light ones too. */
const WORD_SHADOW = '0 1px 18px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)';

/**
 * The screen is always white on a dark or coloured backdrop, whatever the
 * theme. The light theme passes repaint drawer text, glass and borders with
 * !important rules that even data-keep-dark loses to, so the sheet states its
 * own paint here, one notch stronger.
 */
const N = 'html body [data-note-sheet]:not(#_):not(#_):not(#_):not(#_):not(#_):not(#_)';
const NOTE_SHEET_CSS = [
  `${N}::after{display:none}`,
  `${N} [data-note-backdrop] img{filter:blur(44px) saturate(1.25) brightness(.72)!important}`,
  `${N} :is(*,svg){color:#fff!important}`,
  `${N} [data-note-dim]{color:rgba(255,255,255,.72)!important}`,
  `${N} [data-note-glass]{background-color:rgba(0,0,0,.22)!important;border-color:rgba(255,255,255,.26)!important}`,
  `${N} [data-note-soft]{background-color:rgba(255,255,255,.13)!important;border-color:transparent!important}`,
  `${N} [data-note-card]{background-color:rgba(0,0,0,.38)!important;border-color:rgba(255,255,255,.16)!important}`,
  `${N} [data-note-track]{background-color:rgba(255,255,255,.3)!important}`,
  `${N} [data-note-fill]{background-color:#fff!important}`,
  `${N} [data-note-tools] button:not([data-note-ink]){background-color:rgba(0,0,0,.22)!important;border-color:rgba(255,255,255,.26)!important}`,
  `${N} [data-note-ink]{background-color:#fff!important;border-color:transparent!important}`,
  `${N} [data-note-ink] :is(*,svg),${N} [data-note-ink]{color:#0b0b0c!important}`,
  `${N} [data-note-danger]{color:#ff6b7d!important}`,
  `${N} svg[data-note-heart="on"]{color:#ff3b5c!important;fill:#ff3b5c!important}`,
  `${N} [data-note-text]{font-size:var(--note-size,31px)!important;line-height:1.18!important}`,
  `${N} :is(textarea,input)::placeholder{color:rgba(255,255,255,.55)!important;-webkit-text-fill-color:rgba(255,255,255,.55)!important;opacity:1}`,
].join('');

/** "2h", "35m": short, like the chat list. */
function shortSpan(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return '1m';
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

/** Bigger words for a short line, smaller for a long one. */
const wordSize = (text: string) => (text.length <= 18 ? 36 : text.length <= 36 ? 31 : 26);

function Backdrop({ author, background }: { author: StoryAuthor; background?: string | null }) {
  const preset = background ? BACKDROPS[background] : undefined;
  const avatar = buildAvatarUrl(author.address, author.avatarImageUrl, 200);
  return (
    <div aria-hidden data-note-backdrop={preset ? background : 'photo'} className="absolute inset-0 overflow-hidden" style={{ background: preset || 'linear-gradient(160deg,#3a3340 0%,#141417 100%)' }}>
      {!preset && avatar && (
        <img src={avatar} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover" style={{ filter: 'blur(44px) saturate(1.25) brightness(0.72)' }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(0,0,0,.42) 0%,rgba(0,0,0,0) 24%,rgba(0,0,0,0) 68%,rgba(0,0,0,.5) 100%)' }} />
    </div>
  );
}

/** One bar per status; the current one fills, and its end turns the page. */
function NoteBars({ count, index, paused, onDone }: { count: number; index: number; paused?: boolean; onDone?: () => void }) {
  return (
    <div data-note-bars className="flex gap-1">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} data-note-track className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
          {i < index || (i === index && !onDone) ? (
            <span data-note-fill className="block h-full w-full bg-white" />
          ) : i === index ? (
            <span
              key={`run-${index}`}
              data-note-fill
              className="block h-full w-full origin-left bg-white"
              style={{ animation: `note-fill ${NOTE_PAGE_MS}ms linear forwards`, animationPlayState: paused ? 'paused' : 'running' }}
              onAnimationEnd={onDone}
            />
          ) : null}
        </span>
      ))}
      <style>{'@keyframes note-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}'}</style>
    </div>
  );
}

function StageHead({ author, title, sub, onClose }: { author: StoryAuthor; title: string; sub: string; onClose: () => void }) {
  const { t } = useTranslation();
  const avatar = buildAvatarUrl(author.address, author.avatarImageUrl, 80);
  return (
    <div className="mt-3 flex items-center gap-2.5">
      <Avatar style={{ borderRadius: 11 }} className="h-9 w-9 shrink-0">
        {avatar && <AvatarImage src={avatar} style={{ borderRadius: 11 }} className="object-cover" />}
        <AvatarFallback style={{ borderRadius: 11 }} className="bg-zinc-700 text-white">{nameOf(author).charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[15px] font-bold text-white">{title}</span>
        <span data-note-dim className="block truncate text-[12.5px] text-white/70">{sub}</span>
      </span>
      <button type="button" data-note-close aria-label={t('copy.7d9eb7acb13e', { defaultValue: 'Close' })} onClick={onClose} className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-[10px] text-white hover:bg-white/10">
        <X className="h-[22px] w-[22px]" />
      </button>
    </div>
  );
}

/** A song under the words: artwork, title, and bars while it plays. Tap to play or pause. */
function StatusSong({ song, autoPlay }: { song: StorySong; autoPlay?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const audio = ref.current;
    if (!audio || !autoPlay) return;
    audio.currentTime = (song.startMs || 0) / 1000;
    audio.play().then(() => setPlaying(true)).catch(() => {});
    return () => audio.pause();
  }, [autoPlay, song.audioUrl, song.startMs]);
  const toggle = () => {
    const audio = ref.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); return; }
    if (!audio.currentTime) audio.currentTime = (song.startMs || 0) / 1000;
    audio.play().then(() => setPlaying(true)).catch(() => {});
  };
  return (
    <button
      type="button"
      data-note-song
      onClick={toggle}
      data-note-soft
      className="flex max-w-full items-center gap-2 rounded-[12px] bg-white/15 py-1 pl-1 pr-3 text-left text-[13px] font-bold text-white backdrop-blur-md"
    >
      {song.artworkUrl
        ? <img src={song.artworkUrl} alt="" className="h-7 w-7 shrink-0 rounded-[8px] object-cover" />
        : <span data-note-soft className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-white/15"><Music2 className="h-4 w-4 text-white" /></span>}
      <span className="min-w-0 truncate">{song.title}{song.artist ? ` · ${song.artist}` : ''}</span>
      {playing
        ? <span data-note-playing aria-hidden className="flex h-3 shrink-0 items-end gap-[2px]">{[0, 1, 2].map(i => <span key={i} className="w-[2.5px] origin-bottom animate-[note-bar_0.9s_ease-in-out_infinite] rounded-[1px] bg-white" style={{ height: 11, animationDelay: `${i * 0.15}s` }} />)}</span>
        : <Play className="h-3 w-3 shrink-0 fill-white text-white" />}
      <audio ref={ref} src={song.audioUrl} preload="none" onEnded={() => setPlaying(false)} />
      <style>{'@keyframes note-bar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}'}</style>
    </button>
  );
}

/** The middle of a status: GIF, big words, song, place. */
function StatusWords({ note, words, autoPlay, footer }: { note: Note; words: string; autoPlay?: boolean; footer?: React.ReactNode }) {
  return (
    <div className="flex w-full max-w-[420px] flex-col items-center gap-3 px-6 text-center">
      {note.gifUrl && <img src={note.gifUrl} alt="" className="max-h-44 rounded-[16px] object-contain" />}
      {note.text && (
        <p key={words} data-note-words className="break-words font-extrabold leading-[1.18] text-white animate-in fade-in duration-200" style={{ fontSize: wordSize(stripBold(words)), textShadow: WORD_SHADOW }}>
          <BoldText text={words} />
        </p>
      )}
      {note.song && <StatusSong song={note.song} autoPlay={autoPlay} />}
      {note.location && (
        <span className="flex items-center gap-1 text-[14px] font-semibold text-white/85" style={{ textShadow: WORD_SHADOW }}>
          <MapPin className="h-4 w-4" />{note.location}
        </span>
      )}
      {footer}
    </div>
  );
}

/** Press-and-hold pauses, a tap on either side turns the page, a swipe turns it too, a swipe down closes. */
function useStageGestures({ onPrev, onNext, onClose, setHeld }: { onPrev: () => void; onNext: () => void; onClose: () => void; setHeld: (v: boolean) => void }) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  const skip = (e: React.PointerEvent) => !!(e.target as HTMLElement).closest('button, input, textarea, a, form, [data-note-mine-card]');
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (skip(e)) return;
      start.current = { x: e.clientX, y: e.clientY, at: Date.now() };
      setHeld(true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      setHeld(false);
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) onNext(); else onPrev(); return; }
      if (dy > 90 && dy > Math.abs(dx)) { onClose(); return; }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - s.at < 350) {
        const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (e.clientX - box.left < box.width / 3) onPrev(); else onNext();
      }
    },
    onPointerCancel: () => { start.current = null; setHeld(false); },
  };
}

/** One person's status, with the reply box and the heart. */
function NotePage({ entry, onSend, onTyping }: { entry: NoteEntry; onSend: (text: string) => void; onTyping: (typing: boolean) => void }) {
  const { t } = useTranslation();
  const { note, author } = entry;
  const words = useNoteWords(note.text);
  const name = nameOf(author);
  const [liked, setLiked] = useState(!!note.liked);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  useEffect(() => { onTyping(focused || !!text.trim()); }, [focused, text, onTyping]);
  const toggleLike = () => {
    const next = !liked;
    setLiked(next);
    likeNote(note.id, next).then(() => { note.liked = next; refreshNotes(); }).catch(() => setLiked(!next));
  };
  const send = () => {
    const reply = text.trim();
    if (!reply) return;
    // The note's words ride along, so the chat shows what was answered.
    onSend(note.text ? `📝 “${note.text}”\n${reply}` : reply);
  };
  return (
    <>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <StatusWords
          note={note}
          words={words.shown}
          autoPlay
          footer={note.text && words.offer ? (
            <button
              type="button"
              data-note-translate={words.isTranslated ? 'translated' : 'original'}
              disabled={words.isLoading}
              onClick={words.isTranslated ? words.showOriginal : words.translate}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/80"
              style={{ textShadow: WORD_SHADOW }}
            >
              {words.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
              {words.isLoading
                ? t('stories.translating', { defaultValue: 'Translating…' })
                : words.isTranslated ? t('stories.seeOriginal', { defaultValue: 'See original' }) : t('stories.translate', { defaultValue: 'Translate' })}
            </button>
          ) : null}
        />
      </div>
      <form data-note-reply className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); send(); }}>
        <input
          data-note-reply-input
          data-note-glass
          value={text}
          onChange={e => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={1000}
          placeholder={t('notes.replyTo', { defaultValue: 'Reply to {{name}}…', name })}
          aria-label={t('notes.replyTo', { defaultValue: 'Reply to {{name}}…', name })}
          className="h-12 min-w-0 flex-1 rounded-[14px] border border-white/25 bg-black/20 px-4 text-[15px] text-white outline-none backdrop-blur-md focus:border-white/50"
        />
        {text.trim() ? (
          <button type="submit" data-note-ink aria-label={t('notes.send', { defaultValue: 'Send' })} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] animate-in fade-in zoom-in-90 duration-150" style={{ background: '#fff', color: '#0b0b0c' }}>
            <SendHorizontal className="h-5 w-5" style={{ color: '#0b0b0c' }} />
          </button>
        ) : (
          <button
            type="button"
            data-note-like={liked ? 'on' : 'off'}
            data-note-glass
            aria-pressed={liked}
            aria-label={liked ? t('notes.unlike', { defaultValue: 'Unlike' }) : t('notes.like', { defaultValue: 'Like' })}
            onClick={toggleLike}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-white/25 bg-black/20 text-white backdrop-blur-md"
          >
            <Heart
              key={liked ? 'on' : 'off'}
              className={`h-[22px] w-[22px] ${liked ? 'animate-in zoom-in-50 duration-200' : ''}`}
              data-note-heart={liked ? 'on' : undefined}
              style={liked ? { color: '#ff3b5c', fill: '#ff3b5c' } : undefined}
            />
          </button>
        )}
      </form>
    </>
  );
}

/** Everyone's statuses, one after another, starting at the one you tapped. */
function NoteStage({ entries, start, onClose, onSend }: { entries: NoteEntry[]; start: number; onClose: () => void; onSend: (entry: NoteEntry, text: string) => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(start);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const entry = entries[Math.min(index, entries.length - 1)];
  const next = useCallback(() => { setIndex(i => (i < entries.length - 1 ? i + 1 : i)); if (index >= entries.length - 1) onClose(); }, [entries.length, index, onClose]);
  const prev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const gestures = useStageGestures({ onPrev: prev, onNext: next, onClose, setHeld });
  useEffect(() => {
    if (typing) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [next, prev, typing]);
  if (!entry) return null;
  const ago = shortSpan(Date.now() - Date.parse(entry.note.postedAt));
  return (
    <div data-note-stage className="relative flex h-full w-full touch-pan-y select-none flex-col overflow-hidden" {...gestures}>
      <Backdrop key={entry.note.id} author={entry.author} background={entry.note.background} />
      <div className="relative z-10 flex h-full flex-col px-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-[calc(0.625rem+env(safe-area-inset-top))] md:pt-3.5">
        <NoteBars count={entries.length} index={index} paused={held || typing} onDone={next} />
        <StageHead author={entry.author} title={nameOf(entry.author)} sub={t('notes.postedAgo', { defaultValue: '{{time}} ago', time: ago })} onClose={onClose} />
        <NotePage key={entry.note.id} entry={entry} onSend={text => onSend(entry, text)} onTyping={setTyping} />
      </div>
    </div>
  );
}

/** Your own status: how long it has left, who hearted it, edit or delete. */
function MyNoteStage({ entry, onEdit, onClose }: { entry: NoteEntry; onEdit: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const likers = entry.likers ?? [];
  const count = Math.max(entry.note.likeCount ?? 0, likers.length);
  const left = shortSpan(Date.parse(entry.note.expiresAt) - Date.now());
  const remove = () => {
    if (saving) return;
    setSaving(true);
    deleteNote().then(() => { refreshNotes(); onClose(); })
      .catch(() => toast.error(t('notes.failed', { defaultValue: "Your status didn't go up. Try again." })))
      .finally(() => setSaving(false));
  };
  return (
    <div data-note-stage="mine" className="relative flex h-full w-full flex-col overflow-hidden">
      <Backdrop author={entry.author} background={entry.note.background} />
      <div className="relative z-10 flex h-full flex-col px-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-[calc(0.625rem+env(safe-area-inset-top))] md:pt-3.5">
        <NoteBars count={1} index={0} />
        <StageHead author={entry.author} title={t('notes.yourStatus', { defaultValue: 'Your status' })} sub={t('notes.timeLeft', { defaultValue: '{{time}} left', time: left })} onClose={onClose} />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <StatusWords note={entry.note} words={entry.note.text ?? ''} />
        </div>
        <div data-note-mine-card data-note-card className="rounded-[18px] border border-white/15 bg-black/35 p-2.5 backdrop-blur-xl">
          {count > 0 && (
            <div data-note-likers className="mb-2.5 flex items-center gap-2.5 px-1.5 pt-1">
              <Heart data-note-heart="on" className="h-5 w-5 shrink-0" style={{ color: '#ff3b5c', fill: '#ff3b5c' }} />
              <span className="flex shrink-0">
                {likers.slice(0, 3).map((a, i) => (
                  <img key={a.address} src={buildAvatarUrl(a.address, a.avatarImageUrl, 56)} alt="" className="h-[26px] w-[26px] rounded-[8px] object-cover" style={{ marginLeft: i ? -8 : 0, boxShadow: '0 0 0 2px rgba(0,0,0,0.55)' }} />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-white">
                {likers.length && count > 1
                  ? t('notes.likedByMore', { defaultValue: 'Liked by {{name}} and {{others}} more', name: nameOf(likers[0]), others: formatCount(count - 1) })
                  : likers.length
                    ? t('notes.likedBy', { defaultValue: 'Liked by {{name}}', name: nameOf(likers[0]) })
                    : t('notes.likes', { defaultValue: '{{total}} likes', total: formatCount(count) })}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" data-note-edit data-note-soft onClick={onEdit} className="h-11 flex-1 rounded-[13px] bg-white/[0.12] text-[15px] font-bold text-white hover:bg-white/[0.18]">
              {t('notes.edit', { defaultValue: 'Edit' })}
            </button>
            <button type="button" data-note-delete data-note-soft data-note-danger disabled={saving} onClick={remove} className="h-11 flex-1 rounded-[13px] bg-white/[0.12] text-[15px] font-bold hover:bg-white/[0.18]" style={{ color: '#ff6b7d' }}>
              {t('notes.deleteShort', { defaultValue: 'Delete' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TOOL = 'flex h-11 w-11 items-center justify-center rounded-[13px] border border-white/20 bg-black/25 text-white backdrop-blur-md';

/** Writing a status: big words over the backdrop you pick, Song / GIF / Place down the side. */
function NoteWriter({ me, mine, onClose }: { me: StoryAuthor; mine: Note | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(mine?.text ?? '');
  const [location, setLocation] = useState(mine?.location ?? '');
  const [showPlace, setShowPlace] = useState(!!mine?.location);
  const [gifUrl, setGifUrl] = useState<string | null>(mine?.gifUrl ?? null);
  const [song, setSong] = useState<StorySong | null>(mine?.song ?? null);
  const [background, setBackground] = useState<string>(mine?.background && BACKDROP_KEYS.includes(mine.background as never) ? mine.background : 'photo');
  const [soundOpen, setSoundOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const size = wordSize(text || 'Share a thought');
  // The box grows with the words.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, size]);
  const empty = !text.trim() && !location.trim() && !gifUrl && !song;
  const share = () => {
    if (empty || saving) return;
    setSaving(true);
    putNote({
      ...(text.trim() && { text: text.trim() }),
      ...(location.trim() && { location: location.trim() }),
      ...(gifUrl && { gifUrl }),
      ...(song && { song }),
      ...(background !== 'photo' && { background }),
    } as NoteInput)
      .then(() => { refreshNotes(); toast.success(t('notes.shared', { defaultValue: 'Your status is up for 24 hours' })); onClose(); })
      .catch(() => toast.error(t('notes.failed', { defaultValue: "Your status didn't go up. Try again." })))
      .finally(() => setSaving(false));
  };
  const avatar = buildAvatarUrl(me.address, me.avatarImageUrl, 80);

  return (
    <div data-note-writer className="relative flex h-full w-full flex-col overflow-hidden">
      <Backdrop author={me} background={background} />
      <div className="relative z-10 flex h-full flex-col px-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-[calc(0.625rem+env(safe-area-inset-top))] md:pt-3.5">
        <div className="flex h-10 items-center justify-between">
          <button type="button" data-note-cancel data-note-dim onClick={onClose} className="w-[84px] text-left text-[15px] font-semibold text-white/85">
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <span className="text-[16px] font-bold text-white">{t('notes.newStatus', { defaultValue: 'New status' })}</span>
          <span className="flex w-[84px] justify-end">
            <button type="button" data-note-share data-note-ink disabled={empty || saving} onClick={share} className="flex h-9 min-w-[72px] items-center justify-center rounded-[11px] px-4 text-[14.5px] font-bold disabled:opacity-45" style={{ background: '#fff', color: '#0b0b0c' }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#0b0b0c' }} /> : t('notes.share', { defaultValue: 'Share' })}
            </button>
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <div className="flex w-full max-w-[420px] flex-col items-center gap-3 px-14 text-center">
            {gifUrl && (
              <span className="relative block w-fit">
                <img src={gifUrl} alt="" className="max-h-40 rounded-[16px] object-contain" />
                <button type="button" aria-label={t('notes.removeGif', { defaultValue: 'Remove GIF' })} onClick={() => setGifUrl(null)} className="absolute right-1.5 top-1.5 rounded-[8px] bg-black/60 p-1 text-white"><X className="h-3.5 w-3.5" /></button>
              </span>
            )}
            <textarea
              ref={area}
              data-note-text
              autoFocus
              value={text}
              maxLength={NOTE_TEXT_MAX}
              rows={1}
              onChange={e => setText(e.target.value.replace(/\n/g, ' '))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); share(); } }}
              placeholder={t('notes.placeholder', { defaultValue: 'Share a thought…' })}
              aria-label={t('notes.placeholder', { defaultValue: 'Share a thought…' })}
              style={{ fontSize: size, ['--note-size' as string]: `${size}px`, caretColor: '#fff', textShadow: WORD_SHADOW }}
              className="block w-full resize-none overflow-hidden bg-transparent text-center font-extrabold leading-[1.18] text-white outline-none"
            />
            <span data-note-dim className="text-[12px] tabular-nums text-white/65">{t('notes.charsLeft', { defaultValue: '{{count}} left', count: NOTE_TEXT_MAX - text.length })}</span>
            {song && (
              <span className="flex max-w-full items-center gap-1">
                <span className="min-w-0"><StatusSong song={song} /></span>
                <button type="button" aria-label={t('notes.removeSong', { defaultValue: 'Remove song' })} onClick={() => setSong(null)} className="rounded-[8px] p-1 text-white/80"><X className="h-4 w-4" /></button>
              </span>
            )}
            {showPlace && (
              <span className="flex items-center justify-center gap-1 text-white/85">
                <MapPin className="h-4 w-4 shrink-0" />
                <input
                  data-note-place
                  value={location}
                  maxLength={NOTE_LOCATION_MAX}
                  onChange={e => setLocation(e.target.value)}
                  placeholder={t('notes.placePlaceholder', { defaultValue: 'Where are you?' })}
                  className="w-[150px] bg-transparent text-center text-[14px] font-semibold text-white outline-none"
                />
                <button type="button" aria-label={t('notes.removePlace', { defaultValue: 'Remove place' })} onClick={() => { setLocation(''); setShowPlace(false); }}><X className="h-4 w-4" /></button>
              </span>
            )}
          </div>

          <div data-note-tools className="absolute right-0 top-1/2 flex -translate-y-1/2 flex-col gap-2">
            <button type="button" data-note-add-song aria-label={t('notes.song', { defaultValue: 'Song' })} onClick={() => setSoundOpen(true)} className={TOOL} {...(song ? { 'data-note-ink': '' } : { 'data-note-glass': '' })}>
              <Music2 className="h-5 w-5" />
            </button>
            <EmojiGifPicker
              onEmojiSelect={emoji => setText(v => (v + emoji).slice(0, NOTE_TEXT_MAX))}
              onGifSelect={url => {
                if (isNoteGif(url)) setGifUrl(url);
                else toast.error(t('notes.gifHost', { defaultValue: 'Pick a GIF from the GIF tab for statuses.' }));
              }}
              triggerClassName={`!h-11 !w-11 !rounded-[13px] border border-white/20 !bg-black/25 backdrop-blur-md hover:!bg-black/40`}
            />
            <button type="button" data-note-add-place aria-label={t('notes.place', { defaultValue: 'Place' })} onClick={() => setShowPlace(true)} className={TOOL} {...(showPlace ? { 'data-note-ink': '' } : { 'data-note-glass': '' })}>
              <MapPin className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div data-note-backdrops role="radiogroup" aria-label={t('notes.background', { defaultValue: 'Background' })} className="flex justify-center gap-2.5">
          {BACKDROP_KEYS.map(key => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={background === key}
              aria-label={key === 'photo' ? t('notes.yourPhoto', { defaultValue: 'Your photo' }) : key}
              data-note-backdrop-pick={key}
              onClick={() => setBackground(key)}
              className="h-9 w-9 overflow-hidden rounded-[11px] transition-transform"
              style={{
                background: key === 'photo' ? '#27272a' : BACKDROPS[key],
                boxShadow: background === key ? '0 0 0 2px rgba(0,0,0,.35), 0 0 0 4px #fff' : '0 0 0 1px rgba(255,255,255,.35)',
                transform: background === key ? 'scale(1.06)' : undefined,
              }}
            >
              {key === 'photo' && avatar && <img src={avatar} alt="" className="h-full w-full object-cover" />}
            </button>
          ))}
        </div>
        <p data-note-dim className="mt-2.5 text-center text-[12px] text-white/65">{t('notes.who', { defaultValue: 'People who follow you can see it for 24 hours.' })}</p>
      </div>
      {soundOpen && (
        <SoundPicker
          isOpen={soundOpen}
          onClose={() => setSoundOpen(false)}
          onSelect={sound => { const next = songFrom(sound); if (next) setSong(next); setSoundOpen(false); }}
          clipSeconds={30}
        />
      )}
    </div>
  );
}

// Opened from the + in Messages and from the note button in a chat's tool
// rail. One host (NotesSheetHost, mounted by MessagesPage) draws it.
let sheetOpen = false;
let hosts = 0;
const sheetListeners = new Set<() => void>();
const emitSheet = () => sheetListeners.forEach(l => l());
// A tile in the Messages strip opens the sheet straight onto that note.
let pendingView: NoteEntry | null = null;
export function openNotesSheet(entry?: NoteEntry): void { pendingView = entry ?? null; sheetOpen = true; emitSheet(); }
/** True while a host is mounted, so callers only offer Notes where it can open. */
export function useNotesSheetAvailable(): boolean {
  return useSyncExternalStore(
    useCallback((l: () => void) => { sheetListeners.add(l); return () => { sheetListeners.delete(l); }; }, []),
    () => hosts > 0,
    () => false,
  );
}
function useSheetOpen(): boolean {
  return useSyncExternalStore(
    useCallback((l: () => void) => { sheetListeners.add(l); return () => { sheetListeners.delete(l); }; }, []),
    () => sheetOpen,
    () => false,
  );
}

/**
 * The strip at the top of Messages. It shows only for people who use Notes:
 * your own note, or notes from people you follow. Nobody else sees anything,
 * and Notes still open from the + for them.
 */
export function NotesStrip() {
  const { t } = useTranslation();
  const data = useNotes();
  const mine = data?.mine ?? null;
  const notes = data?.notes ?? [];
  if (!mine && notes.length === 0) return null;
  return (
    <div data-notes-row data-kit-section className="flex gap-1 overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:none]">
      {mine && <NoteTile own author={mine.author} note={mine.note} label={t('notes.yourNote', { defaultValue: 'Your note' })} onClick={() => openNotesSheet()} />}
      {notes.map(entry => (
        <NoteTile key={entry.note.id} author={entry.author} note={entry.note} label={nameOf(entry.author)} onClick={() => openNotesSheet(entry)} />
      ))}
    </div>
  );
}

// ── Status row ───────────────────────────────────────────────────────────
// Statuses (notes) from people you follow sit in one row at the top of Chat,
// under the tabs and above the chat cards: a thought cloud over each
// face, yours first so you can post one.

const CLOUD_STYLE = { background: 'var(--kit-primary-bg)', color: 'var(--kit-primary-ink)', boxShadow: '0 0 0 1px var(--kit-hairline), var(--status-cloud-shadow, 0 4px 14px rgb(0 0 0 / 0.28))' } as const;

function cloudText(note: Note | null): string {
  if (!note) return '';
  if (note.text) return note.text;
  if (note.song) return `🎧 ${note.song.title}`;
  if (note.location) return `📍 ${note.location}`;
  return '';
}

function StatusTile({ author, note, own, label, onClick, onMenu }: {
  author: StoryAuthor; note: Note | null; own?: boolean; label: string; onClick: () => void;
  onMenu: Parameters<typeof activityMenuEvents>[0];
}) {
  const { t } = useTranslation();
  const avatar = buildAvatarUrl(author.address, author.avatarImageUrl, 120);
  const said = useNoteWords(note?.text, own).shown;
  const gif = note?.gifUrl || null;
  const left = useNoteLeft(note);
  const words = gif ? '' : (note?.text ? said : cloudText(note)) || (own ? t('notes.whatsUp', { defaultValue: 'What\u2019s up?' }) : '');
  return (
    <button type="button" onClick={onClick} {...activityMenuEvents(onMenu)} data-status-tile={own ? 'own' : ''} className="flex w-[88px] shrink-0 flex-col items-center text-center">
      <span className="flex min-h-[62px] w-full flex-col items-center justify-end pt-1">
        {words && (
          <>
            <span style={{ ...CLOUD_STYLE, borderRadius: 16 }} className="max-w-[86px] shrink-0 px-2.5 py-[7px]">
              <span className="line-clamp-2 break-words text-[11.5px] font-semibold leading-[1.25]">{words}</span>
            </span>
            <span aria-hidden className="flex w-full shrink-0 flex-col items-start pl-[26px]">
              <span style={{ ...CLOUD_STYLE, borderRadius: 9999 }} className="mt-0.5 h-2 w-2" />
              <span style={{ ...CLOUD_STYLE, borderRadius: 9999 }} className="ml-1.5 mt-px h-1 w-1" />
            </span>
          </>
        )}
      </span>
      <span className="relative mt-0.5 grid h-[68px] w-[68px] place-items-center">
        {gif ? (
          <img data-note-gif-face src={gif} alt="" loading="lazy" style={{ borderRadius: 17 }} className="h-[60px] w-[60px] object-cover" />
        ) : (
          <Avatar style={{ borderRadius: 17 }} className="h-[60px] w-[60px]">
            {avatar && <AvatarImage src={avatar} style={{ borderRadius: 17 }} className="object-cover" />}
            <AvatarFallback style={{ borderRadius: 17 }} className="bg-zinc-700 text-white">{nameOf(author).charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        {note && <NoteRing left={left} size={68} radius={19} />}
        {own && !gif && (
          <span aria-hidden data-keep-dark className="absolute -bottom-1 -right-1 grid h-[22px] w-[22px] place-items-center" style={{ borderRadius: 8, background: '#fff', color: '#0b0b0c', boxShadow: '0 0 0 3px hsl(var(--background)), 0 0 0 1px var(--kit-hairline)' }}>
            <Plus className="h-3.5 w-3.5" strokeWidth={3} style={{ color: '#0b0b0c', stroke: '#0b0b0c' }} />
          </span>
        )}
      </span>
      <span className="mt-1.5 w-full truncate text-[11.5px] font-semibold text-foreground" style={own ? { opacity: 0.6 } : undefined}>{gif ? author.username || nameOf(author) : label}</span>
    </button>
  );
}

/** The Status row at the top of Chat, for signed-in people. */
export function StatusRow({ me }: { me: StoryAuthor | null }) {
  const { t } = useTranslation();
  const data = useNotes();
  const mine = data?.mine ?? null;
  const notes = data?.notes ?? [];
  const self = mine?.author ?? me;
  const { statusesHidden } = useActivityShelfPreferences();
  const { request, open, close } = useActivityMenu();
  const statusScrollCleanup = useRef<(() => void) | null>(null);
  const bindStatusScroll = useCallback((row: HTMLDivElement | null) => {
    statusScrollCleanup.current?.();
    statusScrollCleanup.current = null;
    if (!row?.closest('[data-fullscreen-chat]')) return;
    const scrollSideways = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || event.deltaX || !event.deltaY || !event.cancelable) return;
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? row.clientWidth : 1;
      const before = row.scrollLeft;
      row.scrollBy({ left: event.deltaY * multiplier, behavior: 'instant' });
      if (row.scrollLeft !== before) event.preventDefault();
    };
    row.addEventListener('wheel', scrollSideways, { passive: false });
    statusScrollCleanup.current = () => row.removeEventListener('wheel', scrollSideways);
  }, []);
  if (!self) return null;
  if (statusesHidden) {
    return <button type="button" data-kit-chip data-size="sm" onClick={() => { close(); setActivityBarHidden(false, 'status'); }}>
      <Eye size={16} aria-hidden />{t('notes.showStatusBar', 'Show status bar')}
    </button>;
  }
  return (
    <>
      <div ref={bindStatusScroll} data-status-row {...activityMenuEvents(open)} className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-1 pt-0.5 [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)]">
        <StatusTile own author={self} note={mine?.note ?? null} label={t('notes.yourStatus', { defaultValue: 'Your status' })} onClick={() => openNotesSheet()} onMenu={open} />
        {notes.map(entry => (
          <StatusTile key={entry.note.id} author={entry.author} note={entry.note} label={nameOf(entry.author)} onClick={() => openNotesSheet(entry)}
            onMenu={event => open(event, { kind: 'status', ids: [statusKey(entry)], open: () => openNotesSheet(entry), creator: { address: entry.author.address, name: nameOf(entry.author) } })} />
        ))}
      </div>
      {request !== undefined && <Suspense fallback={null}><StatusMenu request={request} onClose={close} bar="status" onModerated={refreshNotes} /></Suspense>}
    </>
  );
}

// ── Notes in the chat list ───────────────────────────────────────────────
// A person's note rides in their own chat card; notes from members of a
// group ride in that group's card (and atop the open group chat). There is no
// separate strip, so the cards stay one clean stack.

const lower = (a?: string | null) => (a || '').toLowerCase();

/** Notes by author wallet (lower case), from the shared notes store. */
export function useNotesByAuthor(): Map<string, NoteEntry> {
  const data = useNotes();
  const [map, setMap] = useState<Map<string, NoteEntry>>(new Map());
  useEffect(() => {
    setMap(new Map((data?.notes ?? []).map(e => [lower(e.author.address), e])));
  }, [data]);
  return map;
}

/**
 * Which groups each note's author is in, for the groups you can see.
 * One small query: members of these groups who have a note up.
 */
export function useGroupNotes(groupIds: string[], me: string | null): Record<string, NoteEntry[]> {
  const byAuthor = useNotesByAuthor();
  const [out, setOut] = useState<Record<string, NoteEntry[]>>({});
  const key = `${groupIds.slice().sort().join(',')}|${[...byAuthor.keys()].sort().join(',')}`;
  useEffect(() => {
    if (!groupIds.length || !byAuthor.size) { setOut({}); return; }
    let live = true;
    const authors = [...byAuthor.keys()];
    const wallets = [...new Set(authors.flatMap(a => [a, ...[...byAuthor.values()].filter(e => lower(e.author.address) === a).map(e => e.author.address)]))];
    withWalletHeader(
      supabase.from('community_members').select('community_id, wallet_address').in('community_id', groupIds).in('wallet_address', wallets).eq('status', 'active'),
      me,
    ).then(({ data }) => {
      if (!live || !data) return;
      const next: Record<string, NoteEntry[]> = {};
      for (const row of data as { community_id: string; wallet_address: string }[]) {
        const entry = byAuthor.get(lower(row.wallet_address));
        if (!entry) continue;
        const list = (next[row.community_id] ||= []);
        if (!list.includes(entry)) list.push(entry);
      }
      setOut(next);
    }, () => {});
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, me]);
  return out;
}

/** A span that acts as a button, for use inside a chat card (itself a button). */
function cardPress(onPress: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onPress(); },
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPress(); } },
  };
}

/** What a note says in one line: its words, else its song or place. */
function noteLine(note: Note): string {
  return note.text || note.song?.title || note.location || '';
}

/** The note as a small tag at the start of a chat's preview line. */
export function NoteTag({ entry }: { entry: NoteEntry }) {
  const said = useNoteWords(entry.note.text).shown;
  const line = entry.note.text ? stripBold(said) : noteLine(entry.note);
  if (!line && !entry.note.gifUrl) return null;
  return (
    <span
      data-note-tag
      {...cardPress(() => openNotesSheet(entry))}
      style={BUBBLE_STYLE}
      className="mr-1.5 inline-flex h-5 max-w-[60%] items-center gap-1 overflow-hidden rounded-[6px] px-1.5 align-[-3px] text-[12px] font-semibold text-white"
    >
      {!entry.note.text && entry.note.song && <Music2 className="h-3 w-3 shrink-0" />}
      {!entry.note.text && !entry.note.song && entry.note.location && <MapPin className="h-3 w-3 shrink-0" />}
      <span className="truncate">{line || 'GIF'}</span>
    </span>
  );
}

/** The 24h ring around a chat card's face (a 48px rounded square). */
export function NoteFaceRing({ note }: { note: Note }) {
  const left = useNoteLeft(note);
  return <NoteRing left={left} size={58} radius={16} />;
}

/**
 * Notes from members of a group, inside its chat card: the newest one or two
 * as tags, and a Notes button that drops the card down to show them all.
 */
export function GroupCardNotes({ notes }: { notes: NoteEntry[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!notes.length) return null;
  return (
    <span data-group-notes={open ? 'open' : 'closed'} className="mt-2 flex flex-col gap-2">
      <span className="flex min-w-0 items-center gap-2">
        {!open && notes.slice(0, 2).map((e, i) => (
          <span key={e.note.id} className={`min-w-0 items-center gap-1.5 ${i ? 'hidden sm:inline-flex' : 'inline-flex'}`}>
            <img src={buildAvatarUrl(e.author.address, e.author.avatarImageUrl, 40)} alt="" className="h-5 w-5 shrink-0 rounded-[6px] object-cover" />
            <NoteTag entry={e} />
          </span>
        ))}
        {open && <span className="text-[12px] text-zinc-400">{t('notes.inGroup', { defaultValue: 'Notes from this group' })}</span>}
        <span
          data-kit-chip
          data-size="sm"
          data-active={open ? 'true' : undefined}
          data-group-notes-toggle
          aria-expanded={open}
          {...cardPress(() => setOpen(v => !v))}
          className="ml-auto"
        >
          {open ? t('notes.hide', { defaultValue: 'Hide' }) : t('notes.count', { defaultValue: 'Notes {{count}}', count: notes.length })}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </span>
      </span>
      {open && (
        <span data-group-notes-all className="-ml-1 flex flex-wrap gap-x-1 gap-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {notes.map(e => (
            <NoteTile key={e.note.id} inCard author={e.author} note={e.note} label={nameOf(e.author)} onClick={() => openNotesSheet(e)} />
          ))}
        </span>
      )}
    </span>
  );
}

/** Notes from the group's members, in a row across the top of the open group chat. */
export function GroupChatNotesRow({ groupId, me }: { groupId: string; me: string | null }) {
  const notes = useGroupNotes(groupId ? [groupId] : [], me)[groupId] ?? [];
  if (!notes.length) return null;
  return (
    <div data-group-chat-notes className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.07] px-3 pb-2 pt-1 [scrollbar-width:none]">
      {notes.map(e => (
        <NoteTile key={e.note.id} author={e.author} note={e.note} label={nameOf(e.author)} onClick={() => openNotesSheet(e)} />
      ))}
    </div>
  );
}

export function NotesSheetHost({ me, onMessage }: { me?: StoryAuthor | null; onMessage: (author: StoryAuthor, reply?: string) => void }) {
  const { t } = useTranslation();
  const open = useSheetOpen();
  const data = useNotes({ enabled: open, refreshOnStart: true });
  // What opens: someone's statuses (from the one tapped on), your own, or the writer.
  const [viewing, setViewing] = useState<{ entries: NoteEntry[]; start: number } | null>(null);
  const [writing, setWriting] = useState(false);
  useEffect(() => { hosts += 1; emitSheet(); return () => { hosts -= 1; emitSheet(); }; }, []);
  useEffect(() => {
    const tapped = open ? pendingView : null;
    pendingView = null;
    setWriting(false);
    if (!tapped) { setViewing(null); return; }
    // The list is taken once, so a refresh mid-view never moves the page.
    const list = visibleNotes(notesData?.notes ?? [], getActivityShelfPreferences().dismissed);
    const at = list.findIndex(e => e.note.id === tapped.note.id);
    setViewing(at >= 0 ? { entries: list, start: at } : { entries: [tapped], start: 0 });
  }, [open]);
  const close = useCallback(() => { sheetOpen = false; emitSheet(); }, []);
  const mineEntry = data?.mine ?? null;
  const self = mineEntry?.author ?? me ?? null;
  const showMine = !viewing && !writing && !!mineEntry;
  const label = viewing ? nameOf((viewing.entries[viewing.start] ?? viewing.entries[0]).author) : t('notes.title', { defaultValue: 'Status' });

  // Phones: full screen, like a Moment. Desktop: a drawer in the middle
  // column, like the sign-in sheet. Our own gestures page and close it, so the
  // drawer itself only closes from the X, Escape or the backdrop.
  return (
    <Drawer open={open} onOpenChange={v => { if (!v) close(); }} handleOnly repositionInputs={false}>
      <DrawerContent
        column
        hideHandle
        hideClose
        data-keep-dark
        data-note-sheet={viewing ? 'view' : showMine ? 'mine' : 'write'}
        className="mt-0 h-[100dvh] max-h-[100dvh] gap-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white md:h-[min(700px,88dvh)] md:max-h-[88dvh] md:rounded-t-2xl md:border md:border-b-0 md:border-white/10"
        overlayClassName="backdrop-blur-xl md:bg-black/40"
      >
        <DrawerTitle className="sr-only">{label}</DrawerTitle>
        <style>{NOTE_SHEET_CSS}</style>
        {viewing ? (
          <NoteStage
            entries={viewing.entries}
            start={viewing.start}
            onClose={close}
            onSend={(entry, reply) => { close(); onMessage(entry.author, reply); }}
          />
        ) : showMine ? (
          <MyNoteStage entry={mineEntry!} onEdit={() => setWriting(true)} onClose={close} />
        ) : open && self ? (
          <NoteWriter key={mineEntry?.note.id ?? 'new'} me={self} mine={writing ? mineEntry?.note ?? null : null} onClose={close} />
        ) : open ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
