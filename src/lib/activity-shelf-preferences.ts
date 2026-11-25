import { useSyncExternalStore } from 'react';

const KEY = 'dehub.activityShelf';
type Preferences = { hidden: boolean; dismissed: string[] };

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      hidden: saved?.hidden === true,
      dismissed: Array.isArray(saved?.dismissed) ? saved.dismissed.filter((id: unknown) => typeof id === 'string') : [],
    };
  } catch {
    return { hidden: false, dismissed: [] };
  }
}

let preferences = readPreferences();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getPreferences = () => preferences;

export function useActivityShelfPreferences() {
  return useSyncExternalStore(subscribe, getPreferences, getPreferences);
}

function save(next: Preferences) {
  preferences = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Keep the session preference. */ }
  listeners.forEach(listener => listener());
}

export function setActivityBarHidden(hidden: boolean) {
  save({ ...preferences, hidden });
}

export function setActivityItemsHidden(ids: string[], hidden: boolean) {
  const dismissed = preferences.dismissed.filter(id => !ids.includes(id));
  if (hidden) dismissed.push(...ids);
  save({ ...preferences, dismissed: dismissed.slice(-256) });
}
