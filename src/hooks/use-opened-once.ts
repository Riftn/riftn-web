import { useRef } from 'react';

/**
 * True from the first render where `open` is true, and from then on.
 * A closed sheet or pop-up that sits in every card can return nothing until
 * someone opens it, then stay mounted so closing still animates.
 */
export function useOpenedOnce(open: boolean): boolean {
  const opened = useRef(false);
  if (open) opened.current = true;
  return opened.current;
}
