import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StoryShelf } from './StoryShelf';
import { setActivityBarHidden, setActivityItemsHidden } from '@/lib/activity-shelf-preferences';

const prefs = vi.hoisted(() => ({ storiesEnabled: true, hiddenBadge: false, seen: false }));
const actions = vi.hoisted(() => ({ openLive: vi.fn(), openCreator: vi.fn(), openViewer: vi.fn(), mute: vi.fn(), block: vi.fn() }));
vi.mock('@/hooks/use-mute-author', () => ({ useMuteAuthor: () => ({ muteAuthor: actions.mute }) }));
vi.mock('@/hooks/use-block-author', () => ({ useBlockAuthor: () => ({ blockAuthor: actions.block }) }));
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
vi.mock('@/hooks/use-global-drop-zone', () => ({ useGlobalDropZone: () => ({ openPostModal: vi.fn() }) }));
vi.mock('@/components/app/feeds/LiveNowBar', () => ({
  useLiveNowItems: () => ({ items: [{ wallet: 'host', id: '1', kind: 'stage', title: 'Live now' }], open: actions.openLive }),
  faceUrlOf: () => null,
}));
vi.mock('@/store/storiesStore', () => ({
  useStoriesStore: (pick: (state: typeof actions) => unknown) => pick(actions),
}));
vi.mock('@/lib/media-url', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/media-url')>(),
  buildAvatarUrl: (_address: string, url: string) => url,
}));
vi.mock('@/hooks/use-story-shelf', () => ({
  useStoryShelf: () => ({ data: { askedHosts: 'host', liveHosts: ['host'], shelf: [{
    author: { address: 'reader', username: 'creator', displayName: 'River Song', avatarImageUrl: '/portrait.jpg' }, seen: prefs.seen, items: [
      { id: 'seen', status: 'ready', type: 'photo', mediaUrl: '/seen.jpg', viewed: true },
      { status: 'ready', type: 'video', mediaUrl: '/private.mp4', posterUrl: '/mature.jpg', isMature: true },
      { id: 'clip', status: 'ready', type: 'video', mediaUrl: '/clip.mp4', posterUrl: '/opening.jpg' },
    ],
  }] } }),
}));

it('uses the author portrait and keeps mature content out of the viewer queue', () => {
  prefs.storiesEnabled = true;
  const view = render(<StoryShelf />);
  const tile = screen.getByRole('button', { name: 'River Song' });
  expect([...tile.querySelectorAll('[data-st-portrait-media] img')].map(img => img.getAttribute('src'))).toEqual(['/portrait.jpg']);
  fireEvent.click(tile);
  expect(actions.openViewer.mock.lastCall?.[0][0].items.map((item: { id: string }) => item.id)).toEqual(['seen', 'clip']);
  prefs.storiesEnabled = false;
  view.rerender(<StoryShelf />);
  expect(screen.queryByRole('button', { name: 'River Song' })).toBeNull();
  expect(view.container.querySelector('[data-kind="me"]')).toBeNull();
  expect(screen.getByRole('button', { name: 'Live now' })).toBeTruthy();
});

it('opens the stage context menu from the keyboard and joins the selected stage', async () => {
  prefs.storiesEnabled = true;
  render(<StoryShelf />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Live now' }), { key: 'F10', shiftKey: true });
  expect(await screen.findByRole('menuitem', { name: 'Hide live' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: 'Hide story' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Join' }));
  expect(actions.openLive).toHaveBeenCalledWith(expect.objectContaining({ id: '1', kind: 'stage' }));
});

it('hides a story without hiding live activity and can restore the full bar', async () => {
  prefs.storiesEnabled = true;
  const view = render(<StoryShelf />);
  try {
    fireEvent.contextMenu(screen.getByRole('button', { name: 'River Song' }));
    expect(await screen.findByRole('menuitem', { name: 'Watch' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Mute Account' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Block Creator' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide story' }));
    expect(screen.queryByRole('button', { name: 'River Song' })).toBeNull();
    const live = screen.getByRole('button', { name: 'Live now' });
    fireEvent.contextMenu(live);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide activity bar' }));
    expect(screen.queryByRole('button', { name: 'Live now' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show activity bar' }));
    expect(screen.getByRole('button', { name: 'Live now' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'River Song' })).toBeNull();
  } finally {
    view.unmount();
    setActivityBarHidden(false);
    setActivityItemsHidden(['story:seen', 'story:clip'], false);
  }
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

it('places the Add a moment tile first and opens the creator directly', () => {
  prefs.storiesEnabled = true;
  const { container } = render(<StoryShelf />);
  const add = screen.getByRole('button', { name: 'Add a moment' });
  expect(container.querySelector('[data-story-shelf]')?.firstElementChild).toBe(add);
  expect(add).toHaveAttribute('data-story-portrait');
  fireEvent.click(add);
  expect(actions.openCreator).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-kind="me"]')).toBeNull();
  const liveAvatar = screen.getByRole('img', { name: 'LIVE' });
  expect(liveAvatar).toHaveAttribute('data-live-orbit', 'shelf');
});

it('keeps the same portrait when its watched state changes', () => {
  prefs.storiesEnabled = true;
  const view = render(<StoryShelf />);
  try {
    const tile = screen.getByRole('button', { name: 'River Song' });
    expect(tile).toHaveAttribute('data-seen', 'false');
    prefs.seen = true;
    view.rerender(<StoryShelf />);
    expect(screen.getByRole('button', { name: 'River Song' })).toBe(tile);
    expect(tile).toHaveAttribute('data-seen', 'true');
    expect(tile).toHaveAccessibleDescription('Watched');
  } finally {
    prefs.seen = false;
  }
});
