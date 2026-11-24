import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paintReactionArrival } from '../chat-reaction-motion';

const rect = (x: number, y: number, width: number, height: number) =>
  ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: () => ({}) }) as DOMRect;

/** A glyph whose on-screen spot the test moves by hand, like a chat list scrolling under it. */
function makeChip(at: { x: number; y: number } | null) {
  const chip = document.createElement('button');
  const glyph = document.createElement('span');
  glyph.textContent = '🔥';
  chip.appendChild(glyph);
  document.body.appendChild(chip);
  const spot = { current: at };
  glyph.getBoundingClientRect = () => {
    const p = spot.current;
    return (p ? rect(p.x - 8, p.y - 8, 16, 16) : rect(0, 0, 0, 0));
  };
  return { chip, glyph, spot };
}

function layerGroups(): HTMLElement[] {
  const layer = document.querySelector('[data-reaction-layer]');
  return layer ? (Array.from(layer.children) as HTMLElement[]) : [];
}

describe('chat reaction landing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const stub = { onfinish: null, oncancel: null, cancel() {} };
    (Element.prototype as unknown as { animate: unknown }).animate = vi.fn(() => ({ ...stub }));
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('follows the chip when the list moves it mid-flight, and lands on it', () => {
    const { chip, glyph, spot } = makeChip({ x: 400, y: 500 });
    const plan = paintReactionArrival({ chip, glyph, emoji: '🔥', mine: false, clip: null });
    expect(plan.landMs).toBeGreaterThan(0);
    // A chat that follows the newest line scrolls a frame later: the chip goes up 40px.
    vi.advanceTimersByTime(20);
    spot.current = { x: 400, y: 460 };
    vi.advanceTimersByTime(plan.landMs - 60);
    const group = layerGroups().find((g) => g.style.transform.startsWith('translate('));
    expect(group?.style.transform).toBe('translate(0px, -40px)');
  });

  it('does not fly anywhere when the chip is not on screen (hidden tab, closed panel)', () => {
    const { chip, glyph } = makeChip(null);
    const plan = paintReactionArrival({ chip, glyph, emoji: '🔥', mine: false, clip: null });
    expect(plan).toEqual({ landMs: 0, played: false });
    expect(layerGroups()).toHaveLength(0);
  });

  it('does not fly to a line scrolled out of its list', () => {
    const list = document.createElement('div');
    list.style.overflowY = 'auto';
    list.getBoundingClientRect = () => rect(0, 0, 300, 300);
    document.body.appendChild(list);
    const { chip, glyph } = makeChip({ x: 100, y: 600 });
    list.appendChild(chip);
    const plan = paintReactionArrival({ chip, glyph, emoji: '🔥', mine: false, clip: null });
    expect(plan.landMs).toBe(0);
  });
});
