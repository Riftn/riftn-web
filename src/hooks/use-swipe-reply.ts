import { useEffect, useRef, type RefObject } from 'react';

const START = 14;
const FIRE = 60;
const MAX = 80;

/**
 * Phone: drag a chat line to the left to reply to it, like the app. Only
 * leftward, because a rightward drag is the page's own swipe back. The line
 * follows the finger up to 80px and springs home on release; past 60px it
 * replies. Mouse and pen are left alone.
 */
export function useSwipeReply(
  ref: RefObject<HTMLElement | null>,
  onReply: (() => void) | undefined,
  enabled = true,
) {
  const replyRef = useRef(onReply);
  replyRef.current = onReply;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !onReply) return;
    let x0 = 0;
    let y0 = 0;
    let dx = 0;
    let state: 'idle' | 'maybe' | 'drag' | 'off' = 'idle';

    const reset = () => {
      el.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
      state = 'idle';
      dx = 0;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (state === 'drag') reset();
        state = 'off';
        return;
      }
      const t = e.touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      dx = 0;
      state = 'maybe';
    };
    const onMove = (e: TouchEvent) => {
      if (state === 'off' || state === 'idle' || e.touches.length !== 1) return;
      const t = e.touches[0];
      const mx = t.clientX - x0;
      const my = t.clientY - y0;
      if (state === 'maybe') {
        if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { state = 'off'; return; }
        if (mx > -START || Math.abs(mx) < Math.abs(my) * 1.5) return;
        state = 'drag';
        el.style.transition = 'none';
      }
      dx = Math.max(-MAX, Math.min(0, mx));
      el.style.transform = `translateX(${dx}px)`;
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      const fire = state === 'drag' && dx <= -FIRE;
      if (state === 'drag') reset();
      state = 'idle';
      if (fire) {
        try { navigator.vibrate?.(8); } catch { /* no vibration */ }
        replyRef.current?.();
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', reset);
      el.style.transform = '';
      el.style.transition = '';
    };
  }, [ref, enabled, !!onReply]); // eslint-disable-line react-hooks/exhaustive-deps
}
