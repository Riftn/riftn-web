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

/** `after` null puts the post first. Returns null when either post is not in the list. */
export function moveInOrder(order: number[], moved: number, after: number | null): number[] | null {
  if (!order.includes(moved) || moved === after) return null;
  const next = order.filter((id) => id !== moved);
  if (after === null) return [moved, ...next];
  const at = next.indexOf(after);
  if (at < 0) return null;
  next.splice(at + 1, 0, moved);
  return next;
}

/**
 * Returns the grid's drop handler, or undefined when the grid is not the
 * owner's to arrange. Resolves once the profile shows the saved order.
 */
export function useProfileGridMove(address: string | undefined, onSaved?: () => void) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const move = useCallback(async (movedId: string, afterId: string | null) => {
    if (!address) return;
    try {
      const { loadArrangeRows } = await import('@/components/app/profile/ProfileArrangeSheet');
      const rows = await loadArrangeRows(address, new AbortController().signal);
      const next = moveInOrder(rows.map((row) => row.tokenId), tokenIdOf(movedId), afterId === null ? null : tokenIdOf(afterId));
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
