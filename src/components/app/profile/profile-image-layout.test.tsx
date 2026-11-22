import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProfileContentToolbar } from './ProfileContentToolbar';
import { EMPTY_PROFILE_FILTERS } from '@/hooks/use-dehub-profile';
import { ProfileTabContent } from './ProfileTabContent';
import { clearProfileViewFlip, ProfileViewModeContext, useProfileViewState } from '@/lib/profile-view-mode';
import type { ComponentProps } from 'react';

vi.mock('@/components/app/cards/ImageCard', () => ({ ImageCard: () => <div data-testid="image-card" /> }));
vi.mock('@/components/app/cards/VideoCard', () => ({ VideoCard: () => <div data-testid="video-card" /> }));
vi.mock('./ProfileMixedGrid', () => ({ ProfileMixedGrid: () => <div data-testid="video-grid" /> }));
vi.mock('./ProfileImageGrid', () => ({ ProfileImageGrid: () => <div data-testid="image-grid" /> }));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

it('migrates a previous tab choice once without overwriting a newer choice', () => {
  sessionStorage.setItem('riftn.profileViewFlips', JSON.stringify({ first: 'list', second: 'grid' }));
  const first = renderHook(() => useProfileViewState('First', 'grid', 'reader'));
  expect(first.result.current.mode).toBe('list');
  expect(JSON.parse(sessionStorage.getItem('riftn.profileViewFlips')!)).toEqual({ second: 'grid' });
  first.unmount();
  const otherReader = renderHook(() => useProfileViewState('First', 'grid', 'other'));
  expect(otherReader.result.current.mode).toBe('grid');
  localStorage.setItem('riftn.profileView.reader.second', 'list');
  expect(renderHook(() => useProfileViewState('Second', 'grid', 'reader')).result.current.mode).toBe('list');
  expect(sessionStorage.getItem('riftn.profileViewFlips')).toBeNull();
});

it('restores the layout after reopening and keeps readers and profiles independent', () => {
  const renderLayout = (reader: string, profile = 'p') => renderHook(() => useProfileViewState(profile, 'grid', reader));
  const first = renderLayout('a');
  act(() => first.result.current.setMode('list'));
  first.unmount();
  expect(renderLayout('a').result.current.mode).toBe('list');
  expect(renderLayout('b').result.current.mode).toBe('grid');
  expect(renderLayout('a', 'p2').result.current.mode).toBe('grid');
  const own = renderLayout('a', 'a');
  act(() => own.result.current.setMode('list'));
  act(() => clearProfileViewFlip('a'));
  expect(own.result.current.mode).toBe('grid');
});

it.each([1, 5])('uses the same toolbar choice across media tabs with %i posts', count => {
  const client = new QueryClient();
  const items = Array.from({ length: count }, (_, id) => ({ id: String(id) }));
  const props = {
    PROFILE_IMAGES: items, ALL_PROFILE_VIDEOS: items,
    ALL_CONTENT: [], PROFILE_POSTS: [], PROFILE_LIVE: [], optimisticPosts: [], plans: [],
  } as unknown as ComponentProps<typeof ProfileTabContent>;
  function Page({ tab }: { tab: 'images' | 'videos' }) {
    const state = useProfileViewState('profile', 'grid', 'reader');
    return (
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <ProfileViewModeContext.Provider value={state}>
            <ProfileContentToolbar
              sort="newest" search="" filters={EMPTY_PROFILE_FILTERS} filtersOpen={false}
              onSortChange={vi.fn()} onSearchChange={vi.fn()} onFiltersChange={vi.fn()}
              onFiltersReset={vi.fn()} onFiltersOpenChange={vi.fn()} showPostType={false}
              showViewToggle resultCount={count} isLoading={false}
            />
            <ProfileTabContent {...props} activeTab={tab} />
          </ProfileViewModeContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  const page = render(<Page tab="images" />);
  expect(page.getByTestId('image-grid')).toBeTruthy();
  fireEvent.click(page.getAllByLabelText('List view')[0]);
  expect(page.getAllByTestId('image-card')).toHaveLength(count);
  page.rerender(<Page tab="videos" />);
  expect(page.getAllByTestId('video-card')).toHaveLength(count);
  fireEvent.click(page.getAllByLabelText('Grid view')[0]);
  expect(page.getByTestId('video-grid')).toBeTruthy();
  page.rerender(<Page tab="images" />);
  expect(page.getByTestId('image-grid')).toBeTruthy();
});
