import { beforeEach, expect, it, vi } from 'vitest';
import { apiCall } from '../core';
import { getStreamerProgress } from '../livestream';
vi.mock('../core', () => ({ apiCall: vi.fn() }));
const request = vi.mocked(apiCall);

const progress = (count: number) => ({ level: 3, cards: Array.from({ length: count }, (_, i) => ({ id: String(i) })) });
beforeEach(() => { request.mockReset(); });

it('negotiates the twenty-card collection when the old server defaults to eight', async () => {
  const previous = progress(20);
  request.mockResolvedValueOnce({ result: progress(8) }).mockResolvedValueOnce(previous);
  await expect(getStreamerProgress('0xABC')).resolves.toEqual(previous);
  expect(request).toHaveBeenNthCalledWith(1, '/api/live/creator/0xabc/progress', { params: { collection: '21' } });
  expect(request).toHaveBeenNthCalledWith(2, '/api/live/creator/0xabc/progress', { params: { collection: '20' } });
});

it('reads the new collection with one request', async () => {
  const modern = progress(21);
  request.mockResolvedValueOnce(modern);
  await expect(getStreamerProgress('0xabc')).resolves.toEqual(modern);
  expect(request).toHaveBeenCalledTimes(1);
});

it('retains the known legacy badges if the fallback cannot be retrieved', async () => {
  const known = progress(8);
  request.mockResolvedValueOnce(known).mockRejectedValueOnce(new Error('temporarily offline'));
  await expect(getStreamerProgress('0xabc')).resolves.toEqual(known);
});
