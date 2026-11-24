import { describe, expect, it } from 'vitest';
import { createStageDirector, SWAP_MS } from '@/lib/town-hall';

const levels = (entries: Array<[number, number]>) => new Map(entries);

describe('town hall stage director', () => {
  it('starts on the first other person and moves to whoever talks', () => {
    const director = createStageDirector();
    expect(director.update(levels([]), [0, 2, 3], 0).stage).toBe(2);
    // A new voice waits until the current one has had the stage a moment.
    expect(director.update(levels([[3, 0.4]]), [0, 2, 3], 100).stage).toBe(2);
    const moved = director.update(levels([[3, 0.4]]), [0, 2, 3], 1000);
    expect(moved.stage).toBe(3);
    expect(moved.contested).toBe(false);
  });

  it('keeps the last speaker when everyone goes quiet', () => {
    const director = createStageDirector();
    director.update(levels([[3, 0.4]]), [0, 2, 3], 1000);
    expect(director.update(levels([]), [0, 2, 3], 5000).stage).toBe(3);
  });

  it('hops between people talking at once, then settles', () => {
    const director = createStageDirector();
    const present = [0, 2, 3, 4];
    let now = 1000;
    const seen = new Set<number>();
    for (let i = 0; i < 12; i++, now += SWAP_MS / 2) {
      const state = director.update(levels([[2, 0.4], [3, 0.3], [4, 0.2]]), present, now);
      expect(state.contested).toBe(true);
      seen.add(state.stage!);
    }
    expect(seen).toEqual(new Set([2, 3, 4]));
    // Only 4 keeps going: the stage lands on 4 and the hopping stops.
    let state = director.update(levels([[4, 0.4]]), present, now += 1000);
    state = director.update(levels([[4, 0.4]]), present, now += 1000);
    expect(state.stage).toBe(4);
    expect(state.contested).toBe(false);
  });

  it('a pinned person keeps the stage whoever talks', () => {
    const director = createStageDirector();
    const state = director.update(levels([[2, 0.5], [3, 0.5]]), [0, 2, 3], 1000, 0);
    expect(state.stage).toBe(0);
    expect(state.contested).toBe(false);
  });

  it('lets go of someone who left', () => {
    const director = createStageDirector();
    director.update(levels([[3, 0.4]]), [0, 2, 3], 1000);
    expect(director.update(levels([]), [0, 2], 2000).stage).toBe(2);
  });
});
