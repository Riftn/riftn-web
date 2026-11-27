import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProfileFollowButton, type ProfileFollowProps } from '@/components/app/profile/ProfileFollowButton';
import { useProfileFollow } from '@/hooks/use-profile-follow';
import { followUser } from '@/lib/api/dehub';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
vi.mock('@/lib/api/dehub', () => ({ followUser: vi.fn(), unfollowUser: vi.fn() }));
afterEach(cleanup);
const props = (): ProfileFollowProps => ({
  profile: { name: 'Creator', isFollowing: false, isPending: false } as ProfileFollowProps['profile'],
  apiProfile: undefined, isViewingOwnProfile: false, isFollowing: false, isPending: false,
  isTargetPrivate: false, isFollowLoading: false, handleFollow: vi.fn(), handleUnfollow: vi.fn(),
});
it('uses the existing follow action and prevents duplicate requests', () => {
  const p = props();
  const { rerender } = render(<ProfileFollowButton {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
  expect(p.handleFollow).toHaveBeenCalledTimes(1);
  rerender(<ProfileFollowButton {...p} isFollowLoading />);
  expect(screen.getByRole('button', { name: 'Follow' })).toBeDisabled();
  rerender(<ProfileFollowButton {...p} isPending />);
  expect(screen.getByRole('button', { name: 'Requested' })).toBeDisabled();
});

it('keeps other profile actions available while a private follow request is sent', async () => {
  let finish!: (response: Awaited<ReturnType<typeof followUser>>) => void;
  vi.mocked(followUser).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const otherAction = vi.fn();
  const p = props();
  const profile = { ...p.profile, walletAddress: '0xprivate' };

  function PrivateProfile() {
    const [isFollowing, setFollowing] = useState(false);
    const [isPending, setPending] = useState(false);
    const follow = useProfileFollow({
      profile,
      isAuthenticated: true,
      isTargetPrivate: true,
      setFollowStatus: (following, pending = false) => {
        setFollowing(following);
        setPending(pending);
      },
      handleApiError: () => {},
      setShareSheetOpen: () => {},
      setLoginModalOpen: () => {},
    });
    return <>
      <ProfileFollowButton {...p} {...follow} profile={profile} isTargetPrivate isFollowing={isFollowing} isPending={isPending} />
      <button onClick={otherAction}>Profile options</button>
    </>;
  }

  render(<QueryClientProvider client={new QueryClient()}><PrivateProfile /></QueryClientProvider>);
  const requestButton = screen.getByRole('button', { name: 'Request' });
  fireEvent.click(requestButton);
  expect(requestButton).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Profile options' }));
  expect(otherAction).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'profile.following' })).toBeNull();

  await act(async () => { finish({ result: true, status: 'pending' }); });
  expect(screen.getByRole('button', { name: 'Requested' })).toBeDisabled();
});
it('keeps unfollow behind confirmation in the compact position', () => {
  const p = props();
  render(<ProfileFollowButton {...p} isFollowing />);
  fireEvent.click(screen.getByRole('button', { name: 'profile.following' }));
  expect(p.handleUnfollow).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Unfollow' }));
  expect(p.handleUnfollow).toHaveBeenCalledTimes(1);
});
it.each([{ isViewingOwnProfile: true }, { isBlocked: true }])('omits follow for an ineligible profile %j', state => {
  render(<ProfileFollowButton {...props()} {...state} />);
  expect(screen.queryByRole('button')).toBeNull();
});
