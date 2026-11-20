/**
 * How the Riftn logo and headline look on the sign-in sheet.
 *
 * Seven looks: Flat (the default, the one that never moves), Tube TV, VHS
 * tape, LED wall, Hologram, Neon glow and 3D. A per-device choice in Settings → Appearance, kept on this device
 * like the theme, so it still applies after signing out (which is when the
 * sign-in sheet is actually seen).
 */
import { useSyncExternalStore } from 'react';

export const LOGIN_LOOKS = ['tube', 'vhs', 'led', 'holo', 'neon', '3d', 'flat'] as const;
export type LoginLook = (typeof LOGIN_LOOKS)[number];
export const DEFAULT_LOGIN_LOOK: LoginLook = 'flat';

const KEY = 'riftn.login.look';
const EVENT = 'riftn:login-look';

export function isLoginLook(value: unknown): value is LoginLook {
  return typeof value === 'string' && (LOGIN_LOOKS as readonly string[]).includes(value);
}

export function getLoginLook(): LoginLook {
  try {
    const saved = localStorage.getItem(KEY);
    return isLoginLook(saved) ? saved : DEFAULT_LOGIN_LOOK;
  } catch {
    return DEFAULT_LOGIN_LOOK;
  }
}

export function setLoginLook(look: LoginLook): void {
  try {
    if (look === DEFAULT_LOGIN_LOOK) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, look);
  } catch {
    // Private mode: the choice just won't stick.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useLoginLook(): LoginLook {
  return useSyncExternalStore(subscribe, getLoginLook, () => DEFAULT_LOGIN_LOOK);
}
