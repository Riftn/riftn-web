import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

/**
 * Hold a list row with a finger to act on it (phones). Fires after 450ms of a
 * still touch; any drag (a scroll or a swipe) cancels it. The click that
 * follows the lift is swallowed, so a hold never also opens the row.
 * Mouse and pen are left alone: computers right-click instead.
 */
export function useRowLongPress(onLongPress: (() => void) | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;
  const enabled = !!onLongPress;

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    start.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    cancel();
    fired.current = false;
    if (!enabled || event.pointerType !== 'touch' || !event.isPrimary) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    timer.current = setTimeout(() => {
      fired.current = true;
      cancel();
      try { navigator.vibrate?.(10); } catch { /* not supported */ }
      callback.current?.();
    }, 450);
  }, [enabled, cancel]);

  const onPointerMove = useCallback((event: ReactPointerEvent) => {
    const origin = start.current;
    if (origin && (event.pointerId !== origin.id || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8)) cancel();
  }, [cancel]);

  /** Call first thing in the row's onClick: true means the hold already acted. */
  const consumeClick = useCallback(() => {
    if (!fired.current) return false;
    fired.current = false;
    return true;
  }, []);

  // Android opens its own long-press menu on a button; the hold is ours.
  const onContextMenu = useCallback((event: ReactMouseEvent) => {
    if (enabled && (start.current || fired.current)) event.preventDefault();
  }, [enabled]);

  return enabled
    ? { handlers: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerCancel: cancel, onPointerLeave: cancel, onContextMenu }, consumeClick }
    : { handlers: {}, consumeClick };
}
