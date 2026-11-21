import { toast } from 'sonner';
import { X } from 'lucide-react';
import { BUTTON_CLASSES, TITLE_CLASSES } from '@/components/ui/toast-classes';

interface UndoToastOptions {
  id: string;
  duration: number;
  undoLabel: string;
  closeLabel: string;
  onUndo: () => void;
}

export function showUndoToast(message: string, { id, duration, undoLabel, closeLabel, onUndo }: UndoToastOptions) {
  return toast.custom(
    (toastId) => (
      <div
        data-undo-toast-card
        className="flex w-full flex-col gap-3 p-4 text-start text-white"
      >
        <div className="flex items-start justify-between gap-3">
          <span className={`min-w-0 ${TITLE_CLASSES}`}>{message}</span>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => toast.dismiss(toastId)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-white/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onUndo();
            toast.dismiss(toastId);
          }}
          className={BUTTON_CLASSES}
        >
          {undoLabel}
        </button>
      </div>
    ),
    {
      id,
      duration,
      unstyled: true,
      // The card is the toast element itself, so each theme's toast surface
      // (dark glass, the light themes' white card) paints it like any other.
      classNames: {
        toast: 'w-full rounded-xl border border-white/20 bg-zinc-950/70 text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl',
      },
    },
  );
}
