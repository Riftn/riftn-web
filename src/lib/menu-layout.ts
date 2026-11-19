/**
 * Menu Layout
 * ===========
 * How the phone menu groups its pages: Tabs (one group at a time, the
 * default), Sections (every page under group headers) or Folders (Main, then
 * a folder per group). Desktop has no such menu and ignores it.
 *
 * Same small shape as lib/feed-video-shape: read by the menu, edited by one
 * select in Settings, synced to the account in ViewingPreferencesSync under
 * `menuLayout` (the same key in riftn-mobile).
 *
 * @module lib/menu-layout
 */

import { useSyncExternalStore } from 'react';

export type MenuLayout = 'tabs' | 'sections' | 'folders';

export const DEFAULT_MENU_LAYOUT: MenuLayout = 'tabs';
export const MENU_LAYOUT_PREF_KEY = 'menuLayout';

const STORAGE_KEY = 'menu-layout';
const CHANGE_EVENT = 'menu-layout-changed';

export function normaliseMenuLayout(value: unknown): MenuLayout {
  return value === 'sections' || value === 'folders' ? value : DEFAULT_MENU_LAYOUT;
}

export function readMenuLayout(): MenuLayout {
  try {
    return normaliseMenuLayout(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MENU_LAYOUT;
  }
}

export function writeMenuLayout(value: MenuLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode / quota: the choice still applies for this session */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useMenuLayout(): MenuLayout {
  return useSyncExternalStore(subscribe, readMenuLayout, () => DEFAULT_MENU_LAYOUT);
}
