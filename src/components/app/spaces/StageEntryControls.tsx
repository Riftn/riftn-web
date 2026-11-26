import { stageRoomLabel, stageTopicLabel } from '@/i18n/stage-room-copy';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getAccountSummaries } from '@/lib/api/dehub/users';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { supabase } from '@/integrations/supabase/client';
import { KitButton } from '@/components/app/page-kit/PageKit';

import { STAGE_TOPICS, type StageTopic } from '@/lib/stage-topics';

export function StageEntryControls({ spaceId, wallet }: { spaceId: string; wallet: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const lockKey = ['stage-entry-lock', spaceId] as const;
  const requestsKey = ['stage-entry-requests', spaceId, wallet] as const;
  const lock = useQuery({
    queryKey: lockKey,
    enabled: expanded,
    queryFn: async () => {
      const { data, error } = await supabase.from('audio_spaces').select('entry_locked, title, topic').eq('id', spaceId).single();
      if (error) throw error;
      return data;
    },
  });
  const pending = useQuery({
    queryKey: requestsKey,
    enabled: expanded && lock.data?.entry_locked === true,
    refetchInterval: expanded && lock.data?.entry_locked === true ? 10_000 : false,
    queryFn: async () => {
      const { data, error } = await withWalletHeader(supabase.from('stage_entry_requests')
        .select('wallet_address').eq('space_id', spaceId).is('approved_at', null)
        .order('requested_at').limit(20), wallet);
      if (error) throw error;
      return data.map((request) => request.wallet_address);
    },
  });
  const addresses = pending.data ?? [];
  const { data: profiles } = useQuery({
    queryKey: ['stage-entry-profiles', addresses],
    enabled: expanded && lock.data?.entry_locked === true && addresses.length > 0,
    queryFn: () => getAccountSummaries(addresses),
    staleTime: 5 * 60_000,
  });
  const toggle = useMutation({
    mutationFn: async (patch: { entry_locked?: boolean; title?: string; topic?: StageTopic | null }) => {
      const { data, error } = await withWalletHeader(supabase.from('audio_spaces').update(patch)
        .eq('id', spaceId).eq('status', 'live').select('entry_locked, title, topic').maybeSingle(), wallet);
      if (error || !data) throw error ?? new Error('Stage is no longer live');
      return data;
    },
    onSuccess: (room, patch) => {
      queryClient.setQueryData(lockKey, room);
      if (patch.title !== undefined) setTitle(null);
    },
    onError: () => toast.error(stageRoomLabel(t, 'entryUnavailable')),
  });
  const approve = useMutation({
    mutationFn: async (address: string) => {
      const { data, error } = await withWalletHeader(supabase.rpc('approve_stage_entry', {
        p_space_id: spaceId,
        p_wallet: address,
      }), wallet);
      if (error || !data) throw error ?? new Error('Entry request is no longer pending');
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: requestsKey }); },
    onError: () => toast.error(stageRoomLabel(t, 'entryUnavailable')),
  });

  return (
    <div className="mt-3">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
        className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10">
        {stageRoomLabel(t, 'entrySettings')}
      </button>
      {expanded && (
        <section className="mt-2 space-y-3 rounded-xl border border-white/15 p-3 text-sm text-white">
          {lock.isError && <p role="alert">{stageRoomLabel(t, 'entryUnavailable')}</p>}
          {lock.isLoading && <p role="status">{t('common.loading')}</p>}
          {lock.data && (
            <>
              <form className="space-y-2" onSubmit={(event) => {
                event.preventDefault();
                if (title?.trim()) toggle.mutate({ title: title.trim() });
              }}>
                <label className="block">
                  {stageRoomLabel(t, 'editRoomTitle')}
                  <input value={title ?? lock.data.title} maxLength={100} onChange={(event) => setTitle(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-white/20 bg-transparent px-2 py-1.5" />
                </label>
                <KitButton type="submit" variant="quiet" disabled={toggle.isPending || !title?.trim() || title.trim() === lock.data.title}>
                  {t('common.save')}
                </KitButton>
              </form>
              <label className="block">
                {stageRoomLabel(t, 'roomTopic')}
                <select value={lock.data.topic ?? ''} disabled={toggle.isPending}
                  onChange={(event) => toggle.mutate({ topic: STAGE_TOPICS.find((topic) => topic === event.target.value) ?? null })}
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-zinc-900 px-2 py-1.5">
                  <option value="">{stageRoomLabel(t, 'topicNone')}</option>
                  {STAGE_TOPICS.map((topic) => <option key={topic} value={topic}>{stageTopicLabel(t, topic)}</option>)}
                </select>
              </label>
              <p className="text-white/75">{stageRoomLabel(t, 'entryHelp')}</p>
              <KitButton variant="quiet" disabled={toggle.isPending} onClick={() => toggle.mutate({ entry_locked: !lock.data?.entry_locked })}>
                {lock.data.entry_locked ? stageRoomLabel(t, 'unlockEntry') : stageRoomLabel(t, 'lockEntry')}
              </KitButton>
            </>
          )}
          {lock.data?.entry_locked === true && (
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {pending.isError && <p role="alert">{stageRoomLabel(t, 'entryUnavailable')}</p>}
              {pending.isSuccess && addresses.length === 0 && <p>{stageRoomLabel(t, 'noEntryRequests')}</p>}
              {addresses.map((address) => {
                const profile = profiles?.find((item) => item.address.toLowerCase() === address);
                const name = profile?.username ? '@' + profile.username.replace(/^@+/, '') : address;
                return (
                  <div key={address} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-all">{name}</span>
                    <KitButton variant="quiet" disabled={approve.isPending} onClick={() => approve.mutate(address)}>
                      {stageRoomLabel(t, 'approveEntry')}
                    </KitButton>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
