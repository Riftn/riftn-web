import { useContext, useSyncExternalStore } from 'react';
import { AuthContext } from '@/contexts/AuthContext';

const KEY = 'riftn.blurMomentPreviews';
const listeners = new Set<() => void>();
const sessionValues = new Map<string, boolean>();

function read(key: string): boolean | undefined {
  const sessionValue = sessionValues.get(key);
  if (sessionValue !== undefined) return sessionValue;
  try {
    const value = localStorage.getItem(key);
    if (value === '1' || value === '0') return value === '1';
  } catch { /* Storage may be unavailable in private browsing. */ }
}

function onStorage(event: StorageEvent) {
  if (event.key === null) sessionValues.clear();
  else if (event.key === KEY || event.key.startsWith(KEY + ':')) sessionValues.delete(event.key);
  else return;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

export function useMomentPreviewSetting() {
  const auth = useContext(AuthContext);
  const wallet = auth?.isAuthenticated ? auth.walletAddress?.toLowerCase() : undefined;
  const key = wallet ? `${KEY}:${wallet}` : KEY;
  // Preserve the old device-wide setting until this account has its own choice.
  const readValue = () => read(key) ?? read(KEY) ?? false;
  const blurred = useSyncExternalStore(subscribe, readValue, () => false);
  const loading = auth?.isLoading ?? false;
  const setBlurred = (next: boolean) => {
    try {
      localStorage.setItem(key, next ? '1' : '0');
      sessionValues.delete(key);
    } catch {
      sessionValues.set(key, next);
    }
    listeners.forEach(listener => listener());
  };
  return { blurred, loading, setBlurred };
}

export function useMomentPreviewsBlurred(): boolean {
  const { blurred, loading } = useMomentPreviewSetting();
  return blurred || loading;
}
