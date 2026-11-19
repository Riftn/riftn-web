import { startTransition, useEffect, useState } from 'react';

/**
 * How many of a list's cards to draw. A fresh list (a new `scope`) draws its
 * first few at once and the rest right after as a transition, which React
 * renders in slices: the page keeps scrolling and painting meanwhile, where
 * drawing every card in one go froze it for as long as that took. A list
 * that grows (the next page of results) is taken the same way.
 */
export function useStagedCount(total: number, first: number, scope: string): number {
  const [state, setState] = useState({ scope, count: first });
  let count = state.count;
  if (state.scope !== scope) {
    count = first;
    setState({ scope, count: first });
  }
  useEffect(() => {
    if (count >= total) return;
    startTransition(() => {
      setState((current) => (current.scope === scope && current.count < total ? { scope, count: total } : current));
    });
  }, [count, total, scope]);
  return Math.min(total, Math.max(count, first));
}
