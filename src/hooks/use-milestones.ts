import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '@/lib/api/dehub';

const DEHUB_API_BASE = 'https://api.dehub.io';

export type MilestoneKind = 'views' | 'videos' | 'followers' | 'likes' | 'lives' | 'liveHours';

export interface Milestone {
  id: string;
  kind: MilestoneKind;
  goal: number;
  /** Higher is rarer. */
  rarity: number;
  value: number;
  earned: boolean;
}

export interface Milestones {
  address: string;
  milestones: Milestone[];
  /** Up to three earned ids for the profile header, rarest first. */
  top: string[];
  earned: number;
  total: number;
  updatedAt: string;
}

/**
 * The Badge Museum for a profile: every milestone step with where the person
 * stands. Worked out on the server from stats it already keeps, and cached
 * there for a few minutes, so the app and web show the same badges.
 */
export function useMilestones(address?: string | null) {
  return useQuery({
    queryKey: ['profile-milestones', address?.toLowerCase()],
    queryFn: async (): Promise<Milestones | null> => {
      const token = getAuthToken();
      const response = await fetch(`${DEHUB_API_BASE}/api/users/${encodeURIComponent(String(address))}/milestones`, {
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Milestones API error: ${response.status}`);
      const json = await response.json();
      return (json?.result ?? null) as Milestones | null;
    },
    enabled: !!address,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}
