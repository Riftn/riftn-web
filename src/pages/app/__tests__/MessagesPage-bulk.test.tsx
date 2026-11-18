import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { DeHubConversation } from '@/lib/api/dehub';

const source = vi.hoisted(() => ({ conversations: [] as DeHubConversation[] }));

vi.mock('@/contexts/AuthContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/contexts/AuthContext')>(), useAuth: () => ({ isAuthenticated: true, walletAddress: 'me' }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/use-messages', () => ({
  useConversations: () => ({ conversations: source.conversations, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateConversation: () => ({}),
  useUserSearchForDM: () => ({}),
  useDeleteConversation: () => ({}),
  messagesKeys: { messages: (id: string) => ['dm', id], conversations: () => ['dm'] },
}));
const layout = vi.hoisted(() => ({ phone: false }));
const prefs = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/hooks/use-chat-prefs', () => ({ useChatPrefs: () => ({ byId: new Map(), update: prefs.update }), useClearChatHistory: () => vi.fn(), isArchived: () => false, isMuted: () => false }));
vi.mock('@/hooks/use-public-chat-unread', () => ({ usePublicChatUnreadCount: () => 0, usePublicChatReading: vi.fn() }));
vi.mock('@/hooks/use-dm-realtime', () => ({ useDMRealtime: vi.fn() }));
vi.mock('@/hooks/use-draft', () => ({ useDraftText: () => '' }));
vi.mock('@/hooks/use-keyboard-open', () => ({ useKeyboardOpen: () => false, useVisualViewportBox: () => ({}) }));
const del = vi.hoisted(() => ({ scheduleDelete: vi.fn(), undoDelete: vi.fn() }));
vi.mock('@/lib/undoable-delete', () => ({ usePendingDeletes: () => new Set(), scheduleDelete: del.scheduleDelete, undoDelete: del.undoDelete, UNDO_WINDOW_MS: 5000 }));
vi.mock('@/lib/api/dehub', () => ({ getAccountInfo: vi.fn(), getMediaUrl: vi.fn() }));
const sock = vi.hoisted(() => ({ emitSendMessage: vi.fn(async () => ({})), waitForDmSocket: vi.fn(async () => undefined) }));
vi.mock('@/lib/api/dehub/dm-socket', () => sock);
vi.mock('@/lib/api/dehub/blocks', () => ({ blockUser: vi.fn() }));
vi.mock('@/lib/dm-e2ee/keys', () => ({ prepareOutgoing: vi.fn(async (_peer: string, text: string) => ({ content: text, encrypted: false })) }));
vi.mock('@/lib/media-url', () => ({ buildAvatarUrl: () => '', extractAvatarPath: () => '' }));
vi.mock('@/components/app/chat', () => ({
  DirectMessageChat: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>Back to messages</button>,
  PublicChat: () => null, NewConversationModal: () => null, NewMessageSelector: () => null,
}));
vi.mock('@/components/app/chat/NewMessageDrawer', () => ({ NewMessageDrawer: () => null }));
vi.mock('@/components/app/page-kit/PageKit', () => ({
  PageIsland: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  IslandAction: () => null,
  usePhonePill: () => layout.phone,
}));
vi.mock('@/components/app/war/WarHudIcon', () => ({ BrandIcon: () => null }));
vi.mock('@/components/app/AppState', () => ({ AppState: () => null }));
vi.mock('@/components/app/DhbAmount', () => ({ DhbCoin: () => null }));
vi.mock('@/components/app/VerifiedBadge', () => ({ VerifiedBadge: () => null }));
vi.mock('@/components/app/BadgeIcon', () => ({ BadgeIcon: () => null }));
vi.mock('@/components/app/LiveRipple', () => ({ LiveRipple: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/app/chat/OnlineDot', () => ({ OnlineDot: () => null }));
vi.mock('@/components/app/chat/NewGroupChannelSheet', () => ({ NewGroupChannelSheet: () => null }));
vi.mock('@/components/app/chat/GroupChatRow', () => ({ GroupChatRow: () => null }));
vi.mock('@/hooks/use-communities', () => ({ useUserCommunities: () => ({ data: [] }) }));
vi.mock('@/lib/community-kinds', () => ({ chatsFromMemberships: () => [] }));
vi.mock('@/components/app/AuthGate', () => ({ AuthGate: () => null }));
vi.mock('@/components/SEOHead', () => ({ SEOHead: () => null }));
vi.mock('@/components/ui/swipeable-row', () => ({ SwipeableRow: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

import MessagesPage from '../MessagesPage';

// jsdom has no DOMRect, which Radix's right-click menu uses to place itself.
type RectInit = { x?: number; y?: number; width?: number; height?: number };
const g = globalThis as unknown as { DOMRect?: { fromRect?: (r?: RectInit) => unknown } };
if (!g.DOMRect?.fromRect) {
  g.DOMRect = {
    fromRect: ({ x = 0, y = 0, width = 0, height = 0 }: RectInit = {}) =>
      ({ x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON: () => ({}) }),
  };
}

// jsdom has no elementFromPoint, which the scroll-freeze watchdog calls on a timer.
if (typeof document.elementFromPoint !== 'function') document.elementFromPoint = () => null;

const chat = (id: string, name: string): DeHubConversation => ({
  id, participants: [], unreadCount: 0,
  createdAt: '2026-11-17T10:00:00Z', updatedAt: '2026-11-17T10:00:00Z',
  otherUser: { address: `0x${id}`, displayName: name, username: name.toLowerCase() },
  lastMessage: { id: `m-${id}`, conversationId: id, sender: { address: `0x${id}` }, type: 'text', content: `hi from ${name}`, createdAt: '2026-11-17T10:00:00Z' },
} as DeHubConversation);

const page = () => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/chat']}><MessagesPage fullscreen /></MemoryRouter>
  </QueryClientProvider>
);
const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

describe('picking several chats on a computer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    source.conversations = [chat('a', 'Aaron'), chat('b', 'Bea'), chat('c', 'Cleo')];
  });

  it('right-click offers Select, then clicks add chats and the bar acts on all of them', async () => {
    render(page());
    fireEvent.contextMenu(row('Aaron'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /chatMenu.select/ }));
    fireEvent.click(row('Bea'));
    const bar = await screen.findByRole('toolbar');
    expect(within(bar).getByText('chatBulk.selected')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-bulk-checked="true"]')).toHaveLength(2);

    fireEvent.click(bar.querySelector('[data-chat-bulk-unread]')!);
    expect(prefs.update).toHaveBeenCalledWith('a', { unread: true });
    expect(prefs.update).toHaveBeenCalledWith('b', { unread: true });
    expect(prefs.update).not.toHaveBeenCalledWith('c', expect.anything());
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('Ctrl-click starts picking, and Delete removes every picked chat with one undo', async () => {
    render(page());
    fireEvent.click(row('Aaron'), { ctrlKey: true });
    fireEvent.click(row('Cleo'));
    fireEvent.click(document.querySelector('[data-chat-bulk-delete]')!);
    expect(del.scheduleDelete.mock.calls.map(c => c[0])).toEqual(['a', 'c']);
  });

  it('Reply sends one message to each picked chat', async () => {
    render(page());
    fireEvent.click(row('Aaron'), { ctrlKey: true });
    fireEvent.click(row('Bea'));
    fireEvent.click(document.querySelector('[data-chat-bulk-reply]')!);
    const box = await waitFor(() => {
      const el = document.querySelector('[data-chat-bulk-reply-input]') as HTMLTextAreaElement | null;
      if (!el) throw new Error('no box');
      return el;
    });
    fireEvent.change(box, { target: { value: 'see you at 8' } });
    fireEvent.click(document.querySelector('[data-chat-bulk-reply-send]')!);
    await waitFor(() => expect(sock.emitSendMessage).toHaveBeenCalledTimes(2));
    expect(sock.emitSendMessage).toHaveBeenCalledWith({ dmId: 'a', content: 'see you at 8', type: 'msg' });
    expect(sock.emitSendMessage).toHaveBeenCalledWith({ dmId: 'b', content: 'see you at 8', type: 'msg' });
  });

  it('Esc leaves picking without touching anything', async () => {
    render(page());
    fireEvent.click(row('Aaron'), { ctrlKey: true });
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  });
});

describe('picking several chats on the Messages page (computer, not full screen)', () => {
  const messagesPage = () => (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/app/messages']}><MessagesPage /></MemoryRouter>
    </QueryClientProvider>
  );
  beforeEach(() => {
    vi.clearAllMocks();
    layout.phone = false;
    source.conversations = [chat('a', 'Aaron'), chat('b', 'Bea'), chat('c', 'Cleo')];
  });

  it('the Select button starts picking, then left-clicks tick chats', async () => {
    render(messagesPage());
    fireEvent.click(document.querySelector('[data-chat-select-start]')!);
    const bar = await screen.findByRole('toolbar');
    expect(within(bar).getByText('chatBulk.pick')).toBeInTheDocument();
    fireEvent.click(row('Aaron'));
    fireEvent.click(row('Cleo'));
    expect(document.querySelectorAll('[data-bulk-checked="true"]')).toHaveLength(2);
    fireEvent.click(bar.querySelector('[data-chat-bulk-delete]')!);
    expect(del.scheduleDelete.mock.calls.map(c => c[0])).toEqual(['a', 'c']);
  });

  it('the Select button again stops picking', async () => {
    render(messagesPage());
    const btn = document.querySelector('[data-chat-select-start]')!;
    fireEvent.click(btn);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    fireEvent.click(btn);
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
  });

  it('right-click and Ctrl-click on a row start picking from it', async () => {
    render(messagesPage());
    fireEvent.contextMenu(row('Bea'));
    expect(document.querySelectorAll('[data-bulk-checked="true"]')).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    fireEvent.click(row('Aaron'), { ctrlKey: true });
    expect(document.querySelectorAll('[data-bulk-checked="true"]')).toHaveLength(1);
  });
});

describe('picking several chats on a phone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layout.phone = true;
    // Fake timers also run the app's scroll watchdog, which asks jsdom for a
    // hit-test it does not have.
    if (!document.elementFromPoint) document.elementFromPoint = () => null;
    source.conversations = [chat('a', 'Aaron'), chat('b', 'Bea'), chat('c', 'Cleo')];
  });
  afterEach(() => { layout.phone = false; vi.useRealTimers(); });

  const hold = (el: HTMLElement) => {
    // jsdom has no PointerEvent; a MouseEvent carrying the pointer fields stands in.
    const down = new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 });
    Object.assign(down, { pointerType: 'touch', isPrimary: true, pointerId: 1 });
    fireEvent(el, down);
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent(el, Object.assign(new MouseEvent('pointerup', { bubbles: true }), { pointerType: 'touch', pointerId: 1 }));
    fireEvent.click(el);
  };

  it('holding a chat starts picking without opening it, then taps add more', () => {
    vi.useFakeTimers();
    render(page());
    hold(row('Aaron'));
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.queryByText('Back to messages')).toBeNull();
    fireEvent.click(row('Cleo'));
    expect(document.querySelectorAll('[data-bulk-checked="true"]')).toHaveLength(2);
    fireEvent.click(document.querySelector('[data-chat-bulk-delete]')!);
    expect(del.scheduleDelete.mock.calls.map(c => c[0])).toEqual(['a', 'c']);
  });

  it('a quick tap still opens the chat', () => {
    render(page());
    fireEvent.click(row('Bea'));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
