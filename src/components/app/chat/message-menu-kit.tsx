import { useCallback, useState } from 'react';
import { CheckCircle2, Copy, CornerUpLeft, CornerUpRight, Download, Flag, Image as ImageIcon, Languages, MoreHorizontal, Pencil, Pin, PinOff, Search, ShieldBan, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { translateCopy } from '@/i18n/copy';
import { copyMedia, type CopyMediaKind } from '@/lib/copy-media';

/** One line-icon set for every chat's right-click menu, so DMs, groups and live chat read the same. */
export const menuIcons = {
  reply: <CornerUpLeft />,
  edit: <Pencil />,
  pin: <Pin />,
  unpin: <PinOff />,
  copy: <Copy />,
  copyMedia: <ImageIcon />,
  forward: <CornerUpRight />,
  delete: <Trash2 />,
  select: <CheckCircle2 />,
  translate: <Languages />,
  search: <Search />,
  ban: <ShieldBan />,
  unban: <ShieldCheck />,
  download: <Download />,
  report: <Flag />,
};

type CopyT = (key: string, opts: { defaultValue: string }) => string;

/** "Copy media" for a photo, GIF or video in any chat, with the toast that says what landed on the clipboard. */
export function copyMediaWithToast(url: string, kind: CopyMediaKind, t: CopyT) {
  void copyMedia(url, kind).then(
    (result) => toast.success(result === 'image'
      ? (kind === 'gif' ? t('chatHold.gifCopied', { defaultValue: 'GIF copied' }) : t('chatHold.imageCopied', { defaultValue: 'Image copied' }))
      : t('chatHold.mediaLinkCopied', { defaultValue: 'Link copied' })),
    () => toast.error(t('chatHold.copyFailed', { defaultValue: "Couldn't copy" })),
  );
}

/** "Today at 10:19", "Yesterday at 22:01" or "12 Nov at 09:30", plus "edited" when it was. */
export function messageMenuMeta(when: Date | string | undefined, edited?: boolean) {
  if (!when) return null;
  const date = typeof when === 'string' ? new Date(when) : when;
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = sameDay(date, today)
    ? translateCopy('msgMenu.today', { defaultValue: 'Today' })
    : sameDay(date, yesterday)
      ? translateCopy('msgMenu.yesterday', { defaultValue: 'Yesterday' })
      : date.toLocaleDateString([], { day: 'numeric', month: 'short', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  const line = translateCopy('msgMenu.sentAt', { defaultValue: '{{day}} at {{time}}', day, time });
  return edited ? `${line} · ${translateCopy('msgMenu.edited', { defaultValue: 'edited' })}` : line;
}

/**
 * Right-clicks the browser should keep: a link (Copy link address, open in a
 * new tab) and text the reader has selected inside this message (Copy just
 * that part). Everything else on a message opens the message menu.
 */
export function keepBrowserMenu(target: Element, row: Element | null) {
  if (target.closest('a[href], input, textarea, [contenteditable="true"]')) return true;
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  if (selection && !selection.isCollapsed && row && selection.anchorNode && row.contains(selection.anchorNode)) return true;
  return false;
}

/** Where a message's right-click menu is open, kept mounted after the first open so it can animate out. */
export function useMenuPoint() {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const openAt = useCallback((p: { x: number; y: number }) => { setMounted(true); setPoint(p); }, []);
  const close = useCallback(() => setPoint(null), []);
  return { point, mounted, openAt, close };
}

/**
 * The one button a message keeps: a small "..." that shows on hover or
 * keyboard focus and opens the same menu as a right-click, under itself.
 * Every action lives in that menu, so the row needs nothing else. Phones never
 * see it (chat-hold.css hides [data-chat-hover-actions] on touch); a hold
 * opens the sheet there.
 */
export function MessageMoreButton({ onOpen, className = '' }: {
  onOpen: (point: { x: number; y: number }, button: HTMLElement) => void;
  className?: string;
}) {
  const label = translateCopy('common.more', { defaultValue: 'More' });
  return (
    <button
      type="button"
      data-chat-hover-actions
      data-msg-more
      aria-label={label}
      aria-haspopup="menu"
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        onOpen({ x: Math.round(r.left), y: Math.round(r.bottom + 4) }, e.currentTarget);
      }}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-zinc-500 opacity-0 transition-opacity hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] hover:text-white focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 ${className}`}
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
}
