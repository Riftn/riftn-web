/**
 * The few things other code needs from ChatHoldSheet without pulling the sheet
 * itself (emoji panel, reactors list, packs) into the startup bundle.
 */

/** Phones with a finger, not a mouse. Desktop keeps hover buttons and the browser's own right-click. */
export function isTouchHold() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

/** The comments sheet keeps its height while a hold sheet is up. */
export const HOLD_EVENT = 'chat-hold-sheet';
