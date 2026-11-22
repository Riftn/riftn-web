import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Volume from '@/components/ui/cut-icons/volume';
import Mute from '@/components/ui/cut-icons/mute';
import { useAuth } from '@/contexts/AuthContext';
import { getMuteStatus, muteUser, unmuteUser } from '@/lib/api/dehub/mutes';

export function ProfileMuteButton({ address }: { address: string }) {
  const { t } = useTranslation();
  const { isAuthenticated, walletAddress } = useAuth();
  const client = useQueryClient();
  const key = ['profile-mute', walletAddress?.toLowerCase(), address.toLowerCase()];
  const status = useQuery({
    queryKey: key,
    queryFn: () => getMuteStatus(address),
    enabled: isAuthenticated,
    refetchOnMount: 'always',
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: async (muted: boolean) => {
      const result = await (muted ? unmuteUser(address) : muteUser(address));
      if (!result.status) throw new Error('Mute update failed');
      return !muted;
    },
    onSuccess: (muted) => {
      client.setQueryData(key, muted);
      for (const group of ['mute-list', 'unified-feed', 'dehub-feed']) {
        void client.invalidateQueries({ queryKey: [group] });
      }
    },
    onError: () => {
      toast.error(t('common.tryAgain'));
      void status.refetch();
    },
  });
  if (!isAuthenticated) return null;
  const Icon = status.data ? Volume : Mute;
  return (
    <button
      type="button"
      disabled={status.isFetching || toggle.isPending}
      onClick={() => {
        if (typeof status.data === 'boolean') toggle.mutate(status.data);
        else void status.refetch();
      }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-left disabled:opacity-50"
    >
      <span className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center"><Icon className="w-4 h-4" /></span>
      {status.isError ? t('common.tryAgain') : status.data ? t('keywordFilters.remove') : t('keywordFilters.add')}
    </button>
  );
}
