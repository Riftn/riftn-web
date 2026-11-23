import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

it.each([
  [null, null, 'bento'],
  [null, 'false', 'line'],
  ['bento', 'false', 'bento'],
  ['line', 'true', 'line'],
])('resolves saved layout %s and legacy inbox choice %s as %s', async (layout, cards, expected) => {
  if (layout) localStorage.setItem('dehub.feedSeparator', layout);
  if (cards) localStorage.setItem('riftn.chat.cards', cards);
  const { getFeedSeparator } = await import('./feed-separator');
  expect(getFeedSeparator()).toBe(expected);
  expect(document.documentElement.dataset.feedSep).toBe(expected === 'line' ? 'line' : undefined);
});

it('remembers returning to cards after upgrading a plain inbox', async () => {
  localStorage.setItem('riftn.chat.cards', 'false');
  const { setFeedSeparator } = await import('./feed-separator');
  setFeedSeparator('bento');
  vi.resetModules();
  const { getFeedSeparator } = await import('./feed-separator');
  expect(getFeedSeparator()).toBe('bento');
  expect(document.documentElement.dataset.feedSep).toBeUndefined();
});
