import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Add from '@/components/ui/cut-icons/add';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FEED_ICON_CLASS } from './feed-icon-size';
import { PostUtilityButtons } from './PostUtilityButtons';

/** The row's real flex items: display:contents wrappers are looked through. */
function flexItems(row: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const display = getComputedStyle(child).display;
      if (display === 'contents') { walk(child); continue; }
      if (display === 'none' || child.offsetWidth === 0) continue;
      out.push(child);
    }
  };
  walk(row);
  return out;
}

/** The row's text and element count: what its buttons' widths depend on. */
function contentKey(row: HTMLElement): string {
  return `${row.getElementsByTagName('*').length}|${row.textContent ?? ''}`;
}

/**
 * One observer for every action row. The browser reports rows after it has
 * laid the page out and before it paints, all the rows of a frame together:
 * each is measured against a layout that is already there, and the rows that
 * have to fold do so in one update ahead of the paint. Measured one by one as
 * their cards mounted, each row made the browser lay the whole page out again
 * (a results page of fifteen cards: fifteen layouts in a row).
 */
const rowChecks = new WeakMap<Element, () => (() => void) | null>();
let rowObserver: ResizeObserver | null = null;
function watchRow(row: HTMLElement, check: () => (() => void) | null): () => void {
  rowObserver ??= new ResizeObserver((entries) => {
    const writes: (() => void)[] = [];
    for (const entry of entries) {
      const write = rowChecks.get(entry.target)?.();
      if (write) writes.push(write);
    }
    if (writes.length) flushSync(() => { for (const write of writes) write(); });
  });
  rowChecks.set(row, check);
  rowObserver.observe(row);
  return () => {
    rowChecks.delete(row);
    rowObserver?.unobserve(row);
  };
}

/**
 * True when the action row cannot hold every button on one line. While it
 * fits, the full set shows; once it would wrap, bookmark / pin / info fold
 * into one + button so the like button stays on the row instead of dropping
 * to a line of its own. It unfolds again once the row is back to the width
 * the full set needed.
 */
export function useFoldUtility(rowRef: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [folded, setFolded] = useState(false);
  const needed = useRef(0);
  const foldedRef = useRef(false);
  foldedRef.current = folded;
  // What the row held when it was last measured. Reading it costs no layout.
  const measured = useRef('');

  /** Measures the row; returns the change to make, if any. */
  const check = useCallback((): (() => void) | null => {
    const row = rowRef.current;
    if (!row) return null;
    measured.current = contentKey(row);
    const style = getComputedStyle(row);
    const width = row.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    if (width <= 0) return null;
    if (foldedRef.current) return width >= needed.current ? () => setFolded(false) : null;
    const items = flexItems(row);
    if (items.length < 2) return null;
    const gap = parseFloat(style.columnGap) || 0;
    const need = items.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + gap * (items.length - 1);
    if (need <= width + 0.5) return null;
    needed.current = Math.ceil(need);
    return () => setFolded(true);
  }, [rowRef]);

  useLayoutEffect(() => {
    if (!enabled) { setFolded(false); return; }
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return;
    // The observer reports a row once as soon as it is watched, so a new
    // card is measured before its first paint without a measure here.
    return watchRow(row, check);
  }, [enabled, check, rowRef]);

  // Counts change width too (a like taking 9 to 10): re-check after a render
  // that changed what the row holds. Measuring makes the browser lay the page
  // out on the spot, and a feed of cards renders many times a second while it
  // scrolls, so a render that left the row as it was measures nothing, and a
  // row the observer has yet to report is left to it.
  useLayoutEffect(() => {
    if (!enabled || !measured.current) return;
    const row = rowRef.current;
    if (row && contentKey(row) !== measured.current) check()?.();
  });

  return enabled && folded;
}

interface UtilityOverflowButtonProps {
  postId?: string;
  tokenId?: number;
  isOwnPost?: boolean;
}

/** The folded bookmark / pin / info, behind one + button. */
export function UtilityOverflowButton({ postId, tokenId, isOwnPost }: UtilityOverflowButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-utility-overflow
          onClick={(e) => e.stopPropagation()}
          aria-label={t('postOptions.moreActions', 'More actions')}
          className={cn('text-white hover:text-zinc-400 transition-[color,transform] duration-200', open && 'rotate-45')}
        >
          <Add className={FEED_ICON_CLASS.info} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        data-no-navigate
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-auto px-4 py-3 flex items-center gap-5 rounded-2xl border border-white/15"
      >
        <PostUtilityButtons postId={postId} tokenId={tokenId} isOwnPost={isOwnPost} variant="inline" />
      </PopoverContent>
    </Popover>
  );
}
