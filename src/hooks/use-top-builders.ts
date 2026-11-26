import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getAccountSummaries } from '@/lib/api/dehub/users';
import {
  rankBuilders, periodStart,
  type BuilderPeriod, type BuilderRequestRow, type BuilderCommentRow, type TopBuilder,
} from '@/lib/top-builders';

/**
 * Raw rows for the Top builders card. The board is a few hundred rows, so the
 * whole thing is read once (only the columns the score needs) and ranked here.
 */
export function useTopBuilderRows(enabled = true) {
  return useQuery({
    queryKey: ['feature-top-builders', 'profiles'],
    enabled,
    queryFn: async () => {
      const [reqs, comments] = await Promise.all([
        supabase
          .from('feature_requests')
          .select('id,author_wallet_address,status,vote_count,created_at,updated_at')
          .limit(5000),
        supabase
          .from('feature_request_comments')
          .select('wallet_address,feature_request_id,created_at')
          .limit(10000),
      ]);
      if (reqs.error) throw reqs.error;
      if (comments.error) throw comments.error;
      const requests: BuilderRequestRow[] = reqs.data ?? [];
      const commentRows: BuilderCommentRow[] = comments.data ?? [];
      const profiles = await getAccountSummaries([
        ...requests.map(row => row.author_wallet_address),
        ...commentRows.map(row => row.wallet_address),
      ]).catch(() => []);
      return { requests, comments: commentRows, profiles };
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}

export function useTopBuilders(period: BuilderPeriod, enabled = true) {
  const query = useTopBuilderRows(enabled);
  const builders = useMemo<TopBuilder[]>(
    () => (query.data ? rankBuilders(query.data.requests, query.data.comments, periodStart(period), query.data.profiles) : []),
    [query.data, period],
  );
  return { builders, isLoading: query.isLoading };
}
