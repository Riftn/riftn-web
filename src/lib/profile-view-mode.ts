/** All, Images and Videos share one grid/list choice per reader and profile.
 * The owner's public default and the reader's account preferences apply until
 * the reader picks a layout for this profile on this device.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

export type ProfileViewMode = 'grid' | 'list';

/** Key in the account's `customs` blob. Absent means grid. */
export const PROFILE_VIEW_DEFAULT_KEY = 'defaultProfileView';

export function parseProfileViewDefault(raw: unknown): ProfileViewMode {
  return raw === 'list' ? 'list' : 'grid';
}

/**
 * How the reader wants every profile they open to start: each owner's own
 * choice (default), or always grid, or always list. Saved in the reader's own
 * `customs.profileViewOthers`, so it follows them across web and app.
 */
export type ProfileViewReaderPref = 'owner' | ProfileViewMode;
export const PROFILE_VIEW_READER_KEY = 'profileViewOthers';

export function parseProfileViewReaderPref(raw: unknown): ProfileViewReaderPref {
  return raw === 'grid' || raw === 'list' ? raw : 'owner';
}

/** The view a profile opens in for this reader. Your own profile always uses your own default. */
export function startingProfileView(ownerDefault: ProfileViewMode, readerPref: ProfileViewReaderPref, isOwnProfile: boolean): ProfileViewMode {
  return isOwnProfile || readerPref === 'owner' ? ownerDefault : readerPref;
}

const listeners = new Set<() => void>();
const memory = new Map<string, ProfileViewMode>();

function preferenceKey(profile: string | null | undefined, reader?: string | null) {
  return profile ? `riftn.profileView.${reader?.toLowerCase() || 'guest'}.${profile.toLowerCase()}` : '';
}

function notify() {
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener('storage', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
}

function readMode(key: string): ProfileViewMode | undefined {
  if (memory.has(key)) return memory.get(key);
  if (key) {
    try {
      const value = window.localStorage.getItem(key);
      if (value === 'list' || value === 'grid') return value;
    } catch { /* fall back to memory when storage is unavailable */ }
  }
  return undefined;
}

function writeMode(key: string, mode?: ProfileViewMode) {
  let stored = false;
  if (mode) memory.set(key, mode);
  else memory.delete(key);
  if (key) {
    try {
      if (mode) window.localStorage.setItem(key, mode);
      else window.localStorage.removeItem(key);
      memory.delete(key);
      stored = true;
    } catch { /* keep the selection for this session */ }
  }
  notify();
  return stored;
}

// Older builds kept a profile-only map for the current browser tab. Claim a
// choice once when that profile opens, so it cannot leak to another reader.
function migrateLegacyMode(profile: string, destination?: string) {
  try {
    const key = 'riftn.profileViewFlips';
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return;
    const entries = JSON.parse(raw);
    const id = profile.toLowerCase();
    const mode = entries?.[id];
    if (mode !== 'grid' && mode !== 'list') return;
    if (destination) {
      const current = window.localStorage.getItem(destination);
      if (current !== 'grid' && current !== 'list' && !writeMode(destination, memory.get(destination) ?? mode)) return;
    }
    delete entries[id];
    if (Object.keys(entries).length) window.sessionStorage.setItem(key, JSON.stringify(entries));
    else window.sessionStorage.removeItem(key);
  } catch { /* session storage may be unavailable */ }
}

/** An explicit change to the owner's layout in Settings supersedes the toolbar choice. */
export function clearProfileViewFlip(profileKey: string | null | undefined): void {
  if (!profileKey) return;
  migrateLegacyMode(profileKey);
  writeMode(preferenceKey(profileKey, profileKey));
}

export interface ProfileViewModeState {
  mode: ProfileViewMode;
  setMode: (mode: ProfileViewMode) => void;
}

export function useProfileViewState(profile: string | null | undefined, ownerDefault: ProfileViewMode, reader?: string | null): ProfileViewModeState {
  const key = preferenceKey(profile, reader);
  useEffect(() => {
    if (!profile) return;
    migrateLegacyMode(profile, key);
  }, [key, profile]);
  const mode = useSyncExternalStore(subscribe, () => readMode(key) ?? ownerDefault, () => ownerDefault);
  const setMode = useCallback((next: ProfileViewMode) => writeMode(key, next), [key]);
  return useMemo(() => ({ mode, setMode }), [mode, setMode]);
}

export const ProfileViewModeContext = createContext<ProfileViewModeState | null>(null);

function useResolved(): ProfileViewModeState {
  const provided = useContext(ProfileViewModeContext);
  const loose = useProfileViewState(null, 'grid');
  return provided ?? loose;
}

export function useProfileViewMode(): ProfileViewMode {
  return useResolved().mode;
}

export function useSetProfileViewMode(): (mode: ProfileViewMode) => void {
  return useResolved().setMode;
}
