import { fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { StoryViewer } from './StoryViewer';
import { addStoryComment, getStoryComments, type ShelfEntry } from '@/lib/api/dehub/stories';
import { sendStoryReply } from './story-reply';

const { auth } = vi.hoisted(() => ({ auth: { isAuthenticated: false, walletAddress: 'viewer' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('./story-reply', () => ({ sendStoryReply: vi.fn() }));
vi.mock('@/lib/api/dehub/stories', async (load) => ({
  ...await load<typeof import('@/lib/api/dehub/stories')>(),
  addStoryComment: vi.fn(),
  getStoryComments: vi.fn(),
  markStoryViewed: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  auth.isAuthenticated = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
vi.mock('@/hooks/use-story-shelf', () => ({ useRefreshStoryShelf: () => vi.fn() }));

function entry(address: string, ids: string[]): ShelfEntry {
  const createdAt = new Date(Date.now() - 3600000).toISOString();
  return {
    author: { address, username: address, displayName: address, avatarImageUrl: null },
    own: false, following: false, seen: false, latestAt: createdAt,
    items: ids.map(id => ({
      id, address, type: 'video', mediaUrl: '/video.mp4', mentions: [], createdAt,
      posterUrl: null, overlayUrl: null, width: null, height: null, durationMs: 10000,
      muted: true, caption: null, song: null, allowReplies: true, viewed: false, liked: false,
      audience: 'everyone', status: 'ready', expiresAt: new Date(Date.now() + 3600000).toISOString(),
    })),
  };
}

it('tracks existing Moments per author when advancing, rewinding and switching creators', () => {
  const client = new QueryClient();
  const view = render(<MemoryRouter><QueryClientProvider client={client}>
    <StoryViewer entries={[entry('first', ['one', 'two', 'three']), entry('second', ['four'])]}
      startAuthor={0} startItem={1} onClose={vi.fn()} />
  </QueryClientProvider></MemoryRouter>);
  const tracks = () => [...document.querySelectorAll<HTMLElement>('[data-sv-timing] > span')]
    .map(track => track.dataset.played === 'true' ? 'complete' : track.querySelector('i')?.style.transform ?? 'pending');
  expect(tracks()).toEqual(['complete', 'scaleX(0)', 'pending']);
  const video = document.querySelector('video')!;
  Object.defineProperty(video, 'duration', { value: 10 });
  video.currentTime = 4;
  fireEvent.timeUpdate(video);
  expect(tracks()).toEqual(['complete', 'scaleX(0.4)', 'pending']);
  fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  expect(tracks()).toEqual(['scaleX(0)', 'pending', 'pending']);
  for (let i = 0; i < 3; i++) fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  expect(tracks()).toEqual(['scaleX(0)']);
  view.unmount();
  client.clear();
});


it.each([false, true])('keeps private replies and comments separate (docked=%s)', async (docked) => {
  auth.isAuthenticated = true;
  vi.stubGlobal('matchMedia', () => ({ matches: docked }));
  vi.mocked(sendStoryReply).mockResolvedValue('sent');
  vi.mocked(getStoryComments).mockResolvedValue({ comments: [], commentCount: 0, allowComments: true, next: null });
  vi.mocked(addStoryComment).mockResolvedValue({
    id: 'comment', text: 'Public', createdAt: new Date().toISOString(),
    author: entry('viewer', ['mine']).author,
    canDelete: true, isCreator: false,
  });
  const client = new QueryClient();
  const view = render(<MemoryRouter><QueryClientProvider client={client}>
    <StoryViewer entries={[entry('author', ['moment'])]} startAuthor={0} startItem={0} onClose={vi.fn()} />
  </QueryClientProvider></MemoryRouter>);

  const message = view.getByPlaceholderText('Send a private reply…');
  fireEvent.change(message, { target: { value: 'Private' } });
  fireEvent.keyDown(message, { key: 'Enter' });
  await waitFor(() => expect(message).toHaveValue(''));
  expect(sendStoryReply).toHaveBeenCalledTimes(1);
  expect(sendStoryReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'moment' }), 'Private', expect.any(String));
  expect(addStoryComment).not.toHaveBeenCalled();

  fireEvent.click(view.getByRole('button', { name: 'Comments' }));
  const comment = await view.findByPlaceholderText('Add a comment for everyone');
  fireEvent.change(comment, { target: { value: 'Public' } });
  fireEvent.keyDown(comment, { key: 'Enter' });
  await waitFor(() => expect(addStoryComment).toHaveBeenCalledWith('moment', 'Public', undefined));
  expect(sendStoryReply).toHaveBeenCalledTimes(1);
  view.unmount();
  client.clear();
});
