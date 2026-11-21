import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StoryShelf } from './StoryShelf';

const prefs = vi.hoisted(() => ({ storiesEnabled: true }));
vi.mock('@/hooks/use-stories-enabled', () => ({ useStoriesEnabled: () => prefs }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, walletAddress: 'owner' }) }));
vi.mock('@/hooks/use-mature-content', () => ({ useMatureContent: () => ({ showMatureContent: false }) }));
vi.mock('@/hooks/use-kids-mode', () => ({ useKidsModeLock: () => false }));
vi.mock('@/components/app/feeds/LiveNowBar', () => ({
  useLiveNowItems: () => ({ items: [{ wallet: 'host', id: '1', kind: 'stage', title: 'Live now' }] }),
  pictureOf: () => null, faceUrlOf: () => null,
}));
vi.mock('@/hooks/use-story-shelf', () => ({
  useStoryShelf: () => ({ data: { liveHosts: ['host'], shelf: [{
    author: { address: 'reader', username: 'creator' }, items: [
      { status: 'ready', type: 'photo', mediaUrl: '/seen.jpg', viewed: true },
      { status: 'ready', type: 'video', mediaUrl: '/private.mp4', posterUrl: '/mature.jpg', isMature: true },
      { status: 'ready', type: 'video', mediaUrl: '/clip.mp4', posterUrl: '/opening.jpg' },
    ],
  }] } }),
}));

it('uses the opening visible story poster and keeps live broadcasts when Stories are hidden', () => {
  prefs.storiesEnabled = true;
  const view = render(<StoryShelf />);
  expect(screen.getByRole('listitem', { name: 'creator' }).querySelector('[data-blur]')).toHaveStyle({
    backgroundImage: 'url("/opening.jpg")',
  });
  prefs.storiesEnabled = false;
  view.rerender(<StoryShelf />);
  expect(screen.queryByRole('listitem', { name: 'creator' })).toBeNull();
  expect(view.container.querySelector('[data-kind="me"]')).toBeNull();
  expect(screen.getByRole('listitem', { name: 'Live now' })).toBeTruthy();
});
