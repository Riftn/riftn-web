import { useSyncExternalStore } from 'react';

const KEY = 'dehub.activityShelf';
type Preferences = { hidden: boolean; statusesHidden: boolean; dismissed: string[] };

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      hidden: saved?.hidden === true,
      statusesHidden: saved?.statusesHidden === true,
      dismissed: Array.isArray(saved?.dismissed) ? saved.dismissed.filter((id: unknown) => typeof id === 'string') : [],
    };
  } catch {
    return { hidden: false, statusesHidden: false, dismissed: [] };
  }
}

let preferences = readPreferences();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const getActivityShelfPreferences = () => preferences;

export function useActivityShelfPreferences() {
  return useSyncExternalStore(subscribe, getActivityShelfPreferences, getActivityShelfPreferences);
}

function save(next: Preferences) {
  preferences = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Keep the session preference. */ }
  listeners.forEach(listener => listener());
}

export function setActivityBarHidden(hidden: boolean, bar: 'activity' | 'status' = 'activity') {
  save({ ...preferences, [bar === 'status' ? 'statusesHidden' : 'hidden']: hidden });
}

export function setActivityItemsHidden(ids: string[], hidden: boolean) {
  const dismissed = preferences.dismissed.filter(id => !ids.includes(id));
  if (hidden) dismissed.push(...ids);
  save({ ...preferences, dismissed: dismissed.slice(-256) });
}
