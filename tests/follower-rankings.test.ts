import { afterEach, beforeAll, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ maybeSingle: vi.fn() }));
vi.mock('../supabase/functions/_shared/auth.ts', () => ({
  handleCorsPreflight: () => null,
  jsonResponse: (body: unknown, status = 200) => Response.json(body, { status }),
  serviceClient: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: db.maybeSingle };
    return { from: () => query };
  },
}));

let read: (req: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('Deno', { serve: (handler: typeof read) => { read = handler; } });
  await import('../supabase/functions/follower-rankings/index.ts');
});
afterEach(() => vi.unstubAllGlobals());

function request() {
  return new Request('https://example.test', { method: 'POST', body: JSON.stringify({ period: 'week' }) });
}

it('preserves period order and removes hidden, banned, missing and older unverified profiles', async () => {
  const rows = ['B', 'C', 'A', 'X', 'Y', 'Z'].map(account => ({ account, delta: 7 }));
  db.maybeSingle.mockResolvedValue({ data: { data: { result: { byWalletBalance: rows }, hasHistoricalData: true } } });
  const fetch = vi.fn().mockResolvedValue(Response.json({ result: [
    { address: 'a', followerCountVisible: true }, { address: 'b', followerCountVisible: true },
    { address: 'c', followerCountVisible: false }, { address: 'x', followerCountVisible: true, isBanned: true },
    { address: 'y' },
  ] }));
  vi.stubGlobal('fetch', fetch);
  const response = await read(request());
  expect((await response.json()).result.byWalletBalance).toEqual([rows[0], rows[2]]);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('withholds the entire ranking when visibility is unavailable', async () => {
  db.maybeSingle.mockResolvedValue({ data: { data: { result: { byWalletBalance: [{ account: 'a' }] } } } });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const response = await read(request());
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty('result');
});
