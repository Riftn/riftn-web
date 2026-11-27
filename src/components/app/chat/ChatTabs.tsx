import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, EyeOff, GripVertical, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import * as Ctx from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { CHAT_MENU_CONTENT } from '@/components/app/chat/ChatOptionsMenu';
import { MAX_TAB_NAME } from '@/lib/api/dehub/chat-tabs';
import '@/styles/chat-tabs.css';
import type { ChatTabView } from '@/hooks/use-chat-tabs';
// Settings → Appearance → "Pill tabs in Messages": loads the saved choice onto <html> before the tabs draw.
import '@/lib/messages-pills';
import '@/styles/messages-pills.css';

/*
 * Tabs above the chat list on riftn.com/chat and /app/messages: All, Unread,
 * Direct, Groups, Requests, then the tabs a person makes. The open tab is lit
 * with a glowing underline. Right-click the empty part of the
 * bar (hold it on a phone) to make a tab or edit tabs; the sliders button
 * reorders or hides them. Right-click a tab for its own menu.
 */

const ROW = 'flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-[14px] text-zinc-100 outline-none data-[highlighted]:bg-white/10 data-[disabled]:opacity-40 [&>svg]:h-[17px] [&>svg]:w-[17px] [&>svg]:text-zinc-400';

export interface ChatTabBarProps {
  tabs: ChatTabView[];
  active: string;
  /** Unread chats per tab id. */
  unread: Record<string, number>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onManage: () => void;
  onEdit: (id: string) => void;
  onMove: (id: string, by: -1 | 1) => void;
  onHide: (id: string) => void;
  onDelete: (id: string) => void;
  /** A chat dragged from the list onto a custom tab. */
  onDropChat?: (tabId: string, chatId: string) => void;
  /** Extra classes for the row (padding where it sits inside a header). */
  className?: string;
  /** Pinned to the right end of the row (Archived on /app/messages). */
  trailing?: ReactNode;
  /** Phones: only the chips. The tab menu button sits pinned beside the row instead. */
  bare?: boolean;
}

export const CHAT_DRAG_TYPE = 'application/x-riftn-chat';

