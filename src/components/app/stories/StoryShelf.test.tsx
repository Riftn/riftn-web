import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StoryShelf } from './StoryShelf';
import { setActivityBarHidden, setActivityItemsHidden } from '@/lib/activity-shelf-preferences';

const prefs = vi.hoisted(() => ({ storiesEnabled: true, hiddenBadge: false }));
const actions = vi.hoisted(() => ({ openLive: vi.fn(), mute: vi.fn(), block: vi.fn() }));
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
vi.mock('@/hooks/use-story-shelf', () => ({
  useStoryShelf: () => ({ data: { askedHosts: 'host', liveHosts: ['host'], shelf: [{
    author: { address: 'reader', username: 'creator', displayName: 'River Song' }, items: [
      { id: 'seen', status: 'ready', type: 'photo', mediaUrl: '/seen.jpg', viewed: true },
      { status: 'ready', type: 'video', mediaUrl: '/private.mp4', posterUrl: '/mature.jpg', isMature: true },
      { id: 'clip', status: 'ready', type: 'video', mediaUrl: '/clip.mp4', posterUrl: '/opening.jpg' },
    ],
  }] } }),
}));

it('shows the visible Moments as small covers when there is room, and keeps lives when Stories are hidden', () => {
  prefs.storiesEnabled = true;
  const view = render(<StoryShelf />);
  const covers = [...screen.getByRole('listitem', { name: 'River Song' }).querySelectorAll('[data-st-stack] img')].map(img => img.getAttribute('src'));
  expect(covers).toEqual(['/seen.jpg', '/opening.jpg']);
  prefs.storiesEnabled = false;
  view.rerender(<StoryShelf />);
  expect(screen.queryByRole('listitem', { name: 'River Song' })).toBeNull();
  expect(view.container.querySelector('[data-kind="me"]')).toBeNull();
  expect(screen.getByRole('listitem', { name: 'Live now' })).toBeTruthy();
});

it('opens the stage context menu from the keyboard and joins the selected stage', async () => {
  prefs.storiesEnabled = true;
  render(<StoryShelf />);
  fireEvent.keyDown(screen.getByRole('listitem', { name: 'Live now' }), { key: 'F10', shiftKey: true });
  expect(await screen.findByRole('menuitem', { name: 'Hide live' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: 'Hide story' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Join' }));
  expect(actions.openLive).toHaveBeenCalledWith(expect.objectContaining({ id: '1', kind: 'stage' }));
});

it('hides a story without hiding live activity and can restore the full bar', async () => {
  prefs.storiesEnabled = true;
  const view = render(<StoryShelf />);
  try {
    fireEvent.contextMenu(screen.getByRole('listitem', { name: 'River Song' }));
    expect(await screen.findByRole('menuitem', { name: 'Watch' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Mute Account' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Block Creator' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide story' }));
    expect(screen.queryByRole('listitem', { name: 'River Song' })).toBeNull();
    const live = screen.getByRole('listitem', { name: 'Live now' });
    fireEvent.contextMenu(live);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide activity bar' }));
    expect(screen.queryByRole('listitem', { name: 'Live now' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show activity bar' }));
    expect(screen.getByRole('listitem', { name: 'Live now' })).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: 'River Song' })).toBeNull();
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

it('gives every pill a face, a name and a line', () => {
  prefs.storiesEnabled = true;
  const { container } = render(<StoryShelf />);
  for (const kind of ['live', 'person']) {
    const tile = container.querySelector(`[data-kind="${kind}"]`);
    expect(tile?.querySelector('[data-st-line]')).toBeTruthy();
    expect(tile?.querySelector('[data-st-avatar]')).toBeTruthy();
    expect(tile?.querySelector('[data-st-label]')).toBeTruthy();
  }
  const liveAvatar = screen.getByRole('img', { name: 'LIVE' });
  expect(liveAvatar.querySelector('[data-st-avatar]')).toBeTruthy();
  expect(liveAvatar).toHaveAttribute('data-live-orbit', 'shelf');
  expect(container.querySelector('[data-kind="person"] [data-live-orbit]')).toBeNull();
  // Your own tile only shows with a Moment up; the Create tile leads the row.
  expect(container.querySelector('[data-kind="me"]')).toBeNull();
  expect(screen.getByRole('listitem', { name: 'Create' })).toHaveAttribute('aria-haspopup', 'menu');
});
