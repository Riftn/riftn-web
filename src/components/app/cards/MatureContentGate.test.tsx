import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentRating } from '@/lib/api/dehub/types';
import { useMatureGate } from './MatureContentGate';

const preference = vi.hoisted(() => ({ enabled: true }));
vi.mock('@/hooks/use-mature-content', () => ({
  useMatureContent: () => ({ showMatureContent: preference.enabled }),
}));

describe('mature playback warning', () => {
  it('requires a separate reveal for each rated video even after feed opt-in', () => {
    preference.enabled = true;
    const { result, rerender } = renderHook(
      ({ rating, id }: { rating: ContentRating; id: string }) => useMatureGate(rating, id),
      { initialProps: { rating: 'mature', id: 'first' } },
    );

    expect(result.current.isGated).toBe(true);
    act(() => result.current.reveal());
    expect(result.current.isGated).toBe(false);
    rerender({ rating: 'mature', id: 'second' });
    expect(result.current.isGated).toBe(true);
    rerender({ rating: 'safe', id: 'third' });
    expect(result.current.isGated).toBe(false);
  });

  it('retains the account preference for media without automatic video playback', () => {
    preference.enabled = false;
    const { result, rerender } = renderHook(() => useMatureGate('mature'));
    expect(result.current.isGated).toBe(true);
    preference.enabled = true;
    rerender();
    expect(result.current.isGated).toBe(false);
  });
});