export function ChatTabBar(p: ChatTabBarProps) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const visible = p.tabs.filter(x => !x.hidden);
  const custom = p.tabs.filter(x => !x.builtin);

  // Keep the open tab in view when it changes (a new tab lands at the end).
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-chat-tab="${p.active.replace(/"/g, '')}"]`);
    if (!box || !el) return;
    // Sideways only: scrollIntoView would also scroll the page.
    if (el.offsetLeft < box.scrollLeft) box.scrollLeft = el.offsetLeft - 12;
    else if (el.offsetLeft + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = el.offsetLeft + el.offsetWidth - box.clientWidth + 12;
  }, [p.active, p.tabs.length]);

  return (
    <Ctx.ContextMenu>
    <Ctx.ContextMenuTrigger asChild>
    <div
      ref={scroller}
      role="tablist"
      data-chat-tabs
      className={cn('flex shrink-0 items-center gap-1 overflow-x-auto px-3 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', p.className)}
    >
      {visible.map(tab => {
        const n = p.unread[tab.id] || 0;
        const on = p.active === tab.id;
        const i = custom.findIndex(x => x.id === tab.id);
        return (
          <Ctx.ContextMenu key={tab.id}>
            <Ctx.ContextMenuTrigger asChild>
              <button
                type="button"
                role="tab"
                aria-selected={on}
                data-chat-tab={tab.id}
                data-drop={dropOn === tab.id ? '' : undefined}
                onClick={() => p.onSelect(tab.id)}
                onDragOver={tab.builtin || !p.onDropChat ? undefined : (e) => {
                  if (!e.dataTransfer.types.includes(CHAT_DRAG_TYPE)) return;
                  e.preventDefault();
                  setDropOn(tab.id);
                }}
                onDragLeave={() => setDropOn(cur => (cur === tab.id ? null : cur))}
                onDrop={tab.builtin || !p.onDropChat ? undefined : (e) => {
                  const chat = e.dataTransfer.getData(CHAT_DRAG_TYPE);
                  setDropOn(null);
                  if (chat) { e.preventDefault(); p.onDropChat?.(tab.id, chat); }
                }}
              >
                {tab.emoji && <span className="text-[13px] leading-none">{tab.emoji}</span>}
                <span className="whitespace-nowrap">{tab.name}</span>
                {n > 0 && (
                  <span data-chat-tab-unread>
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </button>
            </Ctx.ContextMenuTrigger>
            <Ctx.ContextMenuContent data-chat-tab-menu className={CHAT_MENU_CONTENT}>
              <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                {tab.emoji ? `${tab.emoji} ` : ''}{tab.name}
              </div>
              {tab.builtin ? (
                <>
                  {tab.id !== 'all' && (
                    <Ctx.ContextMenuItem className={ROW} onSelect={() => p.onHide(tab.id)}>
                      <EyeOff />{t('chatTabs.hide', 'Hide tab')}
                    </Ctx.ContextMenuItem>
                  )}
                  <Ctx.ContextMenuItem className={ROW} onSelect={p.onManage}>
                    <SlidersHorizontal />{t('chatTabs.edit', 'Edit tabs')}
                  </Ctx.ContextMenuItem>
                </>
              ) : (
                <>
                  <Ctx.ContextMenuItem className={ROW} onSelect={() => p.onEdit(tab.id)}>
                    <Pencil />{t('chatTabs.renameEdit', 'Rename and edit')}
                  </Ctx.ContextMenuItem>
                  <Ctx.ContextMenuItem className={ROW} onSelect={() => p.onEdit(tab.id)}>
                    <Plus />{t('chatTabs.addChats', 'Add chats')}
                  </Ctx.ContextMenuItem>
                  <Ctx.ContextMenuSeparator className="my-1 h-px bg-white/10" />
                  <Ctx.ContextMenuItem className={ROW} disabled={i <= 0} onSelect={() => p.onMove(tab.id, -1)}>
                    <ChevronLeft />{t('chatTabs.moveLeft', 'Move left')}
                  </Ctx.ContextMenuItem>
                  <Ctx.ContextMenuItem className={ROW} disabled={i >= custom.length - 1} onSelect={() => p.onMove(tab.id, 1)}>
                    <ChevronRight />{t('chatTabs.moveRight', 'Move right')}
                  </Ctx.ContextMenuItem>
                  <Ctx.ContextMenuSeparator className="my-1 h-px bg-white/10" />
                  <Ctx.ContextMenuItem className={cn(ROW, 'text-red-400 [&>svg]:text-red-400')} onSelect={() => p.onDelete(tab.id)}>
                    <Trash2 />{t('chatTabs.delete', 'Delete tab')}
                  </Ctx.ContextMenuItem>
                </>
              )}
            </Ctx.ContextMenuContent>
          </Ctx.ContextMenu>
        );
      })}
      {!p.bare && (<>
      <button
        type="button"
        data-chat-tab-manage
        onClick={p.onManage}
        aria-label={t('chatTabs.edit', 'Edit tabs')}
        title={t('chatTabs.edit', 'Edit tabs')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-white/10 hover:text-white"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>
      {/* Fills the rest of the row so there's room to right-click. */}
      <div aria-hidden className="h-8 min-w-6 flex-1" />
      </>)}
      {p.trailing}
    </div>
    </Ctx.ContextMenuTrigger>
    <Ctx.ContextMenuContent data-chat-tabs-menu className={CHAT_MENU_CONTENT}>
      <Ctx.ContextMenuItem className={ROW} onSelect={p.onNew}>
        <Plus />{t('chatTabs.new', 'New tab')}
      </Ctx.ContextMenuItem>
      <Ctx.ContextMenuItem className={ROW} onSelect={p.onManage}>
        <SlidersHorizontal />{t('chatTabs.edit', 'Edit tabs')}
      </Ctx.ContextMenuItem>
    </Ctx.ContextMenuContent>
    </Ctx.ContextMenu>
  );
}

/** A centred card on computers, a bottom sheet on phones, above the full-screen chat. */
function TabSheet({ title, onClose, children, footer, narrow }: { title?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; narrow?: boolean }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div data-chat-tab-sheet className="fixed inset-0 z-[160] flex items-end justify-center bg-black/55 backdrop-blur-sm md:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'flex max-h-[88dvh] w-full flex-col rounded-t-[26px] border border-white/10 bg-zinc-950 pb-[max(14px,env(safe-area-inset-bottom))] text-white shadow-2xl md:max-h-[640px] md:rounded-[22px] md:pb-3',
          narrow ? 'md:w-[360px]' : 'md:w-[420px]',
        )}
      >
        <div className="mx-auto mt-2 h-[5px] w-10 rounded-full bg-white/20 md:hidden" />
        {title && (
          <div className="flex items-center gap-2 px-5 pb-2 pt-4">
            <h2 className="flex-1 text-[18px] font-bold">{title}</h2>
            <button type="button" onClick={onClose} aria-label={t('common.close', 'Close')} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white">
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">{children}</div>
        {footer && <div className="flex gap-2.5 px-5 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

const BTN = 'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-opacity disabled:opacity-35';
const BTN_W = `${BTN} bg-white text-black`;
const BTN_G = `${BTN} bg-white/[0.07] text-white hover:bg-white/[0.12]`;
const BTN_R = `${BTN} bg-red-500/15 text-red-300 hover:bg-red-500/25`;

/** A chat the tab editor can put in a tab. */
export interface TabCandidate {
  id: string;
  name: string;
  avatar?: string;
  /** Shown under the name: Direct, Group, Channel, Community, Public. */
  kind: string;
  round?: boolean;
}

const EMOJIS = ['💼', '🤝', '🎧', '🎮', '💸', '📈', '🔥', '⭐', '🏠', '🎬', '🌙', '🧪'];

export function ChatTabEditor({ initial, candidates, onSave, onDelete, onClose }: {
  /** Null: a new tab. */
  initial: { id?: string; name: string; emoji: string; chats: string[] } | null;
  candidates: TabCandidate[];
  onSave: (tab: { name: string; emoji: string; chats: string[] }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const editing = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [chats, setChats] = useState<string[]>(initial?.chats ?? []);
  const [q, setQ] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) input.current?.focus(); }, [editing]);
  const ql = q.trim().toLowerCase();
  const shown = candidates.filter(c => !ql || c.name.toLowerCase().includes(ql));
  const ok = name.trim().length > 0;
  const toggle = (id: string) => setChats(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]));
  const save = () => { if (ok) onSave({ name: name.trim(), emoji, chats }); };

  return (
    <TabSheet
      title={editing ? t('chatTabs.editTab', 'Edit tab') : t('chatTabs.new', 'New tab')}
      onClose={onClose}
      footer={(
        <>
          {editing && onDelete && (
            <button type="button" data-chat-tab-delete onClick={onDelete} aria-label={t('chatTabs.delete', 'Delete tab')} className={cn(BTN_R, 'flex-none px-4')}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} className={BTN_G}>{t('common.cancel', 'Cancel')}</button>
          <button type="button" data-chat-tab-save onClick={save} disabled={!ok} className={BTN_W}>
            {editing ? t('common.save', 'Save') : t('chatTabs.create', 'Create tab')}
          </button>
        </>
      )}
    >
      <div className="flex h-12 items-center gap-2.5 rounded-2xl bg-white/[0.06] px-2.5 ring-1 ring-inset ring-white/25">
        <button
          type="button"
          onClick={() => setEmojiOpen(o => !o)}
          aria-label={t('chatTabs.emoji', 'Pick an emoji')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-[17px]"
        >
          {emoji || <Plus className="h-4 w-4 text-zinc-400" />}
        </button>
        <input
          ref={input}
          data-chat-tab-name
          value={name}
          maxLength={MAX_TAB_NAME}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder={t('chatTabs.namePlaceholder', 'Tab name')}
          className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-white outline-none placeholder:text-zinc-500"
        />
        <span className="text-[12px] tabular-nums text-zinc-500">{[...name].length}/{MAX_TAB_NAME}</span>
      </div>
      {emojiOpen && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {EMOJIS.map(e => (
            <button key={e} type="button" onClick={() => { setEmoji(e); setEmojiOpen(false); }} className={cn('flex h-9 w-9 items-center justify-center rounded-xl text-[17px]', emoji === e ? 'bg-white/15 ring-[1.5px] ring-white' : 'bg-white/[0.05] hover:bg-white/10')}>{e}</button>
          ))}
          <button type="button" onClick={() => { setEmoji(''); setEmojiOpen(false); }} aria-label={t('chatTabs.noEmoji', 'No emoji')} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-zinc-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
      )}
      {!editing && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[t('chatTabs.sFriends', 'Friends'), t('chatTabs.sWork', 'Work'), t('chatTabs.sTrading', 'Trading'), t('chatTabs.sCreators', 'Creators'), t('chatTabs.sGaming', 'Gaming')].map(s => (
            <button key={s} type="button" onClick={() => setName(s)} className="h-7 rounded-full bg-white/[0.05] px-2.5 text-[12.5px] font-semibold text-zinc-300 ring-1 ring-inset ring-white/10 hover:bg-white/10">{s}</button>
          ))}
        </div>
      )}
      <div className="mb-2 mt-5 flex items-baseline justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
        {t('chatTabs.chatsInTab', 'Chats in this tab')}
        <span className="text-[12px] normal-case tracking-normal text-zinc-300">{t('chatTabs.picked', '{{n}} picked', { n: chats.length })}</span>
      </div>
      <div className="flex h-10 items-center gap-2 rounded-xl bg-white/[0.05] px-3">
        <Search className="h-4 w-4 text-zinc-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('fullscreenChat.search', 'Search chats')} className="min-w-0 flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-zinc-500" />
      </div>
      <div className="mt-1.5">
        {shown.map(c => {
          const on = chats.includes(c.id);
          return (
            <button key={c.id} type="button" data-chat-tab-pick={c.id} onClick={() => toggle(c.id)} className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left hover:bg-white/[0.04]">
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-white/[0.08] text-[15px] font-bold text-white', c.round ? 'rounded-full' : 'rounded-lg')}>
                {c.avatar ? <img src={c.avatar} alt="" className="h-full w-full object-cover" loading="lazy" /> : c.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                <span className="block text-[12.5px] text-zinc-500">{c.kind}</span>
              </span>
              <span className={cn('flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full', on ? 'bg-white' : 'ring-[1.5px] ring-inset ring-zinc-600')}>
                {on && <span className="block h-[6px] w-[10px] -translate-y-px -rotate-45 border-b-2 border-l-2 border-black" />}
              </span>
            </button>
          );
        })}
        {!shown.length && <p className="py-6 text-center text-[13px] text-zinc-500">{t('chatTabs.noMatch', 'No chats match')}</p>}
      </div>
    </TabSheet>
  );
}

export function ChatTabDeleteConfirm({ tab, onConfirm, onClose }: { tab: ChatTabView; onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <TabSheet
      narrow
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className={BTN_G}>{t('common.cancel', 'Cancel')}</button>
          <button type="button" data-chat-tab-delete-confirm onClick={onConfirm} className={BTN_R}>{t('chatTabs.delete', 'Delete tab')}</button>
        </>
      )}
    >
      <div className="pt-5">
        <h2 className="text-[18px] font-bold">{t('chatTabs.deleteTitle', 'Delete “{{name}}”?', { name: tab.name })}</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">{t('chatTabs.deleteBody', 'The tab goes away. Its chats stay in All and keep their messages.')}</p>
      </div>
    </TabSheet>
  );
}

