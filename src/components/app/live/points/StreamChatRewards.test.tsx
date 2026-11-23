import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { StreamChatRewards } from './StreamChatRewards';

const api = vi.hoisted(() => ({ fetch: vi.fn(), watch: vi.fn(), leave: vi.fn() }));
vi.mock('@/lib/api/dehub/live-rewards', () => ({ getStreamRewards: api.fetch }));
vi.mock('@/lib/api/dehub/stream-presence', () => ({ watchLiveRoomEvents: api.watch }));

it('shows the current offers and recent redemptions without opening a sheet, and refreshes on a new redemption', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.watch.mockReturnValue({ leave: api.leave });
  const summary = { live: true, rewards: [{ id: 'one', title: 'Choose a song', cost: 350 }] };
  api.fetch.mockResolvedValue({ ...summary, recentRedemptions: [{ id: 'r1', title: 'Shoutout' }] });
  const ui = (streamId: string) => <QueryClientProvider client={client}><StreamChatRewards streamId={streamId} /></QueryClientProvider>;
  const view = render(ui('room1'));
  expect(await screen.findByText('Choose a song')).toBeVisible();
  expect(screen.getByText('350')).toBeVisible();
  expect(screen.getByText('Shoutout')).toBeVisible();
  api.fetch.mockResolvedValue({ ...summary, recentRedemptions: [{ id: 'r2', title: 'Cheers' }] });
  act(() => api.watch.mock.calls[0][1]({ type: 'reward' }));
  expect(await screen.findByText('Cheers')).toBeVisible();
  api.fetch.mockResolvedValue({ live: true, rewards: [], recentRedemptions: [] });
  view.rerender(ui('room2'));
  await waitFor(() => expect(api.fetch).toHaveBeenCalledWith('room2'));
  expect(screen.queryByText('Cheers')).toBeNull();
  expect(screen.queryByText('Choose a song')).toBeNull();
  view.unmount();
  expect(api.leave).toHaveBeenCalledTimes(2);
  client.clear();
});
