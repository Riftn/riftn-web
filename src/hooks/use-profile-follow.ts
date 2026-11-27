import { useTranslation as _useCopy } from 'react-i18next';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { followUser, unfollowUser } from '@/lib/api/dehub';
import { setFollowOverride } from '@/hooks/use-follow';
import type { ProfileData } from '@/hooks/use-dehub-profile';

interface UseProfileFollowParams {
  profile: ProfileData | undefined;
  isAuthenticated: boolean;
  isTargetPrivate: boolean;
  setFollowStatus: (isFollowing: boolean, isPending?: boolean) => void;
  handleApiError: (error: unknown, fallbackMessage: string) => void;
  setShareSheetOpen: (open: boolean) => void;
  setLoginModalOpen: (open: boolean) => void;
}

export function useProfileFollow({
  profile,
  isAuthenticated,
  isTargetPrivate,
  setFollowStatus,
  handleApiError,
  setShareSheetOpen,
  setLoginModalOpen,
}: UseProfileFollowParams) {
  const { t: _copy } = _useCopy();
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const followInFlight = useRef(false);
  const queryClient = useQueryClient();

  const invalidateProfileQueries = () => {
    if (!profile?.walletAddress) return;
    // Invalidate all profile queries for this user so any cached isFollowing is refreshed
    queryClient.invalidateQueries({
      queryKey: ['dehub-profile'],
      predicate: (query) => {
        const key = query.queryKey;
        // Match queries where the userId/username matches this profile
        return key[0] === 'dehub-profile' && (
          key[1] === profile.walletAddress ||
          key[1] === profile.handle?.replace('@', '')
        );
      },
    });
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      setLoginModalOpen(true);
      return;
    }

    if (!profile?.walletAddress) {
      toast.error(_copy("copy.be766d1bed3c", { defaultValue: "Cannot follow: user wallet address not found" }));
      return;
    }

    if (followInFlight.current) return;
    followInFlight.current = true;
    setIsFollowLoading(true);
    const address = profile.walletAddress;

    if (!isTargetPrivate) {
      setFollowStatus(true);
      setFollowOverride(address, true);
    }

    const markRequested = () => {
      setFollowStatus(false, true);
      if (!isTargetPrivate) setFollowOverride(address, false);
      void queryClient.invalidateQueries({ queryKey: ['user-follow-status'], predicate: (query) => query.queryKey[2] === address.toLowerCase() });
    };

    try {
      const response = await followUser(address);
      if (response.status === 'pending') {
        markRequested();
        toast.success(_copy("copy.89db78228f64", { defaultValue: "Follow request sent to {{value1}}", value1: profile.name }));
      } else {
        if (isTargetPrivate) {
          setFollowStatus(true);
          setFollowOverride(address, true);
        }
        toast.success(_copy("copy.91266f0b5e2a", { defaultValue: "Following {{value1}}", value1: profile.name }));
        invalidateProfileQueries();
      }
    } catch (error: unknown) {
      const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();
      if (errorMessage.includes('pending')) {
        markRequested();
        toast.info(_copy('follow.requestAlreadyPending', { defaultValue: 'Follow request already pending. Waiting for approval.' }));
      } else if (errorMessage.includes('already') || errorMessage.includes('following')) {
        if (isTargetPrivate) {
          setFollowStatus(true);
          setFollowOverride(address, true);
        }
        toast.info(_copy("copy.65ae469907b9", { defaultValue: "Already following {{value1}}", value1: profile.name }));
      } else {
        if (!isTargetPrivate) {
          setFollowStatus(false);
          setFollowOverride(address, false);
        }
        handleApiError(error, _copy("copy.b775b90b6bc6", { defaultValue: "Failed to follow. Please try again." }));
      }
    } finally {
      followInFlight.current = false;
      setIsFollowLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (!isAuthenticated) {
      toast.error(_copy("copy.f6101c84c1c8", { defaultValue: "Please log in first" }));
      return;
    }

    if (!profile?.walletAddress) {
      toast.error(_copy("copy.05b600d51200", { defaultValue: "Cannot unfollow: user wallet address not found" }));
      return;
    }

    if (followInFlight.current) return;
    followInFlight.current = true;
    setIsFollowLoading(true);
    setFollowStatus(false);
    // Sync the shared follow-override store — see handleFollow.
    setFollowOverride(profile.walletAddress, false);

    try {
      await unfollowUser(profile.walletAddress);
      toast.success(_copy("copy.df4ab0546621", { defaultValue: "Unfollowed {{value1}}", value1: profile.name }));
      invalidateProfileQueries();
    } catch (error) {
      setFollowStatus(true);
      setFollowOverride(profile.walletAddress, true);
      handleApiError(error, _copy("copy.0ef9806c5055", { defaultValue: "Failed to unfollow. Please try again." }));
    } finally {
      followInFlight.current = false;
      setIsFollowLoading(false);
      setShareSheetOpen(false);
    }
  };

  return {
    isFollowLoading,
    handleFollow,
    handleUnfollow,
  };
}
