/**
 * "Not interested" on a post: it leaves your feeds where it sits, and after two
 * from the same creator, Home shows you fewer of theirs (riftn-backend
 * common/util/disliked-posts). Private: nobody is told. Undo in the toast.
 */
import { useCallback } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiCall } from '@/lib/api/dehub/core';

type Row = { tokenId?: number | string; id?: number | string; nft?: { tokenId?: number | string } };
const idOf = (row: Row) => String(row?.tokenId ?? row?.nft?.tokenId ?? row?.id ?? '');

export async function setNotInterested(tokenId: number, undo = false) {
  const res = await apiCall<any>('/api/not_interested', { method: 'POST', body: { tokenId, undo }, requiresAuth: true });
  if (res?.result === false) throw new Error(res?.error || 'Could not save that');
  return res;
}

export function useNotInterested() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useCallback(async (tokenId: number) => {
    if (!tokenId) return;
    const id = String(tokenId);
    try {
      await setNotInterested(tokenId);
    } catch {
      toast.error(t('common.tryAgain', 'Try again'));
      return;
    }
    // Drop it where it sits; a refetch would jump the feed back to the top.
    for (const key of ['unified-feed', 'dehub-feed']) {
      for (const query of queryClient.getQueryCache().findAll({ queryKey: [key] })) {
        queryClient.setQueryData(query.queryKey, (old: InfiniteData<{ items?: Row[]; data?: Row[] }> | undefined) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              ...(Array.isArray(page?.items) ? { items: page.items.filter((r) => idOf(r) !== id) } : {}),
              ...(Array.isArray(page?.data) ? { data: page.data.filter((r) => idOf(r) !== id) } : {}),
            })),
          };
        });
      }
    }
    toast.success(t('postOptions.notInterestedDone', "Got it. You'll see fewer posts like this."), {
      action: {
        label: t('common.undo', 'Undo'),
        onClick: () => {
          void setNotInterested(tokenId, true)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['unified-feed'] });
              queryClient.invalidateQueries({ queryKey: ['dehub-feed'] });
            })
            .catch(() => toast.error(t('common.tryAgain', 'Try again')));
        },
      },
    });
  }, [queryClient, t]);
}
