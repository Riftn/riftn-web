/**
 * Profile view mode
 * =================
 * The All tab on a profile shows posts as a grid of tiles or as the full
 * post list.
 *
 * The profile's owner picks which one visitors start on (Settings > Profile
 * posts layout, saved in the account's public `customs.defaultProfileView`).
 * A visitor can still flip the toolbar toggle; that flip holds for that
 * profile for the rest of this browser tab, then the owner's choice applies
 * again on the next visit.
 *
 * ProfilePage provides the mode through ProfileViewModeContext so the toolbar
 * toggle and the tab that draws the posts agree. Without a provider (gallery
 * previews) both fall back to one shared in-memory mode.
 *
 * @module lib/profile-view-mode
 */

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

export type ProfileViewMode = 'grid' | 'list';

/** Key in the account's `customs` blob. Absent means grid. */
export const PROFILE_VIEW_DEFAULT_KEY = 'defaultProfileView';

export function parseProfileViewDefault(raw: unknown): ProfileViewMode {
  return raw === 'list' ? 'list' : 'grid';
}

const SESSION_KEY = 'riftn.profileViewFlips';
const listeners = new Set<() => void>();
let flips: Record<string, ProfileViewMode> | null = null;

function readFlips(): Record<string, ProfileViewMode> {
  if (flips) return flips;
  flips = {};
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (v === 'grid' || v === 'list') flips[k] = v;
      }
    }
  } catch {
    /* no storage: flips last for this page load */
  }
  return flips;
}

function writeFlip(profileKey: string, mode: ProfileViewMode): void {
  flips = { ...readFlips(), [profileKey]: mode };
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(flips));
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn());
}

/** Drop this tab's flip for a profile, so its owner's default shows again. */
export function clearProfileViewFlip(profileKey: string | null | undefined): void {
  if (!profileKey) return;
  const key = profileKey.toLowerCase();
  if (!(key in readFlips())) return;
  const { [key]: _dropped, ...rest } = readFlips();
  flips = rest;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(flips));
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot(): Record<string, ProfileViewMode> {
  return typeof window === 'undefined' ? {} : readFlips();
}

const EMPTY: Record<string, ProfileViewMode> = {};

/** Key used when no profile provides its own (gallery, previews). */
const LOOSE_KEY = '__loose__';

export interface ProfileViewModeState {
  mode: ProfileViewMode;
  setMode: (mode: ProfileViewMode) => void;
}

/**
 * The view for one profile: this tab's flip if the visitor made one, else
 * the owner's saved default.
 */
export function useProfileViewState(profileKey: string | null | undefined, ownerDefault: ProfileViewMode): ProfileViewModeState {
  const all = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const key = profileKey ? profileKey.toLowerCase() : LOOSE_KEY;
  const mode = all[key] ?? ownerDefault;
  const setMode = useCallback((next: ProfileViewMode) => writeFlip(key, next), [key]);
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
