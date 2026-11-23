import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { toast } from 'sonner';

export function useStoriesEnabled() {
  const { isAuthenticated, walletAddress } = useAuth();
  const wallet = isAuthenticated ? walletAddress?.toLowerCase() : undefined;
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['stories-enabled', wallet],
    enabled: !!wallet,
    queryFn: async () => {
      const { data, error } = await withWalletHeader(
        supabase.from('user_display_preferences').select('stories_enabled').eq('wallet_address', wallet!).maybeSingle(),
        wallet!,
      );
      if (error) throw error;
      return data?.stories_enabled !== false;
    },
  });
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
  });
  return {
    storiesEnabled: wallet && query.isLoading ? false : query.data ?? true,
    canChange: !!wallet && !query.isLoading && !save.isPending,
    setStoriesEnabled: (enabled: boolean) => {
      if (wallet) save.mutate({ address: wallet, enabled });
    },
  };
}
