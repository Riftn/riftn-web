/**
 * What the login sheet is doing, for the sign-in hand-off (SignInHandoff).
 *
 * `waiting` is the gap after the person has done their part (picked Google,
 * typed the code, approved in the wallet) and before the session lands.
 * A module store rather than context: the sheet and the hand-off sit in
 * different subtrees and neither should re-render the other's parents.
 */
import { useSyncExternalStore } from 'react';

export type SignInSheetState = 'closed' | 'waiting' | 'open';

let state: SignInSheetState = 'closed';
const listeners = new Set<() => void>();
// Per mounted sheet, not one shared value: the sheet can be mounted twice for
// a moment (a warm copy handing over to the live one), and the copy that is
// leaving must not be able to mark the one that is staying as closed.
const sheets = new Map<symbol, SignInSheetState>();

function recompute(): void {
  let next: SignInSheetState = 'closed';
  for (const s of sheets.values()) {
    if (s === 'waiting') { next = 'waiting'; break; }
    if (s === 'open') next = 'open';
  }
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

/** Publish one sheet's state; `null` when that sheet unmounts. */
export function setSignInSheetState(sheet: symbol, next: SignInSheetState | null): void {
  if (next === null || next === 'closed') sheets.delete(sheet);
  else sheets.set(sheet, next);
  recompute();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSignInSheetState(): SignInSheetState {
  return useSyncExternalStore(subscribe, () => state, () => 'closed');
}
