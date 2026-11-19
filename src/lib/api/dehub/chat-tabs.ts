import { apiCall } from './core';

/** Tabs every person has. "All" can never be hidden. */
export const BUILTIN_TABS = ['all', 'unread', 'direct', 'communities', 'requests'] as const;
export type BuiltinTabId = (typeof BUILTIN_TABS)[number];

export interface ChatTab {
  id: string;
  name: string;
  emoji: string;
  /** DM ids, `community:<uuid>` for group/community chats, `public` for Public Chat. */
  chats: string[];
}

export interface ChatTabsState {
  tabs: ChatTab[];
  /** Every tab id in display order, built-ins included. */
  order: string[];
  /** Built-in tabs the person hid. */
  hidden: string[];
}

export const DEFAULT_TABS: ChatTabsState = { tabs: [], order: [...BUILTIN_TABS], hidden: [] };
export const MAX_TABS = 10;
export const MAX_TAB_NAME = 20;
/** The id Public Chat has inside a tab. */
export const PUBLIC_CHAT_TAB_ID = 'public';

export async function getChatTabs(): Promise<ChatTabsState> {
  const res = await apiCall<{ result?: ChatTabsState }>('/api/dm/chat-tabs', { requiresAuth: true });
  const r = res?.result;
  return r && Array.isArray(r.tabs) ? r : DEFAULT_TABS;
}

export async function saveChatTabs(state: ChatTabsState): Promise<ChatTabsState> {
  const res = await apiCall<{ result: ChatTabsState }>('/api/dm/chat-tabs', {
    method: 'PUT',
    body: state as unknown as Record<string, unknown>,
    requiresAuth: true,
  });
  return res.result;
}
