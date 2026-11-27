import { expect, it, vi } from 'vitest';
import { getLeaderboard } from '../src/lib/api/dehub/leaderboard';

const fixtures = vi.hoisted(() => ({
  invoke: vi.fn(), single: vi.fn(), apiCall: vi.fn(), getAccountInfo: vi.fn(), getAccountSummaries: vi.fn(),
}));
vi.mock('../src/lib/api/dehub/core', () => ({ apiCall: fixtures.apiCall }));
vi.mock('../src/lib/api/dehub/users', () => ({
  getAccountInfo: fixtures.getAccountInfo, getAccountSummaries: fixtures.getAccountSummaries,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: fixtures.invoke },
    from: () => {
      const query = { select: () => query, eq: () => query, abortSignal: () => query, single: fixtures.single };
      return query;
    },
  },
}));

it('preserves period-only public accounts while the deployed API still uses the old summary shape', async () => {
  const rows = ['first', 'hidden', 'period-only'].map(account => ({ account, delta: 3 }));
  fixtures.invoke.mockResolvedValue({ error: new Error('not deployed') });
  fixtures.single.mockResolvedValue({ data: { data: { result: { byWalletBalance: rows } } } });
  fixtures.getAccountSummaries.mockResolvedValue(rows.map(({ account: address }) => ({ address })));
  fixtures.apiCall.mockResolvedValue({ result: { byWalletBalance: [rows[0]] } });
  fixtures.getAccountInfo.mockImplementation(async address => ({ address, customs: { followVisibility: address === 'hidden' ? 'hidden' : 'public' } }));
  expect((await getLeaderboard('followers', 'week')).result.byWalletBalance).toEqual([rows[0], rows[2]]);
  expect(fixtures.getAccountInfo.mock.calls.map(([address]) => address)).toEqual(['hidden', 'period-only']);
});
