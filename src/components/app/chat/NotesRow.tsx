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
import { MapPin, Music2, Plus, X } from 'lucide-react';
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
function useNotes(): NotesData | null {
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

/** The small speech bubble above an avatar. */
function NoteBubble({ note, placeholder }: { note: Note | null; placeholder?: string }) {
  if (!note) {
    return (
      <span data-note-bubble className="flex max-w-[84px] items-center gap-1 truncate rounded-2xl bg-white/[0.08] px-2 py-1 text-[11px] text-zinc-400">
        <Plus className="h-3 w-3 shrink-0" />{placeholder}
      </span>
    );
  }
  return (
    <span data-note-bubble className="flex max-w-[84px] flex-col items-center gap-0.5 rounded-2xl bg-white/[0.12] px-2 py-1 text-[11px] leading-tight text-white">
      {note.gifUrl && <img src={note.gifUrl} alt="" className="h-8 w-12 rounded-md object-cover" loading="lazy" />}
      {note.text && <span className="line-clamp-2 break-words text-center">{note.text}</span>}
      {!note.text && note.song && <span className="flex max-w-full items-center gap-0.5 truncate"><Music2 className="h-3 w-3 shrink-0" /><span className="truncate">{note.song.title}</span></span>}
      {!note.text && !note.song && note.location && <span className="flex max-w-full items-center gap-0.5 truncate"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{note.location}</span></span>}
    </span>
  );
}

function NoteTile({ author, note, label, own, onClick }: { author: StoryAuthor; note: Note | null; label: string; own?: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const avatar = buildAvatarUrl(author.address, author.avatarImageUrl, 112);
  return (
    <button
      type="button"
      data-note-tile={own ? 'own' : ''}
      onClick={onClick}
      className="relative flex w-[84px] shrink-0 flex-col items-center gap-1 pt-1 text-center"
    >
      <NoteBubble note={note} placeholder={t('notes.add', { defaultValue: 'Note' })} />
      <Avatar className="h-14 w-14">
        {avatar && <AvatarImage src={avatar} />}
        <AvatarFallback className="bg-zinc-700 text-white">{nameOf(author).charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="w-full truncate text-[11px] text-zinc-400">{label}</span>
    </button>
  );
}

function SongLine({ song, autoPlay }: { song: StorySong; autoPlay?: boolean }) {
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
    <button type="button" data-note-song onClick={toggle} className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2 text-left">
      {song.artworkUrl
        ? <img src={song.artworkUrl} alt="" className="h-9 w-9 rounded-md object-cover" />
        : <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10"><Music2 className="h-4 w-4" /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-white">{song.title}</span>
        {song.artist && <span className="block truncate text-[12px] text-zinc-400">{song.artist}</span>}
      </span>
      <span className="text-[12px] text-zinc-400">{playing ? '❚❚' : '▶'}</span>
      <audio ref={ref} src={song.audioUrl} preload="none" onEnded={() => setPlaying(false)} />
    </button>
  );
}

function NoteCard({ note }: { note: Note }) {
  return (
    <div className="flex flex-col gap-2.5">
      {note.gifUrl && <img src={note.gifUrl} alt="" className="max-h-56 w-full rounded-xl object-contain" />}
      {note.text && <p className="break-words text-center text-[17px] font-medium text-white">{note.text}</p>}
      {note.song && <SongLine song={note.song} autoPlay />}
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
            className="w-full resize-none rounded-2xl bg-white/[0.08] px-4 py-3 text-center text-[16px] text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <span className="absolute bottom-1.5 right-3 text-[11px] tabular-nums text-zinc-500">{NOTE_TEXT_MAX - text.length}</span>
        </div>

        {gifUrl && (
          <div className="relative mx-auto">
            <img src={gifUrl} alt="" className="max-h-40 rounded-xl object-contain" />
            <button type="button" aria-label={t('notes.removeGif', { defaultValue: 'Remove GIF' })} onClick={() => setGifUrl(null)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {song && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><SongLine song={song} /></div>
            <button type="button" aria-label={t('notes.removeSong', { defaultValue: 'Remove song' })} onClick={() => setSong(null)} className="rounded-full bg-white/[0.06] p-2"><X className="h-4 w-4" /></button>
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
            triggerClassName="h-9 rounded-full border border-white/10 bg-white/[0.04] px-3 text-zinc-200"
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
export function openNotesSheet(): void { sheetOpen = true; emitSheet(); }
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

export function NotesSheetHost({ onMessage }: { onMessage: (author: StoryAuthor) => void }) {
  const { t } = useTranslation();
  const open = useSheetOpen();
  const data = useNotes();
  const [viewing, setViewing] = useState<NoteEntry | null>(null);
  useEffect(() => { hosts += 1; emitSheet(); return () => { hosts -= 1; emitSheet(); }; }, []);
  useEffect(() => { if (open) refreshNotes(); else setViewing(null); }, [open]);
  const close = () => { sheetOpen = false; emitSheet(); };
  const mine = data?.mine?.note ?? null;
  const notes = data?.notes ?? [];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close(); }}>
      <DialogContent data-note-sheet className="max-h-[90dvh] max-w-sm overflow-y-auto border-white/10 bg-zinc-950/95 p-5">
        <DialogTitle className="text-center text-[15px]">
          {viewing ? nameOf(viewing.author) : t('notes.title', { defaultValue: 'Notes' })}
        </DialogTitle>
        {viewing ? (
          <div className="flex flex-col gap-4">
            <NoteCard note={viewing.note} />
            <button type="button" data-kit-button="primary" data-note-message onClick={() => { const a = viewing.author; close(); onMessage(a); }}>
              {t('notes.message', { defaultValue: 'Message' })}
            </button>
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
