import { fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { StoryViewer } from './StoryViewer';
import type { ShelfEntry } from '@/lib/api/dehub/stories';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock('@/hooks/use-story-shelf', () => ({ useRefreshStoryShelf: () => vi.fn() }));

it('tracks existing Moments per author when advancing, rewinding and switching creators', () => {
  const createdAt = new Date(Date.now() - 3600000).toISOString();
  const entry = (address: string, ids: string[]): ShelfEntry => ({
    author: { address, username: address, displayName: address, avatarImageUrl: null },
    own: false, following: false, seen: false, latestAt: createdAt,
    items: ids.map(id => ({
      id, type: 'video', mediaUrl: '/video.mp4', mentions: [], createdAt,
      audience: 'public', status: 'ready', expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }) as ShelfEntry['items'][number]),
  });
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
