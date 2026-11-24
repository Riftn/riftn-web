import { useContext } from 'react';
import { QueryClient, QueryClientContext, useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { toast } from 'sonner';

// Faces with a Moment mark ask this too, and some of them render in places
// with no query client or sign-in (tests, the state gallery): there it reads
// as on, from a client of its own that never fetches.
const standalone = new QueryClient();

export function useStoriesEnabled() {
  const auth = useContext(AuthContext);
  const wallet = auth?.isAuthenticated ? auth.walletAddress?.toLowerCase() : undefined;
  const { t } = useTranslation();
  const provided = useContext(QueryClientContext);
  const client = provided ?? standalone;
  const query = useQuery({
    queryKey: ['stories-enabled', wallet],
    enabled: !!wallet && !!provided,
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase.from('user_display_preferences').select('stories_enabled').eq('wallet_address', wallet!).maybeSingle(),
        wallet!,
      );
      if (error) throw error;
      return data?.stories_enabled !== false;
    },
  }, client);
  const save = useMutation({
    mutationFn: async ({ address, enabled }: { address: string; enabled: boolean }) => {
      const { error } = await withWalletHeader(
        supabase.from('user_display_preferences').upsert(
          { wallet_address: address, stories_enabled: enabled }, { onConflict: 'wallet_address' },
        ),
        address,
      );
      if (error) throw error;
    },
    onSuccess: async (_, { address, enabled }) => {
      const queryKey = ['stories-enabled', address];
      await client.cancelQueries({ queryKey, exact: true });
      client.setQueryData(queryKey, enabled);
    },
    onError: () => toast.error(t('settings.storiesSaveFailed', 'Could not save your Stories setting.')),
  }, client);
  return {
    storiesEnabled: wallet && query.isLoading ? false : query.data ?? true,
    canChange: !!wallet && !query.isLoading && !save.isPending,
    setStoriesEnabled: (enabled: boolean) => {
      if (wallet) save.mutate({ address: wallet, enabled });
    },
  };
}
