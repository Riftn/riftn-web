import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmojiPanel } from '@/components/app/emoji/EmojiPanel';
import { InlineEmoji } from '@/components/app/emoji/EmojiText';
import { ChatReactorsList, reactionEntries, reactorCount, type ReactorsSource } from './ChatReactorsList';
import { ReactorFaces } from './ReactorFaces';
import '@/styles/chat-hold.css';

export interface MessageMenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  /** Drawn after a hairline, for the last group (Delete, Select). */
  divided?: boolean;
  /** Keyboard hint on the right, e.g. "R". */
  hint?: string;
}

export interface MessageMenuProps {
  /** Where the right-click landed; null keeps the menu closed. */
  point: { x: number; y: number } | null;
  onClose: () => void;
  quickReactions: readonly string[] | null;
  mine?: readonly string[];
  onReact?: (emoji: string) => void;
  /** The chevron that opens every emoji. */
  allowMore?: boolean;
  actions: MessageMenuAction[];
  /** Who reacted: a row on top of the list that opens the people inside the menu. */
  reactors?: ReactorsSource | null;
  /** A muted line at the foot of the card, e.g. the full send time. */
  meta?: string | null;
  /** What the menu is for, read out by screen readers. Defaults to "Message options". */
  label?: string;
}

const MENU_W = 248;
const EDGE = 10;
const EASE = [0.2, 0.9, 0.25, 1] as const;

const keep = (event: SyntheticEvent) => event.stopPropagation();
const KEEP = {
  onClick: keep, onPointerDown: keep, onPointerUp: keep, onMouseDown: keep, onMouseUp: keep,
  onContextMenu: (e: SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); },
  onWheel: keep, onKeyDown: keep,
};

/**
 * The right-click menu for a chat message on a computer, in the shape people
 * know from Telegram: a capsule of quick reactions above the card (the arrow
 * opens every emoji), then the actions. On top of Telegram's, a line that
 * carries reactions shows who left them right in the menu: faces and a count,
 * and a click lists the people with a filter per reaction, without leaving
 * the chat.
 *
 * Opens at the pointer, flips to stay on screen, grows from the corner nearest
 * the pointer. Arrow keys move through the actions, Enter picks, Esc closes.
 */
