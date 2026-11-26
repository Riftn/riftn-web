import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getAccountSummaries } from '@/lib/api/dehub/users';
import {
  fetchBuilderRows, rankBuilders, periodStart,
  type BuilderPeriod, type BuilderRequestRow, type BuilderCommentRow, type TopBuilder,
} from '@/lib/top-builders';

/** Read the activity needed to rank both periods. */
export function useTopBuilderRows(enabled = true) {
  return useQuery({
    queryKey: ['feature-top-builders', 'profiles'],
    enabled,
    queryFn: async () => {
      const [requests, commentRows]: [BuilderRequestRow[], BuilderCommentRow[]] = await Promise.all([
        fetchBuilderRows((limit, afterId) => {
          const query = supabase
            .from('feature_requests')
            .select('id,author_wallet_address,status,vote_count,created_at,updated_at')
            .order('id')
            .limit(limit);
          return afterId === null ? query : query.gt('id', afterId);
        }),
        fetchBuilderRows((limit, afterId) => {
          const query = supabase
            .from('feature_request_comments')
            .select('id,wallet_address,feature_request_id,created_at')
            .order('id')
            .limit(limit);
          return afterId === null ? query : query.gt('id', afterId);
        }),
      ]);
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
