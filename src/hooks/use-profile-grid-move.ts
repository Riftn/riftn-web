/**
 * Moving one post on the owner's profile grid.
 *
 * The grid only holds the pages scrolled so far, while a saved order is the
 * whole list. So a drop is applied to the full order (the same list the
 * Arrange sheet loads): the moved post is taken out and put back right after
 * the post it now follows on the grid, and everything else keeps its place.
 *
 * @module hooks/use-profile-grid-move
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { saveProfileOrder } from '@/lib/api/dehub/profile-order';

const tokenIdOf = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? NaN);

/**
 * `before`: the posts ahead of the new place, nearest first. The post goes
 * right after the nearest one the order knows (a scheduled post on your own
 * grid is not part of it yet); none known puts it first.
 */
export function moveInOrder(order: number[], moved: number, before: number[]): number[] | null {
  if (!order.includes(moved)) return null;
  const next = order.filter((id) => id !== moved);
  const anchor = before.find((id) => id !== moved && next.includes(id));
  if (anchor === undefined) return [moved, ...next];
  next.splice(next.indexOf(anchor) + 1, 0, moved);
  return next;
}

/**
 * Returns the grid's drop handler, or undefined when the grid is not the
 * owner's to arrange. Resolves once the profile shows the saved order.
 */
export function useProfileGridMove(address: string | undefined, onSaved?: () => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const move = useCallback(async (movedId: string, beforeIds: string[]) => {
    if (!address) return;
    try {
      const { loadArrangeRows } = await import('@/components/app/profile/ProfileArrangeSheet');
      const rows = await loadArrangeRows(address, new AbortController().signal);
      const next = moveInOrder(rows.map((row) => row.tokenId), tokenIdOf(movedId), beforeIds.map(tokenIdOf));
      if (!next) throw new Error('post not in the saved order');
      await saveProfileOrder(next);
      onSaved?.();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dehub-user-content'] }),
        queryClient.invalidateQueries({ queryKey: ['dehub-profile'] }),
      ]);
      toast.success(t('profile.arrange.saved', 'Your order is saved'));
    } catch {
      toast.error(t('profile.arrange.saveFailed', 'Could not save your order. Please try again.'));
    }
  }, [address, onSaved, queryClient, t]);
  return address ? move : undefined;
}
