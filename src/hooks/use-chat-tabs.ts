import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import {
  BUILTIN_TABS, DEFAULT_TABS, MAX_TABS, getChatTabs, saveChatTabs,
  type ChatTab, type ChatTabsState,
} from '@/lib/api/dehub/chat-tabs';

const KEY = ['dm-chat-tabs'] as const;

/** A tab as the tab row draws it. */
export interface ChatTabView {
  id: string;
  name: string;
  emoji: string;
  builtin: boolean;
  hidden: boolean;
  /** Custom tabs only. */
  chats: string[];
}

export const newTabId = () => `t_${Math.random().toString(36).slice(2, 10)}`;

/** Put the tabs in the person's order, built-ins included, nothing lost. */
export function orderedTabs(state: ChatTabsState, builtinName: (id: string) => string): ChatTabView[] {
  const byId = new Map<string, ChatTabView>();
  for (const id of BUILTIN_TABS) byId.set(id, { id, name: builtinName(id), emoji: '', builtin: true, hidden: id !== 'all' && state.hidden.includes(id), chats: [] });
  for (const t of state.tabs) byId.set(t.id, { id: t.id, name: t.name, emoji: t.emoji, builtin: false, hidden: false, chats: t.chats });
  const out: ChatTabView[] = [];
  for (const id of state.order) { const t = byId.get(id); if (t) { out.push(t); byId.delete(id); } }
  return [...out, ...byId.values()];
}

/**
 * Your Chat tabs, saved on the server so web and the app show the same ones.
 * Every change shows at once and rolls back if the save fails.
 */
export function useChatTabs() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: getChatTabs, enabled: isAuthenticated, staleTime: 60_000 });
  const state = data ?? DEFAULT_TABS;

  const commit = useCallback(async (change: (s: ChatTabsState) => ChatTabsState) => {
    const before = queryClient.getQueryData<ChatTabsState>(KEY) ?? DEFAULT_TABS;
    const next = change(before);
    queryClient.setQueryData<ChatTabsState>(KEY, next);
    try {
      const saved = await saveChatTabs(next);
      if (saved) queryClient.setQueryData<ChatTabsState>(KEY, saved);
    } catch {
      queryClient.setQueryData<ChatTabsState>(KEY, before);
      toast.error(t('chatTabs.saveFailed', "Couldn't save your tabs, try again"));
    }
  }, [queryClient, t]);

  const builtinName = useCallback((id: string) => ({
    all: t('chatTabs.all', 'All'),
    direct: t('chatTabs.direct', 'Direct'),
    communities: t('chatTabs.communities', 'Communities'),
    requests: t('chatTabs.requests', 'Requests'),
  } as Record<string, string>)[id] ?? id, [t]);

  const tabs = useMemo(() => orderedTabs(state, builtinName), [state, builtinName]);

  const api = useMemo(() => ({
    canAdd: state.tabs.length < MAX_TABS,
    /** Make a tab; returns its id. */
    create: (tab: Omit<ChatTab, 'id'>) => {
      const id = newTabId();
      void commit(s => ({ ...s, tabs: [...s.tabs, { ...tab, id }], order: [...s.order.filter(x => x !== id), id] }));
      return id;
    },
    update: (id: string, patch: Partial<Omit<ChatTab, 'id'>>) =>
      commit(s => ({ ...s, tabs: s.tabs.map(x => (x.id === id ? { ...x, ...patch } : x)) })),
    remove: (id: string) =>
      commit(s => ({ ...s, tabs: s.tabs.filter(x => x.id !== id), order: s.order.filter(x => x !== id) })),
    /** Put a chat in a tab, or take it out. */
    toggleChat: (tabId: string, chatId: string) =>
      commit(s => ({
        ...s,
        tabs: s.tabs.map(x => (x.id !== tabId ? x : {
          ...x, chats: x.chats.includes(chatId) ? x.chats.filter(c => c !== chatId) : [...x.chats, chatId],
        })),
      })),
    addChats: (tabId: string, chatIds: string[]) =>
      commit(s => ({ ...s, tabs: s.tabs.map(x => (x.id !== tabId ? x : { ...x, chats: [...new Set([...x.chats, ...chatIds])] })) })),
    setHidden: (id: string, hidden: boolean) =>
      commit(s => ({ ...s, hidden: hidden ? [...new Set([...s.hidden, id])] : s.hidden.filter(x => x !== id) })),
    /** The full tab order, as ids. */
    reorder: (ids: string[]) => commit(s => ({ ...s, order: ids })),
  }), [commit, state.tabs.length]);

  return { tabs, state, ...api };
}
