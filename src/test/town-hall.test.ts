import { describe, expect, it } from 'vitest';
import { createStageDirector, HOLD_MS } from '@/lib/town-hall';

const levels = (entries: Array<[number, number]>) => new Map(entries);

describe('town hall stage director', () => {
  it('starts on the first other person and moves to whoever talks', () => {
    const director = createStageDirector();
    expect(director.update(levels([]), [0, 2, 3], 0).stage).toBe(2);
    // A new voice waits until the current one has had the stage a moment.
    expect(director.update(levels([[3, 0.4]]), [0, 2, 3], 100).stage).toBe(2);
    const moved = director.update(levels([[3, 0.4]]), [0, 2, 3], 1000);
    expect(moved.stage).toBe(3);
  });

  it('keeps the last speaker when everyone goes quiet', () => {
    const director = createStageDirector();
    director.update(levels([[3, 0.4]]), [0, 2, 3], 1000);
    expect(director.update(levels([]), [0, 2, 3], 5000).stage).toBe(3);
  });

  it('shows the loudest when several talk, without flipping between them', () => {
    const director = createStageDirector();
    const present = [0, 2, 3, 4];
    let now = 1000;
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++, now += 100) {
      seen.add(director.update(levels([[2, 0.2], [3, 0.5], [4, 0.3]]), present, now).stage!);
    }
    expect(director.update(levels([[2, 0.2], [3, 0.5], [4, 0.3]]), present, now).stage).toBe(3);
    // 2 started on stage (first other person), then 3 took over; 4 never did.
    expect(seen.has(4)).toBe(false);
    // Two voices about as loud: the one on stage keeps it.
    for (let i = 0; i < 20; i++, now += 100) director.update(levels([[3, 0.5], [4, 0.52]]), present, now);
    expect(director.update(levels([[3, 0.5], [4, 0.52]]), present, now).stage).toBe(3);
    // 4 gets clearly louder: after the hold, 4 has it.
    for (let i = 0; i < 20; i++, now += HOLD_MS / 10) director.update(levels([[3, 0.2], [4, 0.6]]), present, now);
    expect(director.update(levels([[3, 0.2], [4, 0.6]]), present, now).stage).toBe(4);
  });

  it('a pinned person keeps the stage whoever talks', () => {
    const director = createStageDirector();
    const state = director.update(levels([[2, 0.5], [3, 0.5]]), [0, 2, 3], 1000, 0);
    expect(state.stage).toBe(0);
  });

  it('lets go of someone who left', () => {
    const director = createStageDirector();
    director.update(levels([[3, 0.4]]), [0, 2, 3], 1000);
    expect(director.update(levels([]), [0, 2], 2000).stage).toBe(2);
  });
});
