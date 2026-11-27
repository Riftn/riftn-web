import { useInfiniteQuery } from '@tanstack/react-query';
import { getProfileLikes } from '@/lib/api/dehub';
import { likesArePublic } from '@/hooks/use-privacy-settings';

const PAGE_SIZE = 20;

/** Whether this viewer gets a Likes tab on this profile. Private unless the owner made it public. */
export function canSeeLikesTab(isOwnProfile: boolean, customs: Record<string, unknown> | null | undefined): boolean {
  return isOwnProfile || likesArePublic(customs);
}

/** The profile Likes tab: posts this account liked, newest first. */
export function useProfileLikes(address: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['profile-likes', address?.toLowerCase()],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await getProfileLikes(address!, pageParam, PAGE_SIZE);
      const items = response.result || [];
      return {
        items,
        nextPage: response.pagination?.hasMore ? pageParam + 1 : undefined,
        totalCount: response.pagination?.totalCount ?? items.length,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: enabled && !!address,
    staleTime: 60 * 1000,
    retry: false,
  });
}
