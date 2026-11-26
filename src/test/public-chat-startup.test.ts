import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLiveChatMessagePage, PUBLIC_CHAT_PAGE_SIZE } from '@/lib/api/dehub/livechat';
import { apiCall, getAuthToken } from '@/lib/api/dehub/core';

vi.mock('@/lib/api/dehub/core', () => ({
  apiCall: vi.fn(),
  getAuthToken: vi.fn(() => null),
  getRefreshToken: vi.fn(() => null),
}));

const opening = { limit: PUBLIC_CHAT_PAGE_SIZE };
const history = { result: { messages: [{ id: 'opening-message' }], hasMore: true } };
const startup = window as Window & {
  __publicChatHistory?: { at: number; promise: Promise<typeof history | null> };
};

beforeEach(() => {
  vi.mocked(getAuthToken).mockReturnValue(null);
  vi.mocked(apiCall).mockReset().mockResolvedValue({ messages: [] });
  startup.__publicChatHistory = { at: Date.now(), promise: Promise.resolve(history) };
});

afterEach(() => {
  delete startup.__publicChatHistory;
});

describe('public chat startup history', () => {
  it('reuses the opening page once and preserves paging metadata', async () => {
    const page = await getLiveChatMessagePage('global', opening);
    expect(page.messages).toEqual(history.result.messages);
    expect(page.hasMore).toBe(true);
    expect(apiCall).not.toHaveBeenCalled();
    await getLiveChatMessagePage('global', opening);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });

  it('leaves the startup result for the opening page when a different window is requested', async () => {
    await getLiveChatMessagePage('global', { ...opening, around: 'linked-line' });
    await getLiveChatMessagePage('stream-room', opening);
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect((await getLiveChatMessagePage('global', opening)).messages).toEqual(history.result.messages);
  });

  it('requests fresh history if the viewer signs in before the startup request resolves', async () => {
    let resolve!: (result: typeof history) => void;
    startup.__publicChatHistory = {
      at: Date.now(),
      promise: new Promise((done) => { resolve = done; }),
    };
    const page = getLiveChatMessagePage('global', opening);
    vi.mocked(getAuthToken).mockReturnValue('signed-in');
    resolve(history);
    expect((await page).messages).toEqual([]);
    expect(apiCall).toHaveBeenCalledTimes(1);
  });
});
