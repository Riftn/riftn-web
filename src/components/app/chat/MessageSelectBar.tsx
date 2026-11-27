import { useTranslation } from 'react-i18next';
import { Copy, CornerUpRight, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * The bar that takes the composer's place while messages in an open chat are
 * selected (Select on a message, then click or tap others). Copy puts the
 * picked lines on the clipboard in thread order, Forward sends each to another
 * chat, Delete removes your own picked messages for everyone.
 */

export interface MessageSelectBarProps {
  count: number;
  /** How many of the picked are yours: only those can be deleted. */
  ownCount: number;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
  onCancel: () => void;
  /** Phones say "Tap", computers "Click". */
  touch?: boolean;
}

const BTN = 'flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-[13px] font-semibold text-zinc-100 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0';

export function MessageSelectBar({ count, ownCount, onCopy, onForward, onDelete, onCancel, touch = false }: MessageSelectBarProps) {
  const { t } = useTranslation();
  const none = count === 0;
  return (
    <div
      data-msg-select-bar
      role="toolbar"
      aria-label={t('msgSelect.toolbar', 'Selected messages')}
      className="mx-2 mb-[calc(env(safe-area-inset-bottom)+8px)] mt-1 shrink-0 rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-[0_2px_8px_-4px_rgb(0_0_0/0.2)] backdrop-blur-xl lg:mb-2"
    >
      <div className="flex items-center gap-1 px-1 pb-1">
        <span data-msg-select-count className="mr-auto pl-1 text-[13px] font-semibold tabular-nums text-white">
          {none
            ? touch
              ? t('msgSelect.pickTouch', { defaultValue: 'Tap messages to select them' })
              : t('msgSelect.pick', { defaultValue: 'Click messages to select them' })
            : t('msgSelect.selected', { defaultValue: '{{count}} selected', count })}
        </span>
        <button type="button" data-msg-select-cancel onClick={onCancel} className={cn(BTN, 'h-8 px-2 text-zinc-400')} aria-label={t('chatBulk.cancel', 'Cancel')} title={t('chatBulk.cancel', 'Cancel')}>
          <X />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button type="button" data-msg-select-copy disabled={none} onClick={onCopy} className={BTN}>
          <Copy />{t('msgSelect.copy', 'Copy')}
        </button>
        <button type="button" data-msg-select-forward disabled={none} onClick={onForward} className={BTN}>
          <CornerUpRight />{t('msgSelect.forward', 'Forward')}
        </button>
        <button
          type="button"
          data-msg-select-delete
          disabled={ownCount === 0}
          onClick={onDelete}
          title={ownCount < count ? t('msgSelect.onlyYours', 'Only your own messages can be deleted') : undefined}
          className={cn(BTN, 'text-red-400 hover:text-red-300')}
        >
          <Trash2 />{ownCount > 0 && ownCount < count
            ? t('msgSelect.deleteSome', { defaultValue: 'Delete {{count}}', count: ownCount })
            : t('chatBulk.delete', 'Delete')}
        </button>
      </div>
    </div>
  );
}

/** The round tick beside a message while picking. Drawn with borders: themes repaint icon strokes. */
export function MessagePickTick({ checked }: { checked: boolean }) {
  return (
    <span
      data-msg-pick-tick
      aria-hidden="true"
      style={checked ? { background: 'hsl(var(--foreground))', borderColor: 'hsl(var(--foreground))' } : { borderColor: 'hsl(var(--foreground) / 0.35)' }}
      className={cn('flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full border transition-colors', checked ? '' : 'border-white/30')}
    >
      {checked && <span className="block h-[6px] w-[10px] -translate-y-px -rotate-45 border-b-2 border-l-2" style={{ borderColor: 'hsl(var(--background))' }} />}
    </span>
  );
}
