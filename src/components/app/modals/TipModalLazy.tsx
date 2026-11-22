/**
 * The tip drawer, fetched the first time somebody opens it.
 * =========================================================
 *
 * Every post, image and video card mounts a `TipModal` with `open` false, so
 * the drawer and everything it imports sat on the boot path for every visitor.
 * Same approach as `QuotePostModalLazy`: mount nothing until `open` first goes
 * true, then keep it mounted so the close animation survives.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { TipModal as TipModalComponent } from './TipModal';

const TipModal = lazy(() => import('./TipModal').then((m) => ({ default: m.TipModal })));

type TipModalProps = ComponentProps<typeof TipModalComponent>;

export function TipModalLazy(props: TipModalProps) {
  const [everOpened, setEverOpened] = useState(props.open);
  useEffect(() => {
    if (props.open) setEverOpened(true);
  }, [props.open]);

  if (!everOpened) return null;

  return (
    <Suspense fallback={null}>
      <TipModal {...props} />
    </Suspense>
  );
}
