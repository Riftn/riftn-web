import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
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

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const style = getComputedStyle(row);
    const width = row.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    if (width <= 0) return;
    if (foldedRef.current) {
      if (width >= needed.current) setFolded(false);
      return;
    }
    const items = flexItems(row);
    if (items.length < 2) return;
    const gap = parseFloat(style.columnGap) || 0;
    const need = items.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + gap * (items.length - 1);
    if (need > width + 0.5) {
      needed.current = Math.ceil(need);
      setFolded(true);
    }
  }, [rowRef]);

  useLayoutEffect(() => {
    if (!enabled) { setFolded(false); return; }
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === 'undefined') return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(row);
    return () => ro.disconnect();
  }, [enabled, measure, rowRef]);

  // Counts change width too (a like taking 9 to 10): re-check after renders.
  useLayoutEffect(() => { if (enabled) measure(); });

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
