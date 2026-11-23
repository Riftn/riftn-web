import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PostSwipeSlide } from '@/components/app/cards/PostSwipeSlide';
import { toReelShort } from '@/lib/profile-reel';

const state = vi.hoisted(() => ({ kids: false, navigate: vi.fn() }));
vi.mock('@/hooks/use-kids-mode', () => ({ useKidsModeLock: () => state.kids }));
vi.mock('react-router-dom', async (load) => ({ ...await load<typeof import('react-router-dom')>(), useNavigate: () => state.navigate }));
vi.mock('react-i18next', async (load) => ({ ...await load<typeof import('react-i18next')>(), useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
afterEach(() => { cleanup(); state.kids = false; state.navigate.mockClear(); });

function show(mature: boolean, paid: boolean) {
  const row = { tokenId: 42, postType: 'short', contentRating: mature ? 'mature' : 'safe', streamInfo: { isPayPerView: paid } };
  return render(<PostSwipeSlide short={toReelShort(row, 0)!} isActive />);
}

it.each([false, true])('shows the mature notice and opens normal post detail (paid=%s)', (paid) => {
  const { container } = show(true, paid);
  expect(screen.getByText('Mature content')).toBeTruthy();
  expect(screen.queryByText('Open to unlock')).toBeNull();
  expect(container.querySelector('img, video')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open post' }));
  expect(state.navigate).toHaveBeenCalledWith('/app/post/42', { state: { fromFeed: true } });
});

it('omits the mature-post action in Kids Mode', () => {
  state.kids = true;
  show(true, false);
  expect(screen.getByText('Mature content')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});

it('keeps the unlock action on an ordinary paid post', () => {
  show(false, true);
  expect(screen.getByRole('button', { name: 'Open to unlock' })).toBeTruthy();
});