export function MessageMenu({ point, onClose, quickReactions, mine = [], onReact, allowMore = true, actions, reactors, meta, label }: MessageMenuProps) {
  const { t } = useTranslation();
  const open = !!point;
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'main' | 'emoji' | 'people'>('main');
  const [focus, setFocus] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number; originX: string; originY: string } | null>(null);

  const reactionList = reactionEntries(reactors?.reactions);
  const people = reactorCount(reactors?.reactions);
  const showReactors = !!reactors && people > 0;
  const showEmoji = !!quickReactions && !!onReact;

  useEffect(() => {
    if (!open) return;
    setView('main');
    setFocus(-1);
  }, [open, point?.x, point?.y]);

  // Place against the real size: below-right of the pointer, flipped left or
  // up when that would leave the window, never closer than EDGE to a side.
  useLayoutEffect(() => {
    if (!point) { setPos(null); return; }
    const el = wrapRef.current;
    const w = el?.offsetWidth || MENU_W;
    const h = el?.offsetHeight || 360;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const flipX = point.x + w + EDGE > vw;
    const flipY = point.y + h + EDGE > vh && point.y - h - EDGE > 0;
    let left = flipX ? point.x - w : point.x;
    let top = flipY ? point.y - h : point.y;
    left = Math.max(EDGE, Math.min(left, vw - w - EDGE));
    top = Math.max(EDGE, Math.min(top, vh - h - EDGE));
    setPos({ left, top, originX: flipX ? 'right' : 'left', originY: flipY ? 'bottom' : 'top' });
  }, [point, view, actions.length, showReactors]);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onScroll = (e: Event) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (view !== 'main') setView('main');
        else close();
        return;
      }
      if (view !== 'main') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocus((f) => {
          const n = actions.length;
          if (!n) return -1;
          return e.key === 'ArrowDown' ? (f + 1) % n : (f - 1 + n) % n;
        });
        return;
      }
      if (e.key === 'Enter' && focus >= 0 && actions[focus]) {
        e.preventDefault();
        actions[focus].onSelect();
        close();
        return;
      }
      // Single-letter shortcuts shown on the right of a row.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        const hit = actions.find((a) => a.hint && a.hint.toLowerCase() === e.key.toLowerCase());
        if (hit) { e.preventDefault(); hit.onSelect(); close(); }
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, close, view, actions, focus]);

  useEffect(() => {
    if (focus < 0) return;
    cardRef.current?.querySelectorAll<HTMLButtonElement>('[data-msg-menu-item]')[focus]?.focus({ preventScroll: true });
  }, [focus]);

  const pick = (emoji: string) => {
    onReact?.(emoji);
    close();
  };

  if (typeof document === 'undefined') return null;
  const actionRows = actions.map((a, i) => (
    <div key={a.key}>
      {a.divided && i > 0 && <div className="mx-3 my-1 h-px" data-msg-menu-rule />}
      <button
        type="button"
        role="menuitem"
        data-msg-menu-item={a.destructive ? 'danger' : ''}
        onMouseEnter={() => setFocus(i)}
        onClick={() => { a.onSelect(); close(); }}
        className="group flex w-full items-center gap-3 rounded-[10px] px-3 py-[7px] text-left text-[14px] font-medium outline-none"
      >
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center opacity-85 [&>svg]:h-[18px] [&>svg]:w-[18px]">{a.icon}</span>
        <span className="min-w-0 flex-1 truncate">{a.label}</span>
        {a.hint && <kbd className="ml-2 font-sans text-[11px] font-semibold opacity-40">{a.hint}</kbd>}
      </button>
    </div>
  ));

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="msg-menu"
          ref={wrapRef}
          role="menu"
          aria-label={label ?? t('chatHold.title', 'Message options')}
          data-msg-menu
          data-no-navigate
          {...KEEP}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: pos ? 1 : 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
          transition={{ duration: 0.16, ease: EASE }}
          style={{
            position: 'fixed',
            left: pos?.left ?? point!.x,
            top: pos?.top ?? point!.y,
            width: view === 'emoji' ? 340 : MENU_W,
            zIndex: 260,
            transformOrigin: pos ? `${pos.originX} ${pos.originY}` : 'left top',
          }}
          className="flex flex-col gap-1.5"
        >
          {showEmoji && view === 'main' && (
            <div className="flex items-center gap-0.5 self-stretch rounded-full px-1.5 py-1" data-msg-menu-surface data-msg-menu-emoji>
              {quickReactions!.slice(0, 6).map((emoji, i) => (
                <motion.button
                  key={emoji}
                  type="button"
                  onClick={() => pick(emoji)}
                  aria-pressed={mine.includes(emoji)}
                  initial={{ opacity: 0, y: 6, scale: 0.6 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.02 + i * 0.022, type: 'spring', stiffness: 520, damping: 24 }}
                  whileHover={{ scale: 1.28, y: -2 }}
                  whileTap={{ scale: 0.9 }}
                  className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-[22px] leading-none"
                  data-msg-menu-chip={mine.includes(emoji) ? 'on' : ''}
                >
                  {emoji}
                </motion.button>
              ))}
              {allowMore && (
                <button
                  type="button"
                  onClick={() => setView('emoji')}
                  aria-label={t('emojiPicker.moreReactions')}
                  className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform hover:scale-110"
                  data-msg-menu-chip
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          <div ref={cardRef} className="overflow-hidden rounded-[16px] p-1" data-msg-menu-surface>
            {view === 'emoji' && (
              <div>
                <button type="button" onClick={() => setView('main')} className="mb-1 flex items-center gap-1 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold" data-msg-menu-item>
                  <ChevronLeft className="h-4 w-4" />{t('common.back', 'Back')}
                </button>
                <div className="overflow-hidden rounded-xl">
                  <EmojiPanel selected={[...mine]} onSelect={(emoji) => pick(emoji)} />
                </div>
              </div>
            )}

            {view === 'people' && reactors && (
              <div className="flex max-h-[360px] flex-col">
                <button type="button" onClick={() => setView('main')} className="mb-1 flex shrink-0 items-center gap-1 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold" data-msg-menu-item>
                  <ChevronLeft className="h-4 w-4" />
                  {t('reactionInfo.title')}
                  <span className="font-normal opacity-50">· {people}</span>
                </button>
                <ChatReactorsList {...reactors} compact onNavigate={close} className="min-h-0 flex-1" />
              </div>
            )}

            {view === 'main' && (
              <>
                {showReactors && (
                  <>
                    <button
                      type="button"
                      onClick={() => setView('people')}
                      data-msg-menu-item
                      data-msg-menu-reactors
                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-[7px] text-left text-[14px] font-medium outline-none"
                    >
                      <span className="flex shrink-0 items-center -space-x-0.5">
                        {reactionList.slice(0, 3).map(([emoji]) => (
                          <InlineEmoji key={emoji} value={emoji} className="h-[18px] m-0" />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {t('msgMenu.reactions', { count: people, defaultValue: people === 1 ? '1 reaction' : '{{count}} reactions' })}
                      </span>
                      <ReactorFaces source={reactors} size={20} />
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                    </button>
                    <div className="mx-3 my-1 h-px" data-msg-menu-rule />
                  </>
                )}
                {actionRows}
                {meta && (
                  <>
                    <div className="mx-3 my-1 h-px" data-msg-menu-rule />
                    <p className="px-3 pb-1 pt-0.5 text-[11.5px] font-medium opacity-50">{meta}</p>
                  </>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
