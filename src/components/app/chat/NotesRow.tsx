/**
 * Notes
 * =====
 * A note is a short line with an optional song, GIF or place that stays up for
 * 24 hours. The Notes sheet opens from the + in Messages and from the note
 * button in a chat: write or change yours at the top, and below it see the
 * notes of people you follow (tap one to see it, hear the song, message them).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, MapPin, Music2, Pause, Play, Plus, SendHorizontal, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl } from '@/lib/media-url';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { soundWindow } from '@/lib/sound-window';
import { SoundPicker } from '@/features/post/components/SoundPicker';
import type { AttachedSound } from '@/features/post/hooks/usePostSound';
import { EmojiGifPicker } from './EmojiGifPicker';
import type { StoryAuthor, StorySong } from '@/lib/api/dehub/stories';
import {
  deleteNote, getNotes, isNoteGif, NOTE_LOCATION_MAX, NOTE_TEXT_MAX, putNote,
  type Note, type NoteEntry, type NoteInput,
} from '@/lib/api/dehub/notes';

// A tiny shared store instead of react-query, so the row also renders where
// there is no QueryClientProvider (tests, the state gallery).
type NotesData = { mine: NoteEntry | null; notes: NoteEntry[] };
let notesData: NotesData | null = null;
let notesFetchedAt = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
export function refreshNotes(): void {
  notesFetchedAt = Date.now();
  getNotes().then(d => { notesData = d; emit(); }).catch(() => {});
}
export function useNotes(): NotesData | null {
  const data = useSyncExternalStore(
    useCallback((l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; }, []),
    () => notesData,
    () => null,
  );
  useEffect(() => {
    if (Date.now() - notesFetchedAt > 60_000) refreshNotes();
    const id = setInterval(refreshNotes, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
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
function NoteBubble({ note, placeholder }: { note: Note | null; placeholder?: string }) {
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
      {note.text && <span className="line-clamp-2 break-words text-center">{note.text}</span>}
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
        {showBubble && <NoteBubble note={note && gif ? { ...note, gifUrl: null } : note} placeholder={t('notes.add', { defaultValue: 'Note' })} />}
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

function SongLine({ song, autoPlay, playToken = 0 }: { song: StorySong; autoPlay?: boolean; playToken?: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const audio = ref.current;
    if (!audio || !autoPlay) return;
    audio.currentTime = (song.startMs || 0) / 1000;
    audio.play().then(() => setPlaying(true)).catch(() => {});
    return () => audio.pause();
  }, [autoPlay, song.audioUrl, song.startMs]);
  // A tap on the note's words plays the song (or keeps it playing): a
  // browser can block the autoplay above, and the words are what people tap.
  useEffect(() => {
    const audio = ref.current;
    if (!audio || !playToken || !audio.paused) return;
    if (!audio.currentTime) audio.currentTime = (song.startMs || 0) / 1000;
    audio.play().then(() => setPlaying(true)).catch(() => {});
  }, [playToken, song.startMs]);
  const toggle = () => {
    const audio = ref.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); return; }
    if (!audio.currentTime) audio.currentTime = (song.startMs || 0) / 1000;
    audio.play().then(() => setPlaying(true)).catch(() => {});
  };
  return (
    <button type="button" data-note-song onClick={toggle} className="flex w-full items-center gap-2.5 rounded-[12px] border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-white">
      {song.artworkUrl
        ? <img src={song.artworkUrl} alt="" className="h-9 w-9 rounded-md object-cover" />
        : <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10"><Music2 className="h-4 w-4" /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-white">{song.title}</span>
        {song.artist && <span className="block truncate text-[12px] text-zinc-400">{song.artist}</span>}
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.08] text-white">{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</span>
      <audio ref={ref} src={song.audioUrl} preload="none" onEnded={() => setPlaying(false)} />
    </button>
  );
}

function NoteCard({ note }: { note: Note }) {
  const [playToken, setPlayToken] = useState(0);
  return (
    <div className="flex flex-col gap-2.5">
      {note.gifUrl && <img src={note.gifUrl} alt="" className="max-h-56 w-full rounded-xl object-contain" />}
      {/* The words sit in a chat bubble, like a message. With a song, the
          bubble is a button that plays it. */}
      {note.text && (
        <button
          type="button"
          data-note-text-bubble
          onClick={note.song ? () => setPlayToken(n => n + 1) : undefined}
          disabled={!note.song}
          style={BUBBLE_STYLE}
          className="mx-auto max-w-full break-words rounded-[16px] rounded-bl-[6px] px-4 py-2.5 text-left text-[16px] font-medium text-white disabled:cursor-default"
        >
          {note.text}
        </button>
      )}
      {note.song && <SongLine song={note.song} autoPlay playToken={playToken} />}
      {note.location && (
        <p className="flex items-center justify-center gap-1 text-[13px] text-zinc-400"><MapPin className="h-3.5 w-3.5" />{note.location}</p>
      )}
    </div>
  );
}

