import { describe, expect, it } from 'vitest';
import { publicChatInBar, withPublicChatInBar } from '@/lib/nav-order';

const DEFAULT = ['nav.home', 'nav.messages', 'nav.assistant', 'nav.explore', 'publicChat.title', 'nav.settings'];

describe('Public Chat in the bottom bar', () => {
  it('is off by default and on puts it after Create, keeping Explore on the first screen', () => {
    expect(publicChatInBar(DEFAULT)).toBe(false);
    const on = withPublicChatInBar(DEFAULT, true);
    expect(on).toEqual(['nav.home', 'nav.messages', 'publicChat.title', 'nav.explore', 'nav.assistant', 'nav.settings']);
    expect(publicChatInBar(on)).toBe(true);
  });

  it('off restores the default order', () => {
    expect(withPublicChatInBar(withPublicChatInBar(DEFAULT, true), false)).toEqual(DEFAULT);
  });
});
