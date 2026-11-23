import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext } from '@/contexts/AuthContext';
import { isFeatureStatusEditor } from '@/hooks/use-feature-requests';
import {
  EARLY_ACCESS_OWNER_WALLETS,
  earlyAccessOpen,
  posterFilter,
  type EarlyAccessRow,
  type EarlyAccessViewer,
} from '@/lib/early-access';

/** The signed-in person, or nobody. Works without an AuthProvider. */
export function useEarlyAccessViewer(): EarlyAccessViewer {
  const auth = useContext(AuthContext);
  const wallet = auth?.isAuthenticated ? auth.walletAddress : null;
  return {
    wallet,
    username: auth?.user?.username ?? null,
    isOwner: isFeatureStatusEditor(wallet) || (!!wallet && EARLY_ACCESS_OWNER_WALLETS.includes(wallet.toLowerCase())),
  };
}

/**
 * Whether the signed-in person may see a feature that ships with a one-day
 * head start for the person who asked for it. See lib/early-access.ts.
 */
export function useEarlyAccess(requestId: string, openBy: string): boolean {
  const viewer = useEarlyAccessViewer();
  const past = Date.now() >= Date.parse(openBy);
  const { data, isError } = useQuery({
    queryKey: ['feature-early-access', requestId],
    enabled: !past,
    queryFn: async (): Promise<EarlyAccessRow | null> => {
      const { data: row, error } = await supabase
        .from('feature_requests')
        .select('id,author_wallet_address,author_username,status,early_access_until')
        .eq('id', requestId)
        .maybeSingle();
      if (error) throw error;
      return (row as EarlyAccessRow | null) ?? null;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return earlyAccessOpen(isError ? null : data, viewer, openBy);
}

export interface EarlySupporter {
  /** How many of their requests shipped. */
  shipped: number;
  /** Their most recent shipped request, for the badge to open. */
  latestId: string | null;
}

/** Shipped requests by this person: the Early supporter badge's data. */
export function useEarlySupporter(wallet?: string | null, username?: string | null, enabled = true) {
  const filter = wallet ? posterFilter(wallet, username) : null;
  return useQuery({
    queryKey: ['early-supporter', filter],
    enabled: enabled && !!filter,
    queryFn: async (): Promise<EarlySupporter> => {
      const { data, count, error } = await supabase
        .from('feature_requests')
        .select('id', { count: 'exact' })
        .in('status', ['shipped', 'completed'])
        .or(filter!)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return { shipped: count ?? data?.length ?? 0, latestId: data?.[0]?.id ?? null };
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
}