function NoteComposer({ mine, onClose }: { mine: Note | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(mine?.text ?? '');
  const [location, setLocation] = useState(mine?.location ?? '');
  const [showPlace, setShowPlace] = useState(!!mine?.location);
  const [gifUrl, setGifUrl] = useState<string | null>(mine?.gifUrl ?? null);
  const [song, setSong] = useState<StorySong | null>(mine?.song ?? null);
  const [soundOpen, setSoundOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const failed = () => toast.error(t('notes.failed', { defaultValue: "Your note didn't go up. Try again." }));
  const run = (work: () => Promise<unknown>, done?: () => void) => {
    if (saving) return;
    setSaving(true);
    work().then(() => { refreshNotes(); done?.(); onClose(); }).catch(failed).finally(() => setSaving(false));
  };
  const empty = !text.trim() && !location.trim() && !gifUrl && !song;
  const share = () => {
    if (empty || saving) return;
    run(() => putNote({
      ...(text.trim() && { text: text.trim() }),
      ...(location.trim() && { location: location.trim() }),
      ...(gifUrl && { gifUrl }),
      ...(song && { song }),
    } as NoteInput), () => toast.success(t('notes.shared', { defaultValue: 'Your note is up for 24 hours' })));
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="relative">
          <textarea
            data-note-text
            autoFocus
            value={text}
            maxLength={NOTE_TEXT_MAX}
            rows={2}
            onChange={e => setText(e.target.value.replace(/\n/g, ' '))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); share(); } }}
            placeholder={t('notes.placeholder', { defaultValue: "Share a thought…" })}
            className="w-full resize-none rounded-[12px] border border-white/10 bg-white/[0.06] px-4 py-3 text-center text-[16px] text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <span className="absolute bottom-1.5 right-3 text-[11px] tabular-nums text-zinc-500">{NOTE_TEXT_MAX - text.length}</span>
        </div>

        {gifUrl && (
          <div className="relative mx-auto">
            <img src={gifUrl} alt="" className="max-h-40 rounded-xl object-contain" />
            <button type="button" aria-label={t('notes.removeGif', { defaultValue: 'Remove GIF' })} onClick={() => setGifUrl(null)} data-keep-dark className="absolute right-1 top-1 rounded-[8px] bg-black/60 p-1 text-white"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {song && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><SongLine song={song} /></div>
            <button type="button" aria-label={t('notes.removeSong', { defaultValue: 'Remove song' })} onClick={() => setSong(null)} className="rounded-[10px] bg-white/[0.06] p-2.5 text-white"><X className="h-4 w-4" /></button>
          </div>
        )}
        {showPlace && (
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3">
            <MapPin className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              data-note-place
              value={location}
              maxLength={NOTE_LOCATION_MAX}
              onChange={e => setLocation(e.target.value)}
              placeholder={t('notes.placePlaceholder', { defaultValue: 'Where are you?' })}
              className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-white placeholder:text-zinc-500 focus:outline-none"
            />
            <button type="button" aria-label={t('notes.removePlace', { defaultValue: 'Remove place' })} onClick={() => { setLocation(''); setShowPlace(false); }}><X className="h-4 w-4 text-zinc-400" /></button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" data-kit-button="quiet" data-note-add-song onClick={() => setSoundOpen(true)}>
            <Music2 className="mr-1 inline h-4 w-4" />{t('notes.song', { defaultValue: 'Song' })}
          </button>
          <EmojiGifPicker
            onEmojiSelect={emoji => setText(v => (v + emoji).slice(0, NOTE_TEXT_MAX))}
            onGifSelect={url => {
              if (isNoteGif(url)) setGifUrl(url);
              else toast.error(t('notes.gifHost', { defaultValue: 'Pick a GIF from the GIF tab for notes.' }));
            }}
            triggerClassName="h-[42px] rounded-[10px] border border-white/10 bg-white/[0.06] px-[1.1rem] text-[14px] font-semibold text-white"
          />
          {!showPlace && (
            <button type="button" data-kit-button="quiet" data-note-add-place onClick={() => setShowPlace(true)}>
              <MapPin className="mr-1 inline h-4 w-4" />{t('notes.place', { defaultValue: 'Place' })}
            </button>
          )}
        </div>

        <p className="text-center text-[12px] text-zinc-500">{t('notes.who', { defaultValue: 'People who follow you can see it for 24 hours.' })}</p>

        <div className="flex gap-2">
          {mine && (
            <button type="button" data-kit-button="quiet" data-note-delete disabled={saving} onClick={() => run(deleteNote)} className="flex-1">
              {t('notes.delete', { defaultValue: 'Delete note' })}
            </button>
          )}
          <button type="button" data-kit-button="primary" data-note-share disabled={empty || saving} onClick={share} className="flex-1">
            {t('notes.share', { defaultValue: 'Share' })}
          </button>
        </div>
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

/** Reply to a note: a message box that sends straight into your chat with them. */
function NoteReply({ note, name, onSend }: { note: Note; name: string; onSend: (text: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const send = () => {
    const reply = text.trim();
    if (!reply) return;
    // The note's words ride along, so the chat shows what was answered.
    onSend(note.text ? `📝 “${note.text}”\n${reply}` : reply);
  };
  return (
    <form data-note-reply className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); send(); }}>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        maxLength={1000}
        placeholder={t('notes.replyTo', { defaultValue: 'Reply to {{name}}…', name })}
        aria-label={t('notes.replyTo', { defaultValue: 'Reply to {{name}}…', name })}
        className="h-[42px] min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.06] px-3.5 text-[15px] text-white outline-none placeholder:text-zinc-500 focus:border-white/30"
      />
      <button type="submit" data-kit-button="primary" disabled={!text.trim()} aria-label={t('notes.send', { defaultValue: 'Send' })} className="!w-[42px] !min-w-0 !p-0">
        <SendHorizontal className="h-[18px] w-[18px]" />
      </button>
    </form>
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
  const line = noteLine(entry.note);
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

export function NotesSheetHost({ onMessage }: { onMessage: (author: StoryAuthor, reply?: string) => void }) {
  const { t } = useTranslation();
  const open = useSheetOpen();
  const data = useNotes();
  const [viewing, setViewing] = useState<NoteEntry | null>(null);
  useEffect(() => { hosts += 1; emitSheet(); return () => { hosts -= 1; emitSheet(); }; }, []);
  useEffect(() => {
    if (open) { refreshNotes(); if (pendingView) setViewing(pendingView); pendingView = null; }
    else setViewing(null);
  }, [open]);
  const close = () => { sheetOpen = false; emitSheet(); };
  const mine = data?.mine?.note ?? null;
  const notes = data?.notes ?? [];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close(); }}>
      <DialogContent data-note-sheet className="max-h-[90dvh] max-w-sm overflow-y-auto border border-white/10 bg-black/60 p-5 text-white shadow-2xl backdrop-blur-[24px]">
        <DialogTitle className="text-center text-[15px]">
          {viewing ? nameOf(viewing.author) : t('notes.title', { defaultValue: 'Notes' })}
        </DialogTitle>
        {viewing ? (
          <div className="flex flex-col gap-4">
            <NoteCard note={viewing.note} />
            <NoteReply key={viewing.note.id} note={viewing.note} name={nameOf(viewing.author)} onSend={reply => { const a = viewing.author; close(); onMessage(a, reply); }} />
            <button type="button" data-kit-button="quiet" data-note-back onClick={() => setViewing(null)}>
              {t('notes.back', { defaultValue: 'Back to notes' })}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {open && <NoteComposer key={mine?.id ?? 'new'} mine={mine} onClose={close} />}
            {notes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] font-medium text-zinc-400">{t('notes.fromFollowing', { defaultValue: 'From people you follow' })}</p>
                <div data-notes-friends className="-mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {notes.map(entry => (
                    <NoteTile key={entry.note.id} author={entry.author} note={entry.note} label={nameOf(entry.author)} onClick={() => setViewing(entry)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
