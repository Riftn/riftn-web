import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

interface FadeSlotProps {
  show: boolean;
  children: ReactNode;
  /** Flex gap of the parent row in px, folded away while the slot is closed so neighbours glide instead of jumping. */
  gap?: number;
  /** Which side of the slot the parent's gap sits on: 'left' unless the slot is the row's first child. */
  gapSide?: 'left' | 'right';
  className?: string;
}

/**
 * Fades a control in and out of a flex row. Width eases open and shut
 * together with the fade, so the row never snaps when the control
 * appears or leaves.
 */
export function FadeSlot({ show, children, gap = 0, gapSide = 'left', className }: FadeSlotProps) {
  const reduce = useReducedMotion();
  const margin = gapSide === 'left' ? 'marginLeft' : 'marginRight';
  const closed = { width: 0, opacity: 0, [margin]: -gap, scale: 0.85 };
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="slot"
          className={cn('flex flex-shrink-0 items-center justify-center overflow-hidden', className)}
          initial={closed}
          animate={{ width: 'auto', opacity: 1, [margin]: 0, scale: 1 }}
          exit={closed}
          transition={
            reduce
              ? { duration: 0 }
              : {
                  width: { duration: 0.24, ease: EASE },
                  [margin]: { duration: 0.24, ease: EASE },
                  opacity: { duration: 0.2, ease: 'easeOut' },
                  scale: { duration: 0.24, ease: EASE },
                }
          }
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
