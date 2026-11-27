/**
 * Menu tiles moved to another group of the phone menu (Main, Create,
 * Discover, Money, Riftn). Hold a tile and drop it on another tab, section
 * header or folder to move it there; dropping it back on its own group undoes
 * the move. The order inside a group stays the dragged menu order
 * (lib/nav-order).
 *
 * Saved per device and synced to the account under `menuGroupMoves` (the same
 * key and shape in riftn-mobile): { [navItemId]: groupId }.
 *
 * @module lib/menu-group-moves
 */

import { useSyncExternalStore } from 'react';

export const MENU_GROUP_IDS = ['main', 'create', 'discover', 'money', 'riftn'] as const;
export type MenuGroupMoveTarget = (typeof MENU_GROUP_IDS)[number];
export type MenuGroupMoves = Readonly<Record<string, MenuGroupMoveTarget>>;

export const MENU_GROUP_MOVES_PREF_KEY = 'menuGroupMoves';

const STORAGE_KEY = 'dehub.menuGroupMoves';
const CHANGE_EVENT = 'menu-group-moves-changed';
const EMPTY: MenuGroupMoves = Object.freeze({});

export function isMenuGroupId(value: unknown): value is MenuGroupMoveTarget {
  return typeof value === 'string' && (MENU_GROUP_IDS as readonly string[]).includes(value);
}

export function sanitiseMenuGroupMoves(value: unknown): MenuGroupMoves {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY;
  const out: Record<string, MenuGroupMoveTarget> = {};
  let n = 0;
  for (const [id, group] of Object.entries(value as Record<string, unknown>)) {
    if (!id || id.length > 80 || !isMenuGroupId(group)) continue;
    out[id] = group;
    if (++n >= 200) break;
  }
  return n ? out : EMPTY;
}

let cache: { raw: string | null; moves: MenuGroupMoves } | null = null;

export function readMenuGroupMoves(): MenuGroupMoves {
  let raw: string | null = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { raw = cache?.raw ?? null; }
  if (cache && cache.raw === raw) return cache.moves;
  let moves = EMPTY;
  if (raw) {
    try { moves = sanitiseMenuGroupMoves(JSON.parse(raw)); } catch { moves = EMPTY; }
  }
  cache = { raw, moves };
  return moves;
}

export function writeMenuGroupMoves(moves: MenuGroupMoves) {
  const clean = sanitiseMenuGroupMoves(moves);
  const raw = Object.keys(clean).length ? JSON.stringify(clean) : null;
  try {
    if (raw) localStorage.setItem(STORAGE_KEY, raw);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / quota: the move still applies until reload */
  }
  cache = { raw, moves: clean };
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function moveMenuTile(id: string, target: MenuGroupMoveTarget, home: MenuGroupMoveTarget | null): MenuGroupMoves | null {
  const moves = { ...readMenuGroupMoves() };
  if ((moves[id] ?? home) === target) return null;
  if (home === target) delete moves[id];
  else moves[id] = target;
  writeMenuGroupMoves(moves);
  return readMenuGroupMoves();
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useMenuGroupMoves(): MenuGroupMoves {
  return useSyncExternalStore(subscribe, readMenuGroupMoves, () => EMPTY);
}
