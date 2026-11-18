import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserMentionDropdown } from '@/components/app/mentions/UserMentionDropdown';

const { apiCallMock, communityRows } = vi.hoisted(() => ({ apiCallMock: vi.fn(), communityRows: { current: [] as unknown[] } }));

// The community lookup: a chain that ends in the rows the test sets.
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'order']) chain[m] = () => chain;
  chain.limit = () => Promise.resolve({ data: communityRows.current, error: null });
  return { supabase: { from: () => chain } };
});

vi.mock('@/lib/api/dehub/core', () => ({ apiCall: apiCallMock }));
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <>{children}</> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
}));
vi.mock('@/components/app/VerifiedBadge', () => ({ VerifiedBadge: () => null }));
vi.mock('@/components/app/AppState', () => ({ AppState: () => null }));
vi.mock('@/lib/media-url', () => ({ buildAvatarUrl: () => null, storageImage: (u: string) => u }));
vi.mock('@/lib/assistant', () => ({
  ASSISTANT_AVATAR: '',
  isAssistantAddress: () => false,
}));

describe('user mention touch selection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiCallMock.mockResolvedValue({
      result: [{ username: 'alice', displayName: 'Alice', address: '0xalice' }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    communityRows.current = [];
  });

  it('selects at touch-start before a keyboard resize can move the row', async () => {
    const onSelect = vi.fn();
    // The row now carries a badge: it links to the glossary and resolves
    // through a cached query, so the dropdown needs router and query context
    // the way every other list that draws one does.
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <UserMentionDropdown
            query="ali"
            isOpen
            position={{ top: 0, left: 0 }}
            selectedIndex={0}
            onSelectedIndexChange={vi.fn()}
            onSelect={onSelect}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    fireEvent.touchStart(screen.getByRole('button', { name: 'Mention @alice' }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ username: 'alice' }));
  });

  it('lists communities and pages after people, each typing its own link', async () => {
    communityRows.current = [
      { id: 'c1', name: 'Leaders Club', slug: 'leaders', avatar_url: null, member_count: 42, is_private: false, kind: 'community' },
      { id: 'c2', name: 'Lead group', slug: 'leadgroup', avatar_url: null, member_count: 3, is_private: false, kind: 'group' },
    ];
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <UserMentionDropdown
            query="lead"
            isOpen
            position={{ top: 0, left: 0 }}
            selectedIndex={0}
            onSelectedIndexChange={vi.fn()}
            onSelect={onSelect}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    // Groups are private chats and never offered.
    expect(screen.queryByRole('button', { name: 'Link Lead group' })).toBeNull();
    fireEvent.touchStart(screen.getByRole('button', { name: 'Link Leaders Club' }));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'community',
      insertText: 'https://riftn.com/app/communities/leaders',
    }));

    fireEvent.touchStart(screen.getByRole('button', { name: 'Link Leaderboard' }));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'page',
      insertText: 'https://riftn.com/app/leaderboard',
    }));
  });
});
