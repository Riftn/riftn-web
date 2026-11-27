import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { MomentReplyPreview } from './MomentReplyPreview';

const fixture = vi.hoisted(() => ({ item: { isMature: false, expired: false, status: 'ready', type: 'photo', mediaUrl: '/still.jpg', expiresAt: '' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'viewer' }) }));
vi.mock('@/hooks/use-kids-mode', () => ({ useKidsModeLock: () => false }));
vi.mock('@/hooks/use-mature-content', () => ({ useMatureContent: () => ({ showMatureContent: false }) }));
vi.mock('@/lib/api/dehub/stories', () => ({ getStory: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { item: fixture.item, author: { displayName: 'River Song' } }, isSuccess: true }) }));
afterEach(() => { vi.useRealTimers(); });
it('keeps Moment art hidden and removes the author at expiry while keeping the permalink', () => {
  vi.useFakeTimers();
  fixture.item.expiresAt = new Date(Date.now() + 2000).toISOString();
  fixture.item.isMature = false;
  const { container } = render(<MemoryRouter><MomentReplyPreview id="story" /></MemoryRouter>);
  expect(screen.getByText('River Song')).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
  act(() => vi.advanceTimersByTime(2005));
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByText('River Song')).toBeNull();
  expect(screen.getByRole('link')).toHaveAttribute('href', '/app/moment/story?reply=1');
});
it('withholds mature moment art and identity in a restricted session', () => {
  fixture.item.expiresAt = new Date(Date.now() + 2000).toISOString();
  fixture.item.isMature = true;
  const { container } = render(<MemoryRouter><MomentReplyPreview id="story" /></MemoryRouter>);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByText('River Song')).toBeNull();
});
