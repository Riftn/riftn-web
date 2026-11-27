import { describe, expect, it } from 'vitest';
import { anchorFromReadSpot, isLaterSpot, type ReadLine } from '../chat-read-position';

const at = (min: number) => new Date(Date.UTC(2026, 10, 18, 12, min)).toISOString();
const line = (id: string, min: number, own = false, skip = false): ReadLine => ({ id, own, at: at(min), skip });

describe('anchorFromReadSpot', () => {
  const lines = [line('a', 1), line('b', 2), line('c', 3), line('d', 4), line('e', 5)];

  it('opens on the line after where you left off', () => {
    expect(anchorFromReadSpot(lines, { messageId: 'b', at: at(2) }, false)).toEqual({
      kind: 'anchor', anchor: { id: 'c', ids: ['c', 'd', 'e'], count: 3 },
    });
  });

  it('says nothing is unread when you read to the end', () => {
    expect(anchorFromReadSpot(lines, { messageId: 'e', at: at(5) }, false)).toEqual({ kind: 'none' });
  });

  it('asks for older history when the spot is above the loaded lines', () => {
    expect(anchorFromReadSpot(lines, { messageId: 'old', at: at(0) }, true)).toEqual({ kind: 'older' });
  });

  it('counts every loaded line when the spot is before the whole chat', () => {
    const r = anchorFromReadSpot(lines, { messageId: 'old', at: at(0) }, false);
    expect(r).toEqual({ kind: 'anchor', anchor: { id: 'a', ids: ['a', 'b', 'c', 'd', 'e'], count: 5 } });
  });

  it('uses the time when the read line was deleted', () => {
    expect(anchorFromReadSpot(lines, { messageId: 'gone', at: new Date(Date.parse(at(3)) + 1000).toISOString() }, true)).toEqual({
      kind: 'anchor', anchor: { id: 'd', ids: ['d', 'e'], count: 2 },
    });
  });

  it('skips your own lines and starts after your last reply', () => {
    const mixed = [line('a', 1), line('b', 2), line('mine', 3, true), line('d', 4), line('e', 5, true)];
    expect(anchorFromReadSpot(mixed, { messageId: 'a', at: at(1) }, false)).toEqual({ kind: 'none' });
    const mixed2 = [line('a', 1), line('mine', 2, true), line('c', 3), line('d', 4)];
    expect(anchorFromReadSpot(mixed2, { messageId: 'a', at: at(1) }, false)).toEqual({
      kind: 'anchor', anchor: { id: 'c', ids: ['c', 'd'], count: 2 },
    });
  });

  it('never lands on a skipped line', () => {
    const withBot = [line('a', 1), line('bot', 2, false, true), line('c', 3)];
    expect(anchorFromReadSpot(withBot, { messageId: 'a', at: at(1) }, false)).toEqual({
      kind: 'anchor', anchor: { id: 'c', ids: ['c'], count: 1 },
    });
  });
});

describe('isLaterSpot', () => {
  it('moves only forward', () => {
    expect(isLaterSpot({ messageId: 'b', at: at(2) }, null)).toBe(true);
    expect(isLaterSpot({ messageId: 'b', at: at(2) }, { messageId: 'a', at: at(1) })).toBe(true);
    expect(isLaterSpot({ messageId: 'a', at: at(1) }, { messageId: 'b', at: at(2) })).toBe(false);
    expect(isLaterSpot({ messageId: 'a', at: at(1) }, { messageId: 'a', at: at(1) })).toBe(false);
  });
});
