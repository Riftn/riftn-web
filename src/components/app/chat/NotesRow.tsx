/**
 * Notes
 * =====
 * A note is a short line with an optional song, GIF or place that stays up for
 * 24 hours. The Notes sheet opens from the + in Messages and from the note
 * button in a chat. It works like Instagram Notes: a status opens as a short
 * sheet with the person's face big and the white cloud above it; you write
 * yours straight into the cloud over your own face; a heart likes it.
 */
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, Heart, Loader2, MapPin, Music2, Play, Plus, SendHorizontal, X } from 'lucide-react';
import Languages from '@/components/ui/cut-icons/language';
import { supabase } from '@/integrations/supabase/client';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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

// A tiny shared store instead of react-query, so the row also renders where
// there is no QueryClientProvider (tests, the state gallery).
type NotesData = { mine: NoteEntry | null; notes: NoteEntry[] };
let notesData: NotesData | null = null;
let notesFetchedAt = 0;
let activeNotesReaders = 0;
let notesRefreshTimer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
export function refreshNotes(): void {
  notesFetchedAt = Date.now();
  getNotes().then(d => { notesData = d; emit(); }).catch(() => {});
}
export function useNotes({ enabled = true, refreshOnStart = false } = {}): NotesData | null {
  const pageActive = useContext(CachedPageActiveContext);
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
  return data;
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
      {note.text && <span className="line-clamp-2 break-words text-center">{words}</span>}
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

/** Ink inside the white cloud. Kept out of the grey range the light-theme
 *  readability pass repaints, so it stays dark on every theme. */
const CLOUD_INK = '#0b0b0c';
const CLOUD_SOFT = 'rgba(11,11,12,0.55)';

/** "2h", "35m", "now": short, like the chat list. */
function shortSpan(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return '1m';
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

function NoteTimes({ note, own }: { note: Note; own?: boolean }) {
  const { t } = useTranslation();
  const now = Date.now();
  const ago = shortSpan(now - Date.parse(note.postedAt));
  const left = shortSpan(Date.parse(note.expiresAt) - now);
  return (
    <span data-note-times className="text-[12.5px] text-zinc-400">
      {own ? t('notes.upFor', { defaultValue: 'Up {{time}}', time: ago }) : t('notes.postedAgo', { defaultValue: '{{time}} ago', time: ago })}
      {' · '}
      {t('notes.timeLeft', { defaultValue: '{{time}} left', time: left })}
    </span>
  );
}

/** The big cloud with its two trailing dots, over a big squared face. */
function BigCloud({ author, gifFace, children }: { author: StoryAuthor; gifFace?: string | null; children: React.ReactNode }) {
  const avatar = buildAvatarUrl(author.address, author.avatarImageUrl, 200);
  return (
    <div data-note-big className="flex flex-col items-center">
      <div
        data-note-cloud
        style={{ ...CLOUD_STYLE, borderRadius: 22, color: CLOUD_INK }}
        className="w-fit max-w-[264px] px-[18px] py-3 text-center animate-in fade-in zoom-in-90 slide-in-from-bottom-2 duration-300"
      >
        {children}
      </div>
      <span aria-hidden className="flex w-[110px] flex-col items-start pl-[30px]">
        <span style={{ ...CLOUD_STYLE, borderRadius: 9999 }} className="mt-1 h-3 w-3" />
        <span style={{ ...CLOUD_STYLE, borderRadius: 9999 }} className="ml-[9px] mt-[3px] h-1.5 w-1.5" />
      </span>
      {gifFace ? (
        <img src={gifFace} alt="" style={{ borderRadius: 24 }} className="mt-0.5 h-[92px] w-[92px] object-cover" />
      ) : (
        <Avatar style={{ borderRadius: 24 }} className="mt-0.5 h-[92px] w-[92px]">
          {avatar && <AvatarImage src={avatar} style={{ borderRadius: 24 }} className="object-cover" />}
          <AvatarFallback style={{ borderRadius: 24 }} className="bg-zinc-700 text-[28px] text-white">{nameOf(author).charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

/** A song inside the cloud: artwork, title, and bars while it plays. Tap to play or pause. */
function CloudSong({ song, autoPlay }: { song: StorySong; autoPlay?: boolean }) {
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
      style={{ background: 'rgba(11,11,12,0.06)', color: CLOUD_INK }}
      className="mx-auto mt-2 flex max-w-full items-center gap-2 rounded-[10px] py-1 pl-1 pr-2.5 text-left text-[12.5px] font-bold"
    >
      {song.artworkUrl
        ? <img src={song.artworkUrl} alt="" className="h-6 w-6 shrink-0 rounded-[6px] object-cover" />
        : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px]" style={{ background: 'rgba(11,11,12,0.1)' }}><Music2 className="h-3.5 w-3.5" style={{ color: CLOUD_INK }} /></span>}
      <span className="min-w-0 truncate">{song.title}{song.artist ? ` · ${song.artist}` : ''}</span>
      {playing
        ? <span data-note-bars aria-hidden className="flex h-3 shrink-0 items-end gap-[2px]">{[0, 1, 2].map(i => <span key={i} className="w-[2.5px] origin-bottom animate-[note-bar_0.9s_ease-in-out_infinite] rounded-[1px]" style={{ height: 11, background: CLOUD_INK, animationDelay: `${i * 0.15}s` }} />)}</span>
        : <Play className="h-3 w-3 shrink-0" style={{ color: CLOUD_INK, fill: CLOUD_INK }} />}
      <audio ref={ref} src={song.audioUrl} preload="none" onEnded={() => setPlaying(false)} />
      <style>{'@keyframes note-bar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}'}</style>
    </button>
  );
}

/** What goes inside the cloud for a note: GIF, words, song, place. */
function CloudBody({ note, words, autoPlay }: { note: Note; words: string; autoPlay?: boolean }) {
  return (
    <>
      {note.gifUrl && <img src={note.gifUrl} alt="" className="mx-auto mb-1.5 max-h-28 rounded-[12px] object-contain" />}
      {note.text && <span key={words} className="block break-words text-[17px] font-bold leading-[1.3] animate-in fade-in duration-150" style={{ color: CLOUD_INK }}>{words}</span>}
      {note.song && <CloudSong song={note.song} autoPlay={autoPlay} />}
      {note.location && (
        <span className="mt-1.5 flex items-center justify-center gap-1 text-[12.5px] font-semibold" style={{ color: CLOUD_SOFT }}>
          <MapPin className="h-3.5 w-3.5" style={{ color: CLOUD_SOFT }} />{note.location}
        </span>
      )}
    </>
  );
}

/** Someone else's status: big cloud, who and when, reply box and a heart. */
function NoteView({ entry, onSend }: { entry: NoteEntry; onSend: (text: string) => void }) {
  const { t } = useTranslation();
  const { note, author } = entry;
  const words = useNoteWords(note.text);
  const name = nameOf(author);
  const [liked, setLiked] = useState(!!note.liked);
  const [text, setText] = useState('');
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
    <div data-note-view className="flex flex-col items-center">
      <BigCloud author={author} gifFace={null}>
        <CloudBody note={note} words={words.shown} autoPlay />
      </BigCloud>
      <p className="mt-2.5 max-w-full truncate text-[16px] font-extrabold text-white">{name}</p>
      <NoteTimes note={note} />
      {note.text && words.offer && (
        <button
          type="button"
          data-note-translate={words.isTranslated ? 'translated' : 'original'}
          disabled={words.isLoading}
          onClick={words.isTranslated ? words.showOriginal : words.translate}
          className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-zinc-400"
        >
          {words.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
          {words.isLoading
            ? t('stories.translating', { defaultValue: 'Translating…' })
            : words.isTranslated ? t('stories.seeOriginal', { defaultValue: 'See original' }) : t('stories.translate', { defaultValue: 'Translate' })}
        </button>
      )}
      <form data-note-reply className="mt-4 flex w-full items-center gap-2" onSubmit={e => { e.preventDefault(); send(); }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={1000}
          placeholder={t('notes.replyTo', { defaultValue: 'Reply to {{name}}…', name })}
          aria-label={t('notes.replyTo', { defaultValue: 'Reply to {{name}}…', name })}
          className="h-11 min-w-0 flex-1 rounded-[13px] border border-white/10 bg-white/[0.07] px-3.5 text-[15px] text-white outline-none placeholder:text-zinc-500 focus:border-white/30"
        />
        {text.trim() ? (
          <button type="submit" data-kit-button="primary" aria-label={t('notes.send', { defaultValue: 'Send' })} className="!h-11 !w-11 !min-w-0 !p-0 animate-in fade-in zoom-in-90 duration-150">
            <SendHorizontal className="h-[18px] w-[18px]" />
          </button>
        ) : (
          <button
            type="button"
            data-note-like={liked ? 'on' : 'off'}
            aria-pressed={liked}
            aria-label={liked ? t('notes.unlike', { defaultValue: 'Unlike' }) : t('notes.like', { defaultValue: 'Like' })}
            onClick={toggleLike}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] border border-white/10 bg-white/[0.07] text-white"
          >
            <Heart
              key={liked ? 'on' : 'off'}
              className={`h-5 w-5 ${liked ? 'animate-in zoom-in-50 duration-200' : ''}`}
              style={liked ? { color: '#ff3b5c', fill: '#ff3b5c' } : undefined}
            />
          </button>
        )}
      </form>
    </div>
  );
}

/** Your own status: big cloud, how long it has left, who hearted it, edit or delete. */
function MyNoteView({ entry, onEdit, onClose }: { entry: NoteEntry; onEdit: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const likers = entry.likers ?? [];
  const count = Math.max(entry.note.likeCount ?? 0, likers.length);
  const remove = () => {
    if (saving) return;
    setSaving(true);
    deleteNote().then(() => { refreshNotes(); onClose(); })
      .catch(() => toast.error(t('notes.failed', { defaultValue: "Your status didn't go up. Try again." })))
      .finally(() => setSaving(false));
  };
  return (
    <div data-note-mine className="flex flex-col items-center">
      <BigCloud author={entry.author} gifFace={null}>
        <CloudBody note={entry.note} words={entry.note.text ?? ''} />
      </BigCloud>
      <p className="mt-2.5 text-[16px] font-extrabold text-white">{t('notes.yourStatus', { defaultValue: 'Your status' })}</p>
      <NoteTimes note={entry.note} own />
      {count > 0 && (
        <div data-note-likers className="mt-4 flex w-full items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/[0.06] px-3 py-2.5">
          <Heart className="h-5 w-5 shrink-0" style={{ color: '#ff3b5c', fill: '#ff3b5c' }} />
          <span className="flex shrink-0">
            {likers.slice(0, 3).map((a, i) => (
              <img key={a.address} src={buildAvatarUrl(a.address, a.avatarImageUrl, 56)} alt="" className="h-[26px] w-[26px] rounded-[8px] object-cover" style={{ marginLeft: i ? -8 : 0, boxShadow: '0 0 0 2px hsl(var(--background))' }} />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
            {likers.length && count > 1
              ? t('notes.likedByMore', { defaultValue: 'Liked by {{name}} and {{others}} more', name: nameOf(likers[0]), others: formatCount(count - 1) })
              : likers.length
                ? t('notes.likedBy', { defaultValue: 'Liked by {{name}}', name: nameOf(likers[0]) })
                : t('notes.likes', { defaultValue: '{{total}} likes', total: formatCount(count) })}
          </span>
        </div>
      )}
      <div className="mt-3 flex w-full gap-2">
        <button type="button" data-kit-button="quiet" data-note-edit onClick={onEdit} className="flex-1">
          {t('notes.edit', { defaultValue: 'Edit' })}
        </button>
        <button type="button" data-kit-button="quiet" data-note-delete disabled={saving} onClick={remove} className="flex-1 !text-[#ff5a6e]">
          {t('notes.deleteShort', { defaultValue: 'Delete' })}
        </button>
      </div>
    </div>
  );
}

function NoteComposer({ me, mine, onClose }: { me: StoryAuthor; mine: Note | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(mine?.text ?? '');
  const [location, setLocation] = useState(mine?.location ?? '');
  const [showPlace, setShowPlace] = useState(!!mine?.location);
  const [gifUrl, setGifUrl] = useState<string | null>(mine?.gifUrl ?? null);
  const [song, setSong] = useState<StorySong | null>(mine?.song ?? null);
  const [soundOpen, setSoundOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // The cloud grows with the words, like the one in the row.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  const empty = !text.trim() && !location.trim() && !gifUrl && !song;
  const share = () => {
    if (empty || saving) return;
    setSaving(true);
    putNote({
      ...(text.trim() && { text: text.trim() }),
      ...(location.trim() && { location: location.trim() }),
      ...(gifUrl && { gifUrl }),
      ...(song && { song }),
    } as NoteInput)
      .then(() => { refreshNotes(); toast.success(t('notes.shared', { defaultValue: 'Your status is up for 24 hours' })); onClose(); })
      .catch(() => toast.error(t('notes.failed', { defaultValue: "Your status didn't go up. Try again." })))
      .finally(() => setSaving(false));
  };

  return (
    <>
      <div data-note-composer className="flex flex-col items-center">
        <div className="mb-3 flex h-9 w-full items-center justify-between">
          <button type="button" data-note-cancel onClick={onClose} className="w-[76px] text-left text-[14px] font-semibold text-zinc-400">
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <span className="text-[15px] font-bold text-white">{t('notes.newStatus', { defaultValue: 'New status' })}</span>
          <span className="flex w-[76px] justify-end">
            <button type="button" data-kit-button="primary" data-size="sm" data-note-share disabled={empty || saving} onClick={share} className="!h-[34px] !px-3.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('notes.share', { defaultValue: 'Share' })}
            </button>
          </span>
        </div>

        <BigCloud author={me}>
          {gifUrl && (
            <span className="relative mx-auto mb-1.5 block w-fit">
              <img src={gifUrl} alt="" className="max-h-28 rounded-[12px] object-contain" />
              <button type="button" aria-label={t('notes.removeGif', { defaultValue: 'Remove GIF' })} onClick={() => setGifUrl(null)} data-keep-dark className="absolute right-1 top-1 rounded-[8px] bg-black/60 p-1 text-white"><X className="h-3.5 w-3.5" /></button>
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
            style={{ color: CLOUD_INK, caretColor: CLOUD_INK, width: Math.min(228, Math.max(120, (text.length || 16) * 9.6)) }}
            className="block resize-none overflow-hidden bg-transparent text-center text-[17px] font-bold leading-[1.3] outline-none"
          />
          {/* Theme passes repaint placeholders; this one sits on white in every theme. */}
          <style>{'html body [data-note-cloud]:not(#_):not(#_):not(#_) :is(textarea,input)::placeholder{color:rgba(11,11,12,.4)!important;-webkit-text-fill-color:rgba(11,11,12,.4)!important;opacity:1}'}</style>
          {song && (
            <span className="relative mx-auto mt-2 flex w-fit items-center gap-1">
              <span className="min-w-0"><CloudSong song={song} /></span>
              <button type="button" aria-label={t('notes.removeSong', { defaultValue: 'Remove song' })} onClick={() => setSong(null)} className="mt-2 rounded-[8px] p-1"><X className="h-3.5 w-3.5" style={{ color: CLOUD_SOFT }} /></button>
            </span>
          )}
          {showPlace && (
            <span className="mt-1.5 flex items-center justify-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: CLOUD_SOFT }} />
              <input
                data-note-place
                value={location}
                maxLength={NOTE_LOCATION_MAX}
                onChange={e => setLocation(e.target.value)}
                placeholder={t('notes.placePlaceholder', { defaultValue: 'Where are you?' })}
                style={{ color: CLOUD_SOFT }}
                className="w-[130px] bg-transparent text-center text-[12.5px] font-semibold outline-none"
              />
              <button type="button" aria-label={t('notes.removePlace', { defaultValue: 'Remove place' })} onClick={() => { setLocation(''); setShowPlace(false); }}><X className="h-3.5 w-3.5" style={{ color: CLOUD_SOFT }} /></button>
            </span>
          )}
        </BigCloud>

        <p className="mt-2 text-[11.5px] tabular-nums text-zinc-500">{t('notes.charsLeft', { defaultValue: '{{count}} left', count: NOTE_TEXT_MAX - text.length })}</p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          <button type="button" data-kit-chip data-active={song ? 'true' : undefined} data-note-add-song onClick={() => setSoundOpen(true)}>
            <Music2 className="h-4 w-4" />{t('notes.song', { defaultValue: 'Song' })}
          </button>
          <EmojiGifPicker
            onEmojiSelect={emoji => setText(v => (v + emoji).slice(0, NOTE_TEXT_MAX))}
            onGifSelect={url => {
              if (isNoteGif(url)) setGifUrl(url);
              else toast.error(t('notes.gifHost', { defaultValue: 'Pick a GIF from the GIF tab for statuses.' }));
            }}
            triggerClassName="!h-[34px] !w-auto rounded-[11px] border border-white/10 bg-white/[0.07] px-3 text-[13px] font-semibold text-white"
          />
          <button type="button" data-kit-chip data-active={showPlace ? 'true' : undefined} data-note-add-place onClick={() => setShowPlace(true)}>
            <MapPin className="h-4 w-4" />{t('notes.place', { defaultValue: 'Place' })}
          </button>
        </div>

        <p className="mt-3 text-center text-[12px] text-zinc-500">{t('notes.who', { defaultValue: 'People who follow you can see it for 24 hours.' })}</p>
      </div>
      {soundOpen && (
        <SoundPicker
          isOpen={soundOpen}
          onClose={() => setSoundOpen(false)}
          onSelect={sound => { const next = songFrom(sound); if (next) setSong(next); setSoundOpen(false); }}
          clipSeconds={30}
        />
      )}
    </>
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
// under the tabs and above the chat cards: a white thought cloud over each
// face, yours first so you can post one.

const CLOUD_STYLE = { background: '#fff', color: '#0b0b0c', boxShadow: '0 0 0 1px var(--kit-hairline), var(--status-cloud-shadow, 0 4px 14px rgb(0 0 0 / 0.28))' } as const;

function cloudText(note: Note | null): string {
  if (!note) return '';
  if (note.text) return note.text;
  if (note.song) return `🎧 ${note.song.title}`;
  if (note.location) return `📍 ${note.location}`;
  return note.gifUrl ? 'GIF' : '';
}

function StatusTile({ author, note, own, label, onClick }: { author: StoryAuthor; note: Note | null; own?: boolean; label: string; onClick: () => void }) {
  const { t } = useTranslation();
  const avatar = buildAvatarUrl(author.address, author.avatarImageUrl, 120);
  const said = useNoteWords(note?.text, own).shown;
  const words = (note?.text ? said : cloudText(note)) || (own ? t('notes.whatsUp', { defaultValue: 'What\u2019s up?' }) : '');
  const gif = note?.gifUrl || null;
  return (
    <button type="button" onClick={onClick} data-status-tile={own ? 'own' : ''} className="flex w-[88px] shrink-0 flex-col items-center text-center">
      <span className="flex min-h-[62px] w-full flex-col items-center justify-end pt-1">
        {words && (
          <>
            <span style={{ ...CLOUD_STYLE, borderRadius: 16 }} className="max-w-[86px] shrink-0 px-2.5 py-[7px]">
              <span className="line-clamp-2 break-words text-[11.5px] font-semibold leading-[1.25]" style={{ color: own && !note ? '#71717a' : '#0b0b0c' }}>{words}</span>
            </span>
            <span aria-hidden className="flex w-full shrink-0 flex-col items-start pl-[26px]">
              <span style={{ ...CLOUD_STYLE, borderRadius: 9999 }} className="mt-0.5 h-2 w-2" />
              <span style={{ ...CLOUD_STYLE, borderRadius: 9999 }} className="ml-1.5 mt-px h-1 w-1" />
            </span>
          </>
        )}
      </span>
      <span className="relative mt-0.5 block">
        {gif ? (
          <img src={gif} alt="" loading="lazy" style={{ borderRadius: 17 }} className="h-[60px] w-[60px] object-cover" />
        ) : (
          <Avatar style={{ borderRadius: 17 }} className="h-[60px] w-[60px]">
            {avatar && <AvatarImage src={avatar} style={{ borderRadius: 17 }} className="object-cover" />}
            <AvatarFallback style={{ borderRadius: 17 }} className="bg-zinc-700 text-white">{nameOf(author).charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        {own && (
          <span aria-hidden data-keep-dark className="absolute -bottom-1 -right-1 grid h-[22px] w-[22px] place-items-center" style={{ borderRadius: 8, background: '#fff', color: '#0b0b0c', boxShadow: '0 0 0 3px hsl(var(--background)), 0 0 0 1px var(--kit-hairline)' }}>
            <Plus className="h-3.5 w-3.5" strokeWidth={3} style={{ color: '#0b0b0c', stroke: '#0b0b0c' }} />
          </span>
        )}
      </span>
      <span className="mt-1.5 w-full truncate text-[11.5px] font-semibold text-foreground" style={own ? { opacity: 0.6 } : undefined}>{label}</span>
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
  return (
    <div ref={bindStatusScroll} data-status-row className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)]">
      <StatusTile own author={self} note={mine?.note ?? null} label={t('notes.yourStatus', { defaultValue: 'Your status' })} onClick={() => openNotesSheet()} />
      {notes.map(entry => (
        <StatusTile key={entry.note.id} author={entry.author} note={entry.note} label={nameOf(entry.author)} onClick={() => openNotesSheet(entry)} />
      ))}
    </div>
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
  const line = entry.note.text ? said : noteLine(entry.note);
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
  // What the sheet shows: someone's status, your own, or the writer.
  const [viewing, setViewing] = useState<NoteEntry | null>(null);
  const [writing, setWriting] = useState(false);
  useEffect(() => { hosts += 1; emitSheet(); return () => { hosts -= 1; emitSheet(); }; }, []);
  useEffect(() => {
    if (open) { setViewing(pendingView); setWriting(false); pendingView = null; }
    else { setViewing(null); setWriting(false); }
  }, [open]);
  const close = () => { sheetOpen = false; emitSheet(); };
  const mineEntry = data?.mine ?? null;
  const self = mineEntry?.author ?? me ?? null;
  const showMine = !viewing && !writing && !!mineEntry;
  const label = viewing ? nameOf(viewing.author) : t('notes.title', { defaultValue: 'Status' });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close(); }}>
      <DialogContent
        data-note-sheet={viewing ? 'view' : showMine ? 'mine' : 'write'}
        hideCloseButton={!viewing && !showMine}
        className="max-h-[90dvh] max-w-sm gap-3 overflow-y-auto border border-white/10 bg-black/60 px-4 pb-6 pt-3 text-white shadow-2xl backdrop-blur-[28px] sm:p-5"
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {viewing ? (
          <NoteView
            key={viewing.note.id}
            entry={viewing}
            onSend={reply => { const a = viewing.author; close(); onMessage(a, reply); }}
          />
        ) : showMine ? (
          <MyNoteView entry={mineEntry!} onEdit={() => setWriting(true)} onClose={close} />
        ) : open && self ? (
          <NoteComposer key={mineEntry?.note.id ?? 'new'} me={self} mine={writing ? mineEntry?.note ?? null : null} onClose={close} />
        ) : open ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
