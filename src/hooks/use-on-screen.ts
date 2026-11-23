import { useEffect, useState, type RefObject } from 'react';

/**
 * True while the element is on screen (and the tab is shown). Used to pause
 * looping previews that have scrolled away, so they cost nothing there.
 */
export function useOnScreen(ref: RefObject<Element | null>, margin = '80px'): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(([entry]) => setOn(entry.isIntersecting), { rootMargin: margin });
    io.observe(node);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}
