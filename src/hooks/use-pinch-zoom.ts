import { useCallback, useMemo, useRef } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';

const MAX_SCALE = 4;
const SETTLE = 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * Two fingers zoom into a picture while they are down, and it settles back
 * when they lift.
 *
 * The handlers go on the element that receives the touches; `targetRef` goes
 * on the element that grows. The zoom follows the point between the fingers,
 * so the part being pinched stays under them, and the picture can be carried
 * around while it is held. `onActiveChange(true)` fires as the second finger
 * lands, for a parent that must stop treating the touch as a swipe.
 */
export function usePinchZoom(enabled: boolean, onActiveChange?: (active: boolean) => void) {
  const targetRef = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ distance: number; x: number; y: number } | null>(null);

  const measure = (event: ReactTouchEvent) => {
    const [a, b] = [event.touches[0], event.touches[1]];
    return {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    };
  };

  const release = useCallback(() => {
    if (!pinch.current) return;
    pinch.current = null;
    const target = targetRef.current;
    if (target) {
      target.style.transition = SETTLE;
      target.style.transform = '';
      target.style.willChange = '';
    }
    onActiveChange?.(false);
  }, [onActiveChange]);

  const onTouchStart = useCallback((event: ReactTouchEvent) => {
    const target = targetRef.current;
    if (!enabled || !target || event.touches.length !== 2) return;
    const start = measure(event);
    const box = target.getBoundingClientRect();
    pinch.current = start;
    target.style.transition = 'none';
    target.style.willChange = 'transform';
    target.style.transformOrigin = `${start.x - box.left}px ${start.y - box.top}px`;
    onActiveChange?.(true);
  }, [enabled, onActiveChange]);

  const onTouchMove = useCallback((event: ReactTouchEvent) => {
    const start = pinch.current;
    const target = targetRef.current;
    if (!start || !target) return;
    if (event.touches.length < 2) { release(); return; }
    const now = measure(event);
    const scale = Math.min(MAX_SCALE, Math.max(1, now.distance / start.distance));
    target.style.transform = `translate3d(${now.x - start.x}px, ${now.y - start.y}px, 0) scale(${scale})`;
  }, [release]);

  const onTouchEnd = useCallback((event: ReactTouchEvent) => {
    if (event.touches.length < 2) release();
  }, [release]);

  const handlers = useMemo(
    () => ({ onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd }),
    [onTouchStart, onTouchMove, onTouchEnd],
  );
  return { targetRef, handlers };
}
