import { describe, it, expect } from 'vitest';
import { countLinesBelow } from '@/lib/chat-lines-below';
import { formatUnreadCount } from '@/lib/unread-count';

/** A fake thread: line i spans [i*20, i*20+20) in a 400px tall box scrolled to `top`. */
function thread(total: number, top: number) {
  const container = { getBoundingClientRect: () => ({ top: 0, bottom: 400 }) } as unknown as HTMLElement;
  const ids = Array.from({ length: total }, (_, i) => String(i));
  const getEl = (id: string) => ({ getBoundingClientRect: () => ({ top: Number(id) * 20 - top }) }) as unknown as Element;
  return { container, ids, getEl };
}

describe('scroll-down count', () => {
  it('counts every line below the fold, far past one page', () => {
    const { container, ids, getEl } = thread(5000, 0);
    // Lines 0..19 fill the box; line 20 starts at 400, past the fold.
    expect(countLinesBelow(container, ids, getEl)).toBe(4980);
  });
  it('is zero at the bottom', () => {
    const { container, ids, getEl } = thread(100, 100 * 20 - 400);
    expect(countLinesBelow(container, ids, getEl)).toBe(0);
  });
  it('skips lines that are not on the page', () => {
    const { container, ids, getEl } = thread(100, 0);
    expect(countLinesBelow(container, ids, (id) => (Number(id) < 50 ? null : getEl(id)))).toBe(50);
  });
  it('reads short, never capped', () => {
    expect(formatUnreadCount(43)).toBe('43');
    expect(formatUnreadCount(1240)).toBe('1.2K');
    expect(formatUnreadCount(3_400_000)).toBe('3.4M');
  });
});
