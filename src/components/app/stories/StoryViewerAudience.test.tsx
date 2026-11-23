import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { StoryViewer } from './StoryViewer';
import { getStory, type ShelfEntry } from '@/lib/api/dehub/stories';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'viewer' }) }));
vi.mock('@/hooks/use-story-shelf', () => ({ useRefreshStoryShelf: () => vi.fn() }));
vi.mock('@/lib/api/dehub/stories', () => ({ getStory: vi.fn() }));
vi.mock('./story-reply', () => ({ sendStoryReply: vi.fn() }));

it('loads current restricted media on open and drops the image when fresh authorization fails', async () => {
  const author = { address: 'owner', username: 'owner', displayName: 'Owner', avatarImageUrl: null };
  const moment = {
    id: 'story', audience: 'selected', type: 'photo', status: 'ready', durationMs: 5000,
    mentions: [], createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    mediaUrl: '/expired.jpg',
  } as ShelfEntry['items'][number];
  const entry = { author, own: false, items: [moment], following: true, seen: false, latestAt: moment.createdAt };
  const fresh = { ...moment, mediaUrl: '/signed.jpg' };
  vi.mocked(getStory).mockResolvedValueOnce({ author, item: fresh }).mockRejectedValueOnce(new Error('Moment not found'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const close = vi.fn();
  const view = render(<MemoryRouter><QueryClientProvider client={client}>
    <StoryViewer entries={[entry]} startAuthor={0} startItem={0} onClose={close} />
  </QueryClientProvider></MemoryRouter>);
  expect(document.querySelector('img[src="/expired.jpg"]')).toBeNull();
  await waitFor(() => expect(document.querySelector('img[src="/signed.jpg"]')).toBeTruthy());
  expect(getStory).toHaveBeenCalledWith('story', true);
  await act(() => client.refetchQueries({ queryKey: ['private-story-playback', 'story', 'viewer'] }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(document.querySelector('img[src="/signed.jpg"]')).toBeNull();
  view.unmount();
  client.clear();
});
