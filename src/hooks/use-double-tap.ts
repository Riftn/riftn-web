import { useRef, type PointerEvent } from 'react';

const TAP_MS = 220;
const BETWEEN_TAPS_MS = 300;
const SLOP_PX = 10;
const INTERACTIVE = 'a,button,input,textarea,select,label,video,audio,[role="button"],[role="link"],[contenteditable]';

type Point = { x: number; y: number; time: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pointOf = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY, time: e.timeStamp });

/** A touch shortcut. Keep mouse double-click and presses on links or controls separate. */
export function useDoubleTap(onDoubleTap: (() => void) | undefined) {
  const start = useRef<(Point & { id: number }) | null>(null);
  const previous = useRef<Point | null>(null);
  const reset = () => { start.current = previous.current = null; };

  return {
    onPointerDown: (e: PointerEvent) => {
      if (!onDoubleTap || e.pointerType !== 'touch' || !e.isPrimary
        || !(e.target instanceof Element) || !e.currentTarget.contains(e.target)
        || e.target.closest(INTERACTIVE)) {
        reset();
        return;
      }
      start.current = { ...pointOf(e), id: e.pointerId };
    },
    onPointerMove: (e: PointerEvent) => {
      if (start.current?.id === e.pointerId && distance(start.current, pointOf(e)) > SLOP_PX) reset();
    },
    onPointerCancel: reset,
    onPointerUp: (e: PointerEvent) => {
      const first = start.current;
      const end = pointOf(e);
      const last = previous.current;
      reset();
      if (!onDoubleTap || first?.id !== e.pointerId || end.time - first.time > TAP_MS || distance(first, end) > SLOP_PX) return;
      if (last && first.time - last.time <= BETWEEN_TAPS_MS && distance(last, end) <= SLOP_PX * 2) {
        onDoubleTap();
      } else {
        previous.current = end;
      }
    },
  };
}
