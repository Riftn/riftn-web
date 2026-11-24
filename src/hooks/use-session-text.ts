import { useCallback, useMemo, useState } from 'react';
import type { DraftSetter } from './use-draft-state';

/**
 * A search box's text for this visit only. It survives moving between pages
 * and opening the menu again, and is gone once the tab or app is closed: a
 * search that ended should not greet you next time with a half-filtered menu.
 */
const memory = new Map<string, string>();

export function useSessionText(key: string): [string, DraftSetter<string>] {
  const [value, setValue] = useState(() => memory.get(key) ?? '');
  const write = useCallback((next: string) => {
    if (next) memory.set(key, next); else memory.delete(key);
    setValue(next);
  }, [key]);
  const setter = useMemo(() => {
    const set = ((next: string | ((previous: string) => string)) => {
      write(typeof next === 'function' ? next(memory.get(key) ?? '') : next);
    }) as DraftSetter<string>;
    set.initialize = (next) => {
      if (memory.get(key)) return;
      write(typeof next === 'function' ? next('') : next);
    };
    set.clear = () => write('');
    set.complete = (submitted, replacement) => {
      if ((memory.get(key) ?? '') !== submitted) return false;
      write(replacement);
      return true;
    };
    return set;
  }, [key, write]);
  return [value, setter];
}
