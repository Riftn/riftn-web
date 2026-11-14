import { describe, expect, it } from 'vitest';
import { findUnreadAnchor, type UnreadAnchorLine } from '../chat-unread-anchor';

const line = (id: string, own: boolean, isRead: boolean, skip = false): UnreadAnchorLine => ({ id, own, isRead, skip });

describe('findUnreadAnchor', () => {
  it('returns null when everything is read', () => {
    expect(findUnreadAnchor([line('a', false, true), line('b', true, false)])).toBeNull();
  });

  it('starts at the oldest unread line from the other side', () => {
    const a = findUnreadAnchor([
      line('a', false, true),
      line('b', true, true),
      line('c', false, false),
      line('d', true, false),
      line('e', false, false),
    ]);
    expect(a).toEqual({ id: 'c', ids: ['c', 'e'], count: 2 });
  });

  it('ignores our own unread lines and skipped rows', () => {
    const a = findUnreadAnchor([line('a', true, false), line('b', false, false, true), line('c', false, false)]);
    expect(a?.id).toBe('c');
  });

  it('uses the server count when the whole loaded page is unread', () => {
    const a = findUnreadAnchor([line('a', false, false), line('b', false, false)], 45);
    expect(a).toEqual({ id: 'a', ids: ['a', 'b'], count: 45 });
  });

  it('keeps the flagged count when older read lines are loaded', () => {
    const a = findUnreadAnchor([line('a', false, true), line('b', false, false)], 9);
    expect(a?.count).toBe(1);
  });

  it('falls back to counting back from the newest when flags are stale', () => {
    const a = findUnreadAnchor([line('a', false, true), line('b', true, true), line('c', false, true), line('d', false, true)], 2);
    expect(a).toEqual({ id: 'c', ids: ['c', 'd'], count: 2 });
  });
});
