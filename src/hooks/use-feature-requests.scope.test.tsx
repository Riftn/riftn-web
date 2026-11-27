import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { useFeatureCounts, useFeatureRequests, useInProgressFeatures, useShippedFeatures } from './use-feature-requests';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn<typeof fetch>() }));
vi.mock('@/integrations/supabase/client', async () => {
  const { PostgrestClient } = await import('@supabase/postgrest-js');
  return { supabase: new PostgrestClient('https://example.test', { fetch: fetchMock }) };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({}) }));
vi.mock('@/lib/api/dehub', () => ({ getAccountInfo: vi.fn(), getAccountByUsername: vi.fn() }));

it('scopes all three status tabs and counts to the active wallet, including every shipped page', async () => {
  const sessionKey = 'feature-requests-shipped-cache';
  const globalCache = JSON.stringify({ ts: Date.now(), data: [{ id: 'global' }] });
  sessionStorage.setItem(sessionKey, globalCache);
  fetchMock.mockImplementation(async (url, init) => {
    const params = new URL(String(url)).searchParams;
    const wallet = params.get('author_wallet_address');
    if (wallet !== 'ilike.0xa' && wallet !== 'ilike.0xb') throw Error('missing account filter');
    const status = params.get('status') ?? '';
    if (init?.method === 'HEAD') {
      return new Response(null, { headers: { 'content-range': '*/' + (status ? 1 : 503) } });
    }
    const offset = Number(params.get('offset'));
    const count = wallet === 'ilike.0xa' && status.includes('shipped') && !status.startsWith('not.') && !offset ? 500 : 1;
    const data = Array.from({ length: count }, (_, i) => ({ id: wallet + (offset + i), category: 'new_feature' }));
    return new Response(JSON.stringify(data));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderHook(({ wallet }) => ({
    open: useFeatureRequests('newest', 'all', '', wallet),
    queued: useInProgressFeatures(wallet),
    shipped: useShippedFeatures(wallet),
    counts: useFeatureCounts(wallet),
  }), {
    initialProps: { wallet: '0xa' },
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  expect(view.result.current.shipped.data).toBeUndefined();
  await waitFor(() => expect(view.result.current.shipped.data).toHaveLength(501));
  expect(view.result.current.open.data?.pages[0][0].id).toBe('ilike.0xa0');
  expect(view.result.current.queued.data?.[0].id).toBe('ilike.0xa0');
  expect(view.result.current.counts.data).toEqual({ open: 1, total: 503 });
  view.rerender({ wallet: '0xb' });
  expect(view.result.current.shipped.data).toBeUndefined();
  await waitFor(() => expect(view.result.current.shipped.data?.[0].id).toBe('ilike.0xb0'));
  expect(sessionStorage.getItem(sessionKey)).toBe(globalCache);
  view.unmount();
  client.clear();
  sessionStorage.removeItem(sessionKey);
});
