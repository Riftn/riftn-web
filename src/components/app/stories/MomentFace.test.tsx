import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MomentFace } from './MomentFace';
import { useStoriesStore } from '@/store/storiesStore';
import { getStoryRings, getUserStories } from '@/lib/api/dehub/stories';

const ELLA = '0x6666666666666666666666666666666666666661';
const NOBODY = '0x6666666666666666666666666666666666666664';

vi.mock('@/hooks/use-stories-enabled', () => ({ useStoriesEnabled: () => ({ storiesEnabled: true }) }));
vi.mock('@/lib/api/dehub/stories', () => ({
  getStoryRings: vi.fn(async (addresses: string[]) => ({
    rings: {},
    peeks: Object.fromEntries(addresses.filter(a => a === ELLA).map(a => [a, { state: 'unseen', count: 2, cover: '/cover.jpg' }])),
  })),
  getUserStories: vi.fn(async () => ({
    author: { address: ELLA, username: 'ellaverse', displayName: 'Ella Verse', avatarImageUrl: null },
    items: [
      { id: 'a', status: 'ready', type: 'photo', mediaUrl: '/a.jpg', posterUrl: '/a.jpg', viewed: true, createdAt: '2026-11-23T10:00:00Z' },
      { id: 'b', status: 'ready', type: 'photo', mediaUrl: '/b.jpg', posterUrl: '/b.jpg', viewed: false, createdAt: '2026-11-23T11:00:00Z' },
    ],
  })),
}));

beforeEach(() => {
  useStoriesStore.setState({ viewer: null });
  vi.mocked(getUserStories).mockClear();
});

afterEach(() => localStorage.removeItem('riftn.blurMomentPreviews'));

it('puts the Moment on the corner of the face and a tap opens it instead of the row', async () => {
  const onRow = vi.fn();
  const { container } = render(
    <button type="button" onClick={onRow}>
      <MomentFace address={ELLA} size={48} name="Ella"><span>face</span></MomentFace>
    </button>,
  );
  await waitFor(() => expect(container.querySelector('[data-moment-peek="unseen"] img')).toHaveAttribute('src', '/cover.jpg'));
  fireEvent.click(container.querySelector('[data-moment-face]')!);
  await waitFor(() => expect(useStoriesStore.getState().viewer?.entries[0].items).toHaveLength(2));
  expect(getUserStories).toHaveBeenCalledWith(ELLA, false);
  expect(onRow).not.toHaveBeenCalled();
});

it('leaves faces with nothing up alone, in one request for the whole list', async () => {
  vi.mocked(getStoryRings).mockClear();
  const onRow = vi.fn();
  const { container } = render(
    <>
      <button type="button" onClick={onRow}><MomentFace address={NOBODY} size={48}><span>face</span></MomentFace></button>
      <MomentFace address="0x6666666666666666666666666666666666666665" size={48}><span>face</span></MomentFace>
    </>,
  );
  await waitFor(() => expect(getStoryRings).toHaveBeenCalledTimes(1));
  expect(container.querySelector('[data-moment-peek]')).toBeNull();
  fireEvent.click(container.querySelector('button span span')!);
  expect(onRow).toHaveBeenCalled();
  expect(getUserStories).not.toHaveBeenCalled();
});

it('draws no corner thumbnail on profiles but a tap still opens their Moments', async () => {
  useStoriesStore.setState({ viewer: null });
  const { container } = render(
    <MomentFace address={ELLA} size={96} noPeek name="Ella"><span>face</span></MomentFace>,
  );
  await waitFor(() => expect(container.querySelector('[data-moment-face="unseen"]')).not.toBeNull());
  expect(container.querySelector('[data-moment-peek]')).toBeNull();
  expect(container.querySelector('[data-moment-count]')).toBeNull();
  fireEvent.click(container.querySelector('[data-moment-face]')!);
  await waitFor(() => expect(useStoriesStore.getState().viewer?.entries[0].items).toHaveLength(2));
});

it.each(['unseen', 'seen'] as const)('covers a %s preview until it is opened', async state => {
  const address = state === 'seen' ? '0x6666666666666666666666666666666666666666' : '0x6666666666666666666666666666666666666667';
  localStorage.setItem('riftn.blurMomentPreviews', '1');
  vi.mocked(getStoryRings).mockResolvedValueOnce({
    rings: {},
    peeks: { [address]: { state, count: 2, cover: '/cover.jpg' } },
  });
  const { container } = render(<MomentFace address={address} size={48}><span>face</span></MomentFace>);
  await waitFor(() => expect(container.querySelector(`[data-moment-peek="${state}"] [data-moment-peek-blank]`)).toBeTruthy());
  expect(container.querySelector('[data-moment-peek] img')).toBeNull();
  fireEvent.click(container.querySelector('[data-moment-face]')!);
  await waitFor(() => expect(useStoriesStore.getState().viewer?.entries[0].items).toHaveLength(2));
});
