import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { getStory } from '@/lib/api/dehub/stories';
import { useStoriesStore } from '@/store/storiesStore';
import StoryPermalinkPage from './StoryPermalinkPage';

const id = '0123456789abcdef01234567';
const address = '0x1234567890123456789012345678901234567890';
const auth = vi.hoisted(() => ({ walletAddress: '', isAuthenticated: true, isLoading: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-kids-mode', () => ({ useKidsModeLock: () => false }));
vi.mock('@/hooks/use-mature-content', () => ({ useMatureContent: () => ({ showMatureContent: false }) }));
vi.mock('@/lib/api/dehub/stories', () => ({ getStory: vi.fn() }));
vi.mock('@/components/SEOHead', () => ({ SEOHead: () => null }));

function renderLink(query: string) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/moment/${id}${query}`]}>
        <Routes><Route path="/moment/:id" element={<StoryPermalinkPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.walletAddress = address;
  auth.isAuthenticated = true;
  auth.isLoading = false;
  vi.mocked(getStory).mockReset();
  vi.mocked(getStory).mockResolvedValue({
    author: { address },
    item: { id, status: 'ready', expired: true },
  } as Awaited<ReturnType<typeof getStory>>);
});

it('opens an authorized archived Moment with the comment thread selected', async () => {
  renderLink('?comments=1');
  await waitFor(() => expect(useStoriesStore.getState().viewer?.openComments).toBe(true));
  expect(getStory).toHaveBeenCalledWith(id, true);
});

it('keeps the existing lifetime check for private reply links', async () => {
  const page = renderLink('?reply=1');
  await page.findByText('This moment has ended');
  expect(useStoriesStore.getState().viewer).toBeNull();
});

it('waits for authentication before looking up a comment notification', () => {
  auth.isAuthenticated = false;
  auth.isLoading = true;
  renderLink('?comments=1');
  expect(getStory).not.toHaveBeenCalled();
  expect(useStoriesStore.getState().viewer).toBeNull();
});
