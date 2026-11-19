import { beforeEach, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('@/lib/client-navigate', () => ({ stableNavigate: (...args: unknown[]) => navigate(...args) }));
vi.mock('@/pages/app/FullScreenChatPage', () => ({ default: () => null }));

import { cameFromPanel, collapseChat, expandChat, forgetChatOrigin } from './chat-expand';

beforeEach(() => {
  navigate.mockReset();
  sessionStorage.clear();
  window.history.replaceState({ idx: 3 }, '');
});

it('opens the full chat page in the same tab instead of a new window', async () => {
  const open = vi.spyOn(window, 'open');
  expandChat();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/chat?chat=public'));
  expect(open).not.toHaveBeenCalled();
  expect(cameFromPanel()).toBe(true);
});

it('closing steps back past every entry the chat page added', async () => {
  expandChat();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
  navigate.mockReset();
  // /chat?chat=public then /chat?chat=1
  window.history.replaceState({ idx: 5 }, '');
  expect(collapseChat()).toBe(true);
  expect(navigate).toHaveBeenCalledWith(-2);
  expect(cameFromPanel()).toBe(false);
});

it('does nothing special when the page was not opened from the panel', () => {
  expandChat();
  forgetChatOrigin();
  expect(collapseChat()).toBe(false);
  expect(navigate).not.toHaveBeenCalledWith(-2);
});
