import { describe, expect, it } from 'vitest';
import { orderedTabs } from '@/hooks/use-chat-tabs';

const name = (id: string) => id.toUpperCase();

describe('chat tab order', () => {
  it('starts with the built-in tabs', () => {
    expect(orderedTabs({ tabs: [], order: [], hidden: [] }, name).map(t => t.id)).toEqual(['all', 'unread', 'direct', 'communities', 'requests']);
  });

  it('follows the saved order, keeps every tab and never hides All', () => {
    const tabs = orderedTabs({
      tabs: [{ id: 't_work', name: 'Work', emoji: '💼', chats: ['abc'] }],
      order: ['all', 't_work', 'direct'],
      hidden: ['all', 'requests'],
    }, name);
    expect(tabs.map(t => t.id)).toEqual(['all', 't_work', 'direct', 'unread', 'communities', 'requests']);
    expect(tabs.find(t => t.id === 'all')?.hidden).toBe(false);
    expect(tabs.find(t => t.id === 'requests')?.hidden).toBe(true);
    expect(tabs.find(t => t.id === 't_work')).toMatchObject({ builtin: false, chats: ['abc'], emoji: '💼' });
  });
});
