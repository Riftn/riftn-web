import { useContext, useEffect, useSyncExternalStore } from 'react';
import { AuthContext } from '@/contexts/AuthContext';
import { getStoryRings, type MomentPeek } from '@/lib/api/dehub/stories';
import { useStoriesStore } from '@/store/storiesStore';

/**
 * Who has a Moment up, for the mark on their face in chats and on profiles.
 *
 * Every face on screen asks for its own address; the asks are gathered for a
 * moment and sent as one request (up to 100 at a time), so a chat list of 40
 * people costs one call. Answers are kept for a minute, and dropped for the
 * people just watched when the viewer closes, so the mark turns grey at once.
 */
const FRESH_MS = 60_000;
const BATCH = 100;

type Entry = { peek: MomentPeek | null; at: number };
const cache = new Map<string, Entry>();
const wanted = new Set<string>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let viewerKey: string | null = null;

function emit() {
  listeners.forEach(l => l());
}

async function flush() {
  timer = null;
  const retry: string[] = [];
  const all = [...wanted].filter(a => !inflight.has(a));
  wanted.clear();
  const signedIn = !!viewerKey;
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    batch.forEach(a => inflight.add(a));
    const key = viewerKey;
    try {
      const { rings = {}, peeks = {}, closeFriends = {} } = await getStoryRings(batch, signedIn);
      // Signed in (or out) while this was on its way: ask again as the new
      // viewer, or the mark showed for a second and then never came back.
      if (key !== viewerKey) {
        retry.push(...batch);
        continue;
      }
      const at = Date.now();
      for (const a of batch) {
        const base = peeks[a] ?? (rings[a] ? { state: rings[a], count: 1, cover: null } : null);
        const peek = base && closeFriends[a] ? { ...base, closeFriends: true } : base;
        cache.set(a, { peek, at });
      }
    } catch {
      // Try again in about 15 s rather than on every render.
      const at = Date.now() - FRESH_MS + 15_000;
      for (const a of batch) cache.set(a, { peek: cache.get(a)?.peek ?? null, at });
    } finally {
      batch.forEach(a => inflight.delete(a));
    }
    emit();
  }
  retry.forEach(a => ask(a));
}

function ask(address: string) {
  if (inflight.has(address)) return;
  const entry = cache.get(address);
  if (entry && Date.now() - entry.at < FRESH_MS) return;
  wanted.add(address);
  if (timer === null) timer = setTimeout(() => void flush(), 40);
}

/** Forget these people's marks (or everyone's) so the faces on screen ask again. */
export function refreshMomentPeeks(addresses?: string[]) {
  // Keep the mark on screen while it is asked for again, so it never blinks out.
  const stale = (a: string) => { const e = cache.get(a); if (e) cache.set(a, { peek: e.peek, at: 0 }); };
  if (addresses) addresses.forEach(a => stale(a.toLowerCase()));
  else [...cache.keys()].forEach(stale);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Closing the viewer: the people in it may be watched now.
useStoriesStore.subscribe((state, prev) => {
  if (prev.viewer && !state.viewer) refreshMomentPeeks(prev.viewer.entries.map(e => e.author.address));
  if (prev.pending && !state.pending) refreshMomentPeeks();
});

// Marks older than a minute are asked for again while their faces are on screen.
// The old mark stays up until the answer lands (it used to vanish for a beat).
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (!listeners.size) return;
    const stale = Date.now() - FRESH_MS;
    let changed = false;
    cache.forEach((entry, address) => {
      if (entry.at > 0 && entry.at < stale) { cache.set(address, { peek: entry.peek, at: 0 }); changed = true; }
    });
    if (changed) emit();
  }, FRESH_MS);
}

/** The Moment mark for this person's face, or null when they have none up. */
export function useMomentPeek(address: string | null | undefined): MomentPeek | null {
  // Read straight from the context: some faces render without sign-in at all (the state gallery).
  const auth = useContext(AuthContext);
  const viewer = auth?.isAuthenticated ? auth.walletAddress?.toLowerCase() ?? null : null;
  if (viewer !== viewerKey) {
    viewerKey = viewer;
    cache.clear();
  }
  const key = address ? address.toLowerCase() : null;
  const entry = useSyncExternalStore(subscribe, () => (key ? cache.get(key) : undefined), () => undefined);
  useEffect(() => {
    if (key && key.startsWith('0x')) ask(key);
  }, [key, entry, viewer]);
  return entry?.peek ?? null;
}