export function ChatTabsManager({ tabs, onReorder, onHide, onEdit, onDelete, onNew, onClose, canAdd }: {
  tabs: ChatTabView[];
  onReorder: (ids: string[]) => void;
  onHide: (id: string, hidden: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
  canAdd: boolean;
}) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const ids = tabs.map(x => x.id);
  // "All" stays first; everything else can move.
  const move = (id: string, to: number) => {
    const from = ids.indexOf(id);
    if (from < 1 || to < 1 || to >= ids.length) return;
    const next = ids.filter(x => x !== id);
    next.splice(to, 0, id);
    onReorder(next);
  };
  return (
    <TabSheet
      title={t('chatTabs.edit', 'Edit tabs')}
      onClose={onClose}
      footer={<button type="button" onClick={onClose} className={BTN_W}>{t('common.done', 'Done')}</button>}
    >
      <p className="mb-3 text-[13px] text-zinc-500">{t('chatTabs.editHint', 'Drag to reorder. Hidden tabs keep their chats.')}</p>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          data-chat-tab-row={tab.id}
          draggable={i > 0}
          onDragStart={() => setDrag(tab.id)}
          onDragOver={(e) => { if (drag && i > 0) { e.preventDefault(); setOver(tab.id); } }}
          onDrop={(e) => { e.preventDefault(); if (drag) move(drag, i); setDrag(null); setOver(null); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          className={cn(
            'mb-1.5 flex items-center gap-2 rounded-xl bg-white/[0.03] py-2 pl-1.5 pr-1 ring-1 ring-inset ring-white/[0.06]',
            over === tab.id && 'ring-white', drag === tab.id && 'opacity-40', tab.hidden && 'opacity-60',
          )}
        >
          <span className={cn('flex w-6 justify-center text-zinc-600', i > 0 && 'cursor-grab')}>{i > 0 && <GripVertical className="h-4 w-4" />}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold">{tab.emoji ? `${tab.emoji} ` : ''}{tab.name}</span>
            <span className="block text-[12px] text-zinc-500">
              {tab.builtin ? t('chatTabs.builtIn', 'Built in') : t('chatTabs.chatCount', '{{n}} chats', { n: tab.chats.length })}
            </span>
          </span>
          {i > 0 && (
            <>
              <button type="button" aria-label={t('chatTabs.moveUp', 'Move up')} disabled={i <= 1} onClick={() => move(tab.id, i - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label={t('chatTabs.moveDown', 'Move down')} disabled={i >= tabs.length - 1} onClick={() => move(tab.id, i + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
            </>
          )}
          {i === 0 ? (
            <span className="px-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-600">{t('chatTabs.alwaysOn', 'Always on')}</span>
          ) : tab.builtin ? (
            <button type="button" data-chat-tab-hide={tab.id} aria-label={tab.hidden ? t('chatTabs.show', 'Show tab') : t('chatTabs.hide', 'Hide tab')} onClick={() => onHide(tab.id, !tab.hidden)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10">
              {tab.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          ) : (
            <>
              <button type="button" aria-label={t('chatTabs.renameEdit', 'Rename and edit')} onClick={() => onEdit(tab.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10"><Pencil className="h-4 w-4" /></button>
              <button type="button" aria-label={t('chatTabs.delete', 'Delete tab')} onClick={() => onDelete(tab.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </>
          )}
        </div>
      ))}
      {canAdd && (
        <button type="button" onClick={onNew} className={cn(BTN_G, 'mt-2 w-full flex-none')}><Plus className="h-4 w-4" />{t('chatTabs.new', 'New tab')}</button>
      )}
    </TabSheet>
  );
}

/** A custom tab with nothing in it yet. */
export function ChatTabEmpty({ tab, onAdd }: { tab: ChatTabView; onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div data-chat-tab-empty className="px-7 py-10 text-center">
      <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-[24px] ring-1 ring-inset ring-white/10">{tab.emoji || '🗂️'}</div>
      <h3 className="text-[17px] font-bold text-white">{t('chatTabs.emptyTitle', '{{name}} is empty', { name: tab.name })}</h3>
      <p className="mx-auto mb-4 mt-1.5 max-w-[260px] text-[14px] leading-relaxed text-zinc-500">{t('chatTabs.emptyBody', 'Add chats here and they stay in All too.')}</p>
      <button type="button" onClick={onAdd} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[14px] font-bold text-black"><Plus className="h-4 w-4" />{t('chatTabs.addChats', 'Add chats')}</button>
    </div>
  );
}
