import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import ArrowLeft from '@/components/ui/cut-icons/back';
import Search from '@/components/ui/cut-icons/search';
import X from '@/components/ui/cut-icons/close';
import ListIcon from '@/components/ui/cut-icons/menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AppState } from '@/components/app/AppState';
import { buildAvatarUrl } from '@/lib/media-url';
import { searchLiveChat, type LiveChatMessage, type LiveChatSearchPerson } from '@/lib/api/dehub';

/*
 * Search inside one chat room, in one box.
 *
 * Type a word and the room's whole history is searched. Type a name and the
 * people who match come first; picking one turns them into a tag in the box,
 * lists everything they said, and typing on searches inside that. A result
 * opens the chat on that line, and a small pill steps through the rest.
 */

export interface ChatSearchPerson {
  address: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  messageCount?: number;
}

export const personFromApi = (p: LiveChatSearchPerson): ChatSearchPerson => ({
  address: p.address,
  name: p.displayName || p.username || `${p.address.slice(0, 6)}…`,
  username: p.username,
  avatarUrl: p.avatarUrl,
  messageCount: p.messageCount,
});

const RECENT_KEY = 'riftn.chat.search.recent';
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Remember a search that led somewhere, newest first. */
export function rememberChatSearch(text: string) {
  const q = text.trim();
  if (q.length < 2) return;
  try {
    const next = [q, ...readRecent().filter((v) => v.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private windows: the search still works, it is just not remembered.
  }
}

interface SearchState {
  results: LiveChatMessage[];
  people: ChatSearchPerson[];
  total: number | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  failed: boolean;
}

const EMPTY: SearchState = { results: [], people: [], total: null, hasMore: false, loading: false, loadingMore: false, failed: false };

/** The room's matches for what is in the box, re-read as it changes. */
export function useChatSearch(roomId: string | null, enabled: boolean, text: string, from: string | null) {
  const [state, setState] = useState<SearchState>(EMPTY);
  const run = useRef(0);
  const q = text.trim();

  useEffect(() => {
    if (!enabled || !roomId) {
      run.current += 1;
      setState(EMPTY);
      return;
    }
    const mine = ++run.current;
    setState((s) => ({ ...s, loading: true, failed: false }));
    // Typing waits a beat; opening the box or picking a person does not.
    const timer = window.setTimeout(async () => {
      try {
        const page = await searchLiveChat(roomId, { q, from: from ?? undefined });
        if (run.current !== mine) return;
        setState({
          results: page.messages,
          people: page.people.map(personFromApi),
          total: page.total,
          hasMore: page.hasMore,
          loading: false,
          loadingMore: false,
          failed: false,
        });
      } catch {
        if (run.current === mine) setState({ ...EMPTY, failed: true });
      }
    }, q ? 260 : 0);
    return () => window.clearTimeout(timer);
  }, [enabled, roomId, q, from]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const loadMore = useCallback(async (): Promise<LiveChatMessage[]> => {
    const now = stateRef.current;
    const last = now.results[now.results.length - 1];
    if (!roomId || !last || !now.hasMore || now.loadingMore) return [];
    const mine = run.current;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const page = await searchLiveChat(roomId, { q, from: from ?? undefined, before: last.id });
      if (run.current !== mine) return [];
      setState((s) => ({ ...s, results: [...s.results, ...page.messages], hasMore: page.hasMore, loadingMore: false }));
      return page.messages;
    } catch {
      if (run.current === mine) setState((s) => ({ ...s, loadingMore: false }));
      return [];
    }
  }, [roomId, q, from]);

  return { ...state, loadMore };
}

/** The typed words picked out wherever they appear in a line. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let at = 0;
  for (let hit = lower.indexOf(needle); hit !== -1; hit = lower.indexOf(needle, at)) {
    if (hit > at) parts.push(text.slice(at, hit));
    parts.push(<mark key={hit} data-chat-search-mark className="rounded-[4px] bg-amber-300 px-0.5 text-black">{text.slice(hit, hit + q.length)}</mark>);
    at = hit + q.length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function Face({ person, className = 'h-8 w-8' }: { person: Pick<ChatSearchPerson, 'address' | 'name' | 'avatarUrl'>; className?: string }) {
  return (
    <Avatar className={`${className} flex-shrink-0 rounded-lg`}>
      <AvatarImage src={buildAvatarUrl(person.address, person.avatarUrl) || undefined} className="rounded-lg object-cover" />
      <AvatarFallback className="rounded-lg bg-zinc-700 text-xs font-semibold text-white">{person.name.slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

const shortDate = (iso: string) => {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ── The box ─────────────────────────────────────────────────────────── */

interface ChatSearchBarProps {
  inputRef: RefObject<HTMLInputElement>;
  text: string;
  person: ChatSearchPerson | null;
  onText: (text: string) => void;
  onClearPerson: () => void;
  onFocusList: () => void;
  onClose: () => void;
}

export function ChatSearchBar({ inputRef, text, person, onText, onClearPerson, onFocusList, onClose }: ChatSearchBarProps) {
  const { t: _copy } = _useCopy();
  const firstName = person?.name.split(' ')[0] ?? '';
  return (
    <div data-chat-header data-chat-search-bar className="flex items-center gap-2 border-b border-white/[0.07] p-4">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 text-zinc-400 hover:text-white"
        onClick={onClose}
        aria-label={_copy('chatSearch.close', { defaultValue: 'Close search' })}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-white/[0.09] bg-zinc-800/60 py-1 pl-1.5 pr-2">
        {person ? (
          <button
            type="button"
            data-chat-search-tag
            onClick={onClearPerson}
            aria-label={_copy('chatSearch.removePerson', { defaultValue: 'Search everyone' })}
            className="flex max-w-[45%] flex-shrink-0 items-center gap-1.5 rounded-full bg-white py-0.5 pl-0.5 pr-2 text-xs font-semibold text-black"
          >
            <Face person={person} className="h-5 w-5" />
            <span className="truncate">{firstName}</span>
            <X className="h-3 w-3 flex-shrink-0" />
          </button>
        ) : (
          <Search className="ml-1.5 h-4 w-4 flex-shrink-0 text-zinc-500" />
        )}
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onFocus={onFocusList}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            // An empty box and Backspace lifts the person tag, like any tag field.
            if (e.key === 'Backspace' && !text && person) onClearPerson();
          }}
          placeholder={person
            ? _copy('chatSearch.placeholderPerson', { defaultValue: "Search {{name}}'s messages", name: firstName })
            : _copy('chatSearch.placeholder', { defaultValue: 'Search messages or people' })}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
        />
        {text ? (
          <button
            type="button"
            onClick={() => { onText(''); inputRef.current?.focus(); }}
            aria-label={_copy('chatSearch.clear', { defaultValue: 'Clear' })}
            className="flex-shrink-0 text-zinc-500 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ── What the box found ──────────────────────────────────────────────── */

interface ChatSearchPanelProps {
  text: string;
  person: ChatSearchPerson | null;
  search: ReturnType<typeof useChatSearch>;
  signedIn: boolean;
  activeId: string | null;
  onSignIn: () => void;
  onPickPerson: (person: ChatSearchPerson) => void;
  onPickText: (text: string) => void;
  onOpenResult: (index: number) => void;
}

function SectionLabel({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      <span>{children}</span>
      {count != null ? <span>{count}</span> : null}
    </div>
  );
}

export function ChatSearchPanel({ text, person, search, signedIn, activeId, onSignIn, onPickPerson, onPickText, onOpenResult }: ChatSearchPanelProps) {
  const { t: _copy } = _useCopy();
  const q = text.trim();
  const [recent] = useState(readRecent);
  const idle = !q && !person;

  if (!signedIn) {
    return (
      <div data-chat-search-panel className="absolute inset-0 overflow-y-auto">
        <div className="mx-4 my-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-4 text-center">
          <p className="text-sm font-semibold text-white">{_copy('chatSearch.signInTitle', { defaultValue: 'Sign in to search the chat' })}</p>
          <p className="mt-1 text-xs text-zinc-400">{_copy("copy.674e70bcd915", { defaultValue: "The full chat history is open to everyone with an account." })}</p>
          <Button size="sm" className="mt-3 rounded-full px-5" onClick={onSignIn}>
            {_copy("copy.bfd402b2f6f3", { defaultValue: "Sign in" })}
          </Button>
        </div>
      </div>
    );
  }

  const messageLabel = (m: LiveChatMessage) => {
    if (m.content?.trim()) return <Highlight text={m.content} query={q} />;
    const kind = m.messageType || m.type;
    if (kind === 'gif') return 'GIF';
    if (kind === 'audio') return _copy('chatSearch.voice', { defaultValue: 'Voice message' });
    return _copy('chatSearch.photo', { defaultValue: 'Photo' });
  };

  const waiting = search.loading && !search.results.length && !search.people.length;
  const nothing = !search.loading && !idle && !search.results.length && !(search.people.length && !person);

  return (
    <div
      data-chat-search-panel
      className="absolute inset-0 overflow-y-auto pb-4"
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.scrollHeight - el.clientHeight - el.scrollTop < 320) void search.loadMore();
      }}
    >
      {idle ? (
        <>
          {search.people.length ? (
            <>
              <SectionLabel>{_copy('chatSearch.peopleHere', { defaultValue: 'People in this chat' })}</SectionLabel>
              <div data-chat-search-faces className="flex gap-1 overflow-x-auto px-3 pb-1">
                {search.people.map((p) => (
                  <button
                    key={p.address}
                    type="button"
                    onClick={() => onPickPerson(p)}
                    className="flex w-16 flex-shrink-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2 hover:bg-white/[0.05]"
                  >
                    <Face person={p} className="h-11 w-11" />
                    <span className="w-full truncate text-center text-[11px] text-zinc-300">{p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : waiting ? (
            <div className="flex gap-3 px-4 pt-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-11 rounded-lg bg-zinc-800" />)}
            </div>
          ) : null}
          {recent.length ? (
            <>
              <SectionLabel>{_copy('chatSearch.recent', { defaultValue: 'Recent searches' })}</SectionLabel>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onPickText(r)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.05]"
                >
                  <Search className="h-4 w-4 flex-shrink-0 text-zinc-500" />
                  <span className="truncate">{r}</span>
                </button>
              ))}
            </>
          ) : null}
          {!search.people.length && !recent.length && !waiting ? (
            <p className="px-6 pt-10 text-center text-sm text-zinc-500">{_copy('chatSearch.hint', { defaultValue: 'Type a word or a name.' })}</p>
          ) : null}
        </>
      ) : waiting ? (
        [...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-2.5">
            <Skeleton className="h-8 w-8 flex-shrink-0 rounded-lg bg-zinc-800" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24 bg-zinc-800" />
              <Skeleton className="h-4 w-48 bg-zinc-800" />
            </div>
          </div>
        ))
      ) : search.failed ? (
        <AppState icon="search" title={_copy('chatSearch.failed', { defaultValue: 'Search could not load' })} description={_copy("copy.2e6d79de50dc", { defaultValue: "Try a different search." })} kind="error" size="compact" className="h-full" />
      ) : nothing ? (
        <AppState icon="search" title={_copy('publicChat.noResults', { defaultValue: 'No messages found' })} description={_copy("copy.2e6d79de50dc", { defaultValue: "Try a different search." })} kind="search-empty" size="compact" className="h-full" />
      ) : (
        <>
          {!person && search.people.length ? (
            <>
              <SectionLabel>{_copy('chatSearch.people', { defaultValue: 'People' })}</SectionLabel>
              {search.people.map((p) => (
                <button
                  key={p.address}
                  type="button"
                  data-chat-search-person
                  onClick={() => onPickPerson(p)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-white/[0.05]"
                >
                  <Face person={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white"><Highlight text={p.name} query={q.replace(/^@+/, '')} /></span>
                    <span className="block truncate text-xs text-zinc-400">
                      {_copy('chatSearch.seeCount', { defaultValue: 'See their {{count}} messages', count: p.messageCount ?? 0 })}
                    </span>
                  </span>
                </button>
              ))}
            </>
          ) : null}
          {search.results.length ? (
            <>
              <SectionLabel count={!person && search.people.length && search.total != null ? search.total : undefined}>
                {person || !search.people.length
                  ? (q
                    ? _copy('chatSearch.results', { defaultValue: '{{count}} results', count: search.total ?? search.results.length })
                    : _copy('chatSearch.messagesCount', { defaultValue: '{{count}} messages', count: search.total ?? search.results.length }))
                  : _copy('chatSearch.messages', { defaultValue: 'Messages' })}
              </SectionLabel>
              {search.results.map((m, index) => {
                const who = { address: m.sender.address, name: m.sender.displayName || m.sender.username || m.sender.address.slice(0, 8), avatarUrl: m.sender.avatarUrl || m.sender.avatarImageUrl };
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-chat-search-result
                    onClick={() => onOpenResult(index)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-white/[0.05] ${activeId === m.id ? 'bg-white/[0.07]' : ''}`}
                  >
                    <Face person={who} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-white">{who.name}</span>
                        <span className="flex-shrink-0 text-[11px] text-zinc-500">{shortDate(m.createdAt)}</span>
                      </span>
                      <span className="block truncate text-sm text-zinc-300">{messageLabel(m)}</span>
                    </span>
                  </button>
                );
              })}
              {search.loadingMore ? (
                <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-zinc-400" /></div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ── Stepping through results once the chat is on one ────────────────── */

interface ChatSearchPillProps {
  position: number;
  total: number;
  busy: boolean;
  canOlder: boolean;
  canNewer: boolean;
  onList: () => void;
  onOlder: () => void;
  onNewer: () => void;
}

export function ChatSearchPill({ position, total, busy, canOlder, canNewer, onList, onOlder, onNewer }: ChatSearchPillProps) {
  const { t: _copy } = _useCopy();
  const step = 'flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 disabled:opacity-35';
  return (
    <div data-chat-search-pill className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-white py-1 pl-1 pr-1 text-black shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <button type="button" onClick={onList} className={step} aria-label={_copy('chatSearch.backToResults', { defaultValue: 'Back to results' })}>
          <ListIcon className="h-4 w-4" />
        </button>
        <span className="min-w-[4.5rem] px-1 text-center text-xs font-semibold tabular-nums">
          {busy
            ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
            : _copy('chatSearch.position', { defaultValue: '{{current}} of {{total}}', current: position, total })}
        </span>
        <button type="button" onClick={onOlder} disabled={!canOlder || busy} className={step} aria-label={_copy('chatSearch.older', { defaultValue: 'Older result' })}>
          <ChevronUp className="h-4 w-4" />
        </button>
        <button type="button" onClick={onNewer} disabled={!canNewer || busy} className={step} aria-label={_copy('chatSearch.newer', { defaultValue: 'Newer result' })}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
