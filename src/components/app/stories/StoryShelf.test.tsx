import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StoryShelf } from './StoryShelf';

const prefs = vi.hoisted(() => ({ storiesEnabled: true, hiddenBadge: false }));
vi.mock('@/hooks/use-badge-balance', () => ({
  useBadgeBalance: (address: string) => ({
    displayName: address === 'host' ? 'Stage Host' : undefined,
    hideBadgeAndBalance: prefs.hiddenBadge,
  }),
  useBadgeVisual: () => ({ url: '/tier.png', name: 'Dolphin' }),
}));
vi.mock('@/hooks/use-stories-enabled', () => ({ useStoriesEnabled: () => prefs }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'owner' }) }));
vi.mock('@/hooks/use-mature-content', () => ({ useMatureContent: () => ({ showMatureContent: false }) }));
vi.mock('@/hooks/use-kids-mode', () => ({ useKidsModeLock: () => false }));
vi.mock('@/components/app/feeds/LiveNowBar', () => ({
  useLiveNowItems: () => ({ items: [{ wallet: 'host', id: '1', kind: 'stage', title: 'Live now' }] }),
  faceUrlOf: () => null,
}));
vi.mock('@/hooks/use-story-shelf', () => ({
  useStoryShelf: () => ({ data: { liveHosts: ['host'], shelf: [{
    author: { address: 'reader', username: 'creator', displayName: 'River Song' }, items: [
      { status: 'ready', type: 'photo', mediaUrl: '/seen.jpg', viewed: true },
      { status: 'ready', type: 'video', mediaUrl: '/private.mp4', posterUrl: '/mature.jpg', isMature: true },
      { status: 'ready', type: 'video', mediaUrl: '/clip.mp4', posterUrl: '/opening.jpg' },
    ],
  }] } }),
}));

it('uses the opening visible story poster and keeps live broadcasts when Stories are hidden', () => {
  prefs.storiesEnabled = true;
  const view = render(<StoryShelf />);
  expect(screen.getByRole('listitem', { name: 'River Song' }).querySelector('[data-st-bg]')).toHaveStyle({
    backgroundImage: 'url("/opening.jpg")',
  });
  prefs.storiesEnabled = false;
  view.rerender(<StoryShelf />);
  expect(screen.queryByRole('listitem', { name: 'River Song' })).toBeNull();
  expect(view.container.querySelector('[data-kind="me"]')).toBeNull();
  expect(screen.getByRole('listitem', { name: 'Live now' })).toBeTruthy();
});

it('labels moments and live hosts with their display name and visible badge', () => {
  prefs.storiesEnabled = true;
  prefs.hiddenBadge = false;
  const view = render(<StoryShelf />);
  for (const name of ['River Song', 'Stage Host']) {
    const caption = screen.getByText(name).parentElement;
    expect(caption?.querySelector('img')).toHaveAttribute('alt', 'Dolphin');
  }
  expect(screen.queryByText('@creator')).toBeNull();
  prefs.hiddenBadge = true;
  view.rerender(<StoryShelf />);
  expect(screen.queryByAltText('Dolphin')).toBeNull();
});

it('provides the cover, avatar and badge slots across the carousel', () => {
  prefs.storiesEnabled = true;
  const { container } = render(<StoryShelf />);
  for (const kind of ['me', 'live', 'person']) {
    const tile = container.querySelector(`[data-kind="${kind}"]`);
    expect(tile?.querySelector('[data-st-bg]')).toBeTruthy();
    expect(tile?.querySelector('[data-st-avatar]')).toBeTruthy();
    expect(tile?.querySelector('[data-st-label]')).toBeTruthy();
  }
  expect(container.querySelector('[data-kind="live"] [data-st-live]')).toHaveTextContent('LIVE');
  expect(container.querySelector('[data-kind="me"] [data-st-plus-corner]')).toBeTruthy();
});
