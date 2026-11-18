import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
}));
vi.mock('@/hooks/use-chat-prefs', () => ({ useChatPrefs: () => ({ byId: new Map(), update: vi.fn() }), useClearChatHistory: () => vi.fn(), isArchived: () => false, isMuted: () => false }));
vi.mock('@/hooks/use-public-chat-unread', () => ({ usePublicChatUnreadCount: () => 0, usePublicChatReading: vi.fn() }));
vi.mock('@/hooks/use-dm-realtime', () => ({ useDMRealtime: vi.fn() }));
vi.mock('@/hooks/use-draft', () => ({ useDraftText: () => '' }));
vi.mock('@/hooks/use-keyboard-open', () => ({ useKeyboardOpen: () => false, useVisualViewportBox: () => ({}) }));
vi.mock('@/lib/undoable-delete', () => ({ usePendingDeletes: () => new Set(), scheduleDelete: vi.fn(), undoDelete: vi.fn(), UNDO_WINDOW_MS: 5000 }));
vi.mock('@/lib/api/dehub', () => ({ getAccountInfo: vi.fn(), getMediaUrl: vi.fn() }));
vi.mock('@/lib/api/dehub/dm-socket', () => ({ emitSendMessage: vi.fn() }));
vi.mock('@/lib/api/dehub/blocks', () => ({ blockUser: vi.fn() }));
vi.mock('@/lib/dm-e2ee/keys', () => ({ prepareOutgoing: vi.fn() }));
vi.mock('@/lib/media-url', () => ({ buildAvatarUrl: () => '', extractAvatarPath: () => '' }));
vi.mock('@/components/app/chat', () => ({
  DirectMessageChat: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>Back to messages</button>,
  PublicChat: () => null, NewConversationModal: () => null, NewMessageSelector: () => null,
}));
vi.mock('@/components/app/chat/NewMessageDrawer', () => ({ NewMessageDrawer: () => null }));
vi.mock('@/components/app/page-kit/PageKit', () => ({
  PageIsland: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  IslandAction: () => null,
  usePhonePill: () => false,
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

const at = (url: string) => <MemoryRouter initialEntries={[url]}><MessagesPage /></MemoryRouter>;

describe('opening a chat from a notification link', () => {
  beforeEach(() => {
    source.conversations = [{
      id: 'conversation-1', participants: [], unreadCount: 1,
      createdAt: '2026-10-08T10:00:00Z', updatedAt: '2026-10-08T10:00:00Z',
      otherUser: { address: 'peer', displayName: 'Aaron', username: 'aaron' },
      lastMessage: { id: 'message-1', conversationId: 'conversation-1', sender: { address: 'peer' }, type: 'text', content: 'Hello', createdAt: '2026-10-08T10:00:00Z' },
    }];
  });

  it('opens the chat named by ?conversation=', async () => {
    render(at('/app/messages?conversation=conversation-1'));
    expect(await screen.findByRole('button', { name: 'Back to messages' })).toBeInTheDocument();
  });

  it('stays on the list for a chat it does not have', () => {
    render(at('/app/messages?conversation=someone-else'));
    expect(screen.queryByRole('button', { name: 'Back to messages' })).toBeNull();
    expect(screen.getByRole('button', { name: /Aaron/ })).toBeInTheDocument();
  });
});
