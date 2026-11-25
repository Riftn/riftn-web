import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { ActivityMenuRequest, ActivityTarget } from '@/components/app/stories/ActivityShelfMenu';

type MenuEvent = MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>;

export function activityMenuEvents(open: (event: MenuEvent) => void) {
  return {
    onContextMenu: open,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) open(event);
    },
  };
}

export function useActivityMenu() {
  const [request, setRequest] = useState<ActivityMenuRequest | null>();
  const trigger = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    if (document.activeElement?.closest('[data-msg-menu]') && trigger.current?.isConnected) {
      trigger.current.focus({ preventScroll: true });
    }
    trigger.current = null;
    setRequest(null);
  }, []);
  const open = (event: MenuEvent, target?: ActivityTarget) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    const anchor = event.target instanceof Element ? event.target.closest('button') ?? event.currentTarget : event.currentTarget;
    trigger.current = anchor;
    const rect = anchor.getBoundingClientRect();
    const point = 'clientX' in event && (event.clientX || event.clientY)
      ? { x: event.clientX, y: event.clientY }
      : { x: rect.left, y: rect.bottom };
    setRequest({ point, target });
  };
  return { request, open, close };
}
