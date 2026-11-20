/**
 * The row of look cards in Settings → Appearance (Sign-in screen, After you
 * sign in). On a phone it is a side-swipe carousel: one and a half cards show,
 * and each card's preview is only built once it has been swiped into view and
 * only plays while it is in view, so a row of looping previews never runs at
 * once. From `sm` up it stays the grid it was.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { useScrollFadeMask } from '@/components/app/feeds/useScrollFadeMask';

type CardView = { seen: boolean; inView: boolean };

const RowContext = createContext<HTMLDivElement | null>(null);

/** Whether this card is in the row's view now, and whether it ever was. */
export function useLookCardView(ref: React.RefObject<HTMLElement | null>): CardView {
  const root = useContext(RowContext);
  const [view, setView] = useState<CardView>({ seen: false, inView: false });
  useEffect(() => {
    const node = ref.current;
    if (!node || !root || typeof IntersectionObserver === 'undefined') {
      setView({ seen: true, inView: true });
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting;
        setView((prev) => (prev.inView === inView && (prev.seen || !inView) ? prev : { seen: prev.seen || inView, inView }));
      },
      { root, threshold: 0.25 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [ref, root]);
  return view;
}

export function LookCarousel({
  label,
  activeIndex,
  desktopCols,
  children,
}: {
  label: string;
  /** The picked card, brought into view when the row first shows. */
  activeIndex: number;
  desktopCols: 'sm:grid-cols-4' | 'sm:grid-cols-5';
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const { style } = useScrollFadeMask<HTMLDivElement>(ref);
  const opened = useRef(false);

  useLayoutEffect(() => {
    setRoot(ref.current);
    const row = ref.current;
    if (!row || opened.current) return;
    opened.current = true;
    const card = row.children[activeIndex] as HTMLElement | undefined;
    // Only a row that scrolls (a phone) needs the picked card brought in.
    if (card && row.scrollWidth > row.clientWidth + 1) {
      row.scrollLeft = Math.max(0, card.offsetLeft - row.offsetLeft - 16);
    }
  }, [activeIndex]);

  return (
    <RowContext.Provider value={root}>
      <div
        ref={ref}
        role="radiogroup"
        aria-label={label}
        style={style}
        className={cn(
          'look-carousel flex gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-1 scrollbar-hide p-1',
          'sm:grid sm:overflow-visible sm:snap-none sm:p-0',
          desktopCols,
        )}
      >
        {children}
      </div>
    </RowContext.Provider>
  );
}

/** Class for each card in a LookCarousel: same width on a phone, grid cell above. */
export const LOOK_CARD_CLASS = 'w-[60%] shrink-0 snap-start sm:w-auto';
