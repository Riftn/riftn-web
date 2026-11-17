import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keeps a chat list pinned to its newest line while the reader is following it.
 *
 * Rows keep growing after they first render: images and GIFs load, reply quotes
 * and reaction pills appear, translations swap text in, and the composer above
 * the keyboard grows when a reply is started. A one-off `scrollTop =
 * scrollHeight` on new messages misses all of that, so the last rows end up
 * cut off below the fold. This watches the list's size and content and re-pins
 * to the bottom on every change, for as long as `isFollowing()` says so.
 */
export function useStickToBottom(
  containerRef: RefObject<HTMLElement>,
  isFollowing: () => boolean,
  enabled = true,
) {
  const followRef = useRef(isFollowing);
  followRef.current = isFollowing;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    let frame = 0;
    const pin = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const node = containerRef.current;
        if (!node || node.clientHeight === 0 || !followRef.current()) return;
        const target = node.scrollHeight - node.clientHeight;
        if (Math.abs(node.scrollTop - target) > 1) node.scrollTop = target;
      });
    };

    // Size changes of the list itself (composer grows, keyboard, panel resize)
    // and of each row (images, reactions, reply quotes, translations).
    const sizes = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(pin) : null;
    const watchRows = () => {
      if (!sizes) return;
      sizes.disconnect();
      sizes.observe(el);
      for (const child of Array.from(el.children)) sizes.observe(child);
    };
    watchRows();

    // Rows added or removed, and any change inside a row.
    const rows = new MutationObserver((records) => {
      if (records.some((r) => r.type === 'childList' && r.target === el)) watchRows();
      pin();
    });
    rows.observe(el, { childList: true, subtree: true, characterData: true });

    // Media that finishes loading changes height without a DOM mutation.
    const onMedia = () => pin();
    el.addEventListener('load', onMedia, true);
    el.addEventListener('loadedmetadata', onMedia, true);

    pin();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      sizes?.disconnect();
      rows.disconnect();
      el.removeEventListener('load', onMedia, true);
      el.removeEventListener('loadedmetadata', onMedia, true);
    };
  }, [containerRef, enabled]);
}
