import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import MessagesIcon from '@/components/ui/cut-icons/messages';
import { cn } from '@/lib/utils';

/** Full-screen shells on the page right now; <body> is marked while any is up. */
let shellsUp = 0;

/**
 * Messages with nothing else on screen, at riftn.com/chat.
 *
 * Computers: the chat list on the left, the open chat on the right, both kept
 * mounted, so switching threads never reloads the list. Phones: one column at
 * a time; the chat slides in over the list and Back slides it away.
 *
 * `inline` is for the state gallery, which frames the shell in a fixed box
 * inside its own page instead of letting it take the window.
 */
export function FullScreenChatShell({
  list,
  chat,
  chatOpen,
  style,
  inline = false,
}: {
  list: ReactNode;
  chat: ReactNode | null;
  chatOpen: boolean;
  style?: CSSProperties;
  inline?: boolean;
}) {
  const { t: _copy } = _useCopy();
  const shellRef = useRef<HTMLDivElement>(null);
  const [listShare, setListShare] = useState<number | null>(null);
  const resizeList = (clientX: number) => {
    const bounds = shellRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    setListShare(Math.min(60, Math.max(25, (clientX - bounds.left) / bounds.width * 100)));
  };
  // index.css lifts menus and sheets above this layer while it is up.
  useLayoutEffect(() => {
    if (inline) return;
    shellsUp += 1;
    document.body.setAttribute('data-fullscreen-chat-up', '');
    return () => {
      shellsUp -= 1;
      if (shellsUp <= 0) { shellsUp = 0; document.body.removeAttribute('data-fullscreen-chat-up'); }
    };
  }, [inline]);
  return (
    <div
      id={inline ? undefined : 'app-root'}
      data-fullscreen-chat
      ref={shellRef}
      style={style}
      className={cn(
        'flex overflow-hidden bg-black text-white',
        inline ? 'relative h-[680px] w-full rounded-3xl border border-white/10' : 'fixed inset-0 z-[70] h-[100dvh]',
      )}
    >
      <aside
        data-fsc-list
        style={listShare === null ? undefined : { '--chat-list-width': `${listShare}%` } as CSSProperties}
        className={cn(
          'relative z-10 flex h-full min-h-0 w-full flex-col md:w-[var(--chat-list-width,clamp(18rem,30vw,26.5rem))] md:shrink-0 md:border-r md:border-white/[0.07]',
          chatOpen && 'max-md:hidden',
        )}
      >
        {list}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={_copy('fullscreenChat.resizeList', { defaultValue: 'Resize conversation list' })}
          aria-valuemin={25}
          aria-valuemax={60}
          aria-valuenow={Math.round(listShare ?? 30)}
          tabIndex={0}
          className="group absolute inset-y-0 -right-1 z-10 hidden w-2 cursor-col-resize touch-none select-none outline-none md:block"
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeList(event.clientX);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const current = listShare ?? event.currentTarget.parentElement!.offsetWidth / (shellRef.current?.clientWidth || 1) * 100;
            setListShare(Math.min(60, Math.max(25, current + (event.key === 'ArrowLeft' ? -2 : 2))));
          }}
        >
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-current opacity-0 group-hover:opacity-25 group-focus-visible:opacity-50" />
        </div>
      </aside>
      <section
        data-fsc-chat
        data-fsc-chat-open={chatOpen ? '' : undefined}
        className={cn('relative flex h-full min-h-0 min-w-0 flex-1 flex-col', !chatOpen && 'max-md:hidden')}
      >
        {chat ?? (
          <div data-chat-wallpaper className="flex h-full items-center justify-center">
            {/* The 2D line icon, like the rest of the full-screen chat. */}
            <div data-fsc-empty className="flex max-w-xs flex-col items-center text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300">
                <MessagesIcon className="h-7 w-7" />
              </span>
              <p className="text-[17px] font-semibold text-white">{_copy('fullscreenChat.pickTitle', { defaultValue: 'Pick a chat' })}</p>
              <p className="mt-1 text-sm text-zinc-400">{_copy('fullscreenChat.pickBody', { defaultValue: 'Choose a conversation on the left, or start a new one.' })}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
