import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useStagedCount } from '@/hooks/use-staged-count';

describe('useStagedCount', () => {
  it('draws the first cards at once and the rest right after', async () => {
    const seen: number[] = [];
    const { result } = renderHook(() => {
      const count = useStagedCount(15, 3, 'riftn');
      seen.push(count);
      return count;
    });
    expect(seen[0]).toBe(3);
    await act(async () => {});
    expect(result.current).toBe(15);
  });

  it('never asks for more cards than there are', async () => {
    const { result } = renderHook(() => useStagedCount(2, 3, 'riftn'));
    expect(result.current).toBe(2);
    await act(async () => {});
    expect(result.current).toBe(2);
  });

  it('starts over for a new search and takes a next page in after the first', async () => {
    const seen: number[] = [];
    const { result, rerender } = renderHook(
      ({ total, scope }: { total: number; scope: string }) => {
        const count = useStagedCount(total, 3, scope);
        seen.push(count);
        return count;
      },
      { initialProps: { total: 15, scope: 'a' } },
    );
    await act(async () => {});
    expect(result.current).toBe(15);
    seen.length = 0;
    rerender({ total: 30, scope: 'a' });
    expect(seen[0]).toBe(15);
    await act(async () => {});
    expect(result.current).toBe(30);
    seen.length = 0;
    rerender({ total: 12, scope: 'b' });
    expect(Math.min(...seen)).toBe(3);
    await act(async () => {});
    expect(result.current).toBe(12);
  });
});
