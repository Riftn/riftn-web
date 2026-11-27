import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatSearchDiscover } from '../ChatSearchDiscover';
import type { DeHubUser } from '@/lib/api/dehub';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o: Record<string, unknown> = {}) =>
      String(o.defaultValue ?? _k).replace(/\{\{(\w+)\}\}/g, (_, n) => String(o[n] ?? '')),
  }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

const communities = [{ id: 'c1', name: "Jake's Garage", slug: 'jakes-garage', member_count: 2400, banner_url: null, avatar_url: null }];
const query: Record<string, unknown> = {};
for (const m of ['select', 'or', 'order']) query[m] = vi.fn(() => query);
query.limit = vi.fn(async () => ({ data: communities, error: null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => query) } }));

const users = [
  { _id: 'u1', address: '0x1', displayName: 'Jake Rivers', username: 'jakeriv' },
  { _id: 'u2', address: '0x2', displayName: 'Jake T', username: 'jaket', dmSettings: { disables: ['NEW_DM'] } },
] as unknown as DeHubUser[];

function setup(over: Partial<Parameters<typeof ChatSearchDiscover>[0]> = {}) {
  const props = { query: 'jake', users, usersLoading: false, onMessageUser: vi.fn(), onNewChat: vi.fn(), onNewGroup: vi.fn(), ...over };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><ChatSearchDiscover {...props} /></MemoryRouter>
    </QueryClientProvider>,
  );
  return props;
}

beforeEach(() => navigate.mockClear());

describe('ChatSearchDiscover', () => {
  it('offers matching people, communities and ways to start something', async () => {
    const props = setup();
    expect(await screen.findByText("Jake's Garage")).toBeTruthy();
    expect(query.or).toHaveBeenCalledWith('name.ilike.%jake%,slug.ilike.%jake%');

    fireEvent.click(screen.getByTitle('Jake Rivers'));
    expect(props.onMessageUser).toHaveBeenCalledWith(users[0]);
    // People who turned new DMs off can't be picked.
    expect((screen.getByTitle('DMs disabled') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText("Jake's Garage"));
    expect(navigate).toHaveBeenCalledWith('/app/communities/jakes-garage?tab=chat');

    fireEvent.click(screen.getByText('New group'));
    expect(props.onNewGroup).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Search all of Riftn for "jake"'));
    expect(navigate).toHaveBeenCalledWith('/app/explore?q=jake');
  });

  it('still gives ways forward when nothing matches anywhere', async () => {
    (query.limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [], error: null });
    const props = setup({ users: [] });
    expect(await screen.findByText('Nothing matches "jake" yet. Start something new.')).toBeTruthy();
    fireEvent.click(screen.getByText('New chat'));
    expect(props.onNewChat).toHaveBeenCalled();
  });
});
