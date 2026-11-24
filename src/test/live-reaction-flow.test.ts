import { describe, it, expect } from 'vitest';
import { ReactionFlowQueue, liveReactionType, REACTION_STEP_MS, LIVE_REACTION_EMOJI, REACTION_MOTION, reactionPose, MAX_ACTIVE, type LiveReactionType } from '@/lib/live/reaction-flow';

function drain(queue: ReactionFlowQueue) {
  const seen = new Map<string, string>();
  for (let now = 0; queue.busy && now < 120000; now += REACTION_STEP_MS) {
    const particles = queue.tick(now);
    expect(particles.length).toBeLessThanOrEqual(30);
    particles.forEach(item => seen.set(item.id, item.type));
  }
  expect(queue.busy).toBe(false);
  return [...seen.values()];
}

describe('live reaction flow', () => {
  it('paces every click into several particles without replacing another viewer', () => {
    const queue = new ReactionFlowQueue();
    queue.enqueue('love');
    queue.enqueue('LIKE');
    expect(queue.tick(0).map(item => item.type)).toEqual(['HEART']);
    expect(drain(queue)).toEqual(['HEART', 'HEART', 'HEART', 'LIKE', 'LIKE', 'LIKE']);
  });
  it('gives badge holders more particles while keeping their size and lifetime unchanged', () => {
    const ordinary = new ReactionFlowQueue();
    const badge = new ReactionFlowQueue();
    ordinary.enqueue('HEART');
    badge.enqueue('HEART', 14);
    expect(drain(ordinary)).toHaveLength(3);
    expect(drain(badge)).toHaveLength(11);
  });
  it('handles a busy audience with bounded simultaneous particles and no lost normal clicks', () => {
    const queue = new ReactionFlowQueue();
    for (let i = 0; i < 100; i++) queue.enqueue(i % 2 ? 'LIKE' : 'HEART');
    expect(drain(queue)).toHaveLength(300);
  });
  it('clears pending and flying particles when the room ends or changes', () => {
    const queue = new ReactionFlowQueue();
    queue.enqueue('HOT', 14);
    queue.tick(0);
    queue.clear();
    expect(queue.busy).toBe(false);
    expect(queue.tick(200)).toEqual([]);
  });
  it('rejects unknown reactions and handles malformed badge weights', () => {
    expect(liveReactionType('respect')).toBe('SUPPORT');
    expect(liveReactionType('lol')).toBe('LAUGH');
    expect(liveReactionType('__proto__')).toBeNull();
    const queue = new ReactionFlowQueue();
    queue.enqueue('bad');
    expect(queue.busy).toBe(false);
    queue.enqueue('CRY', NaN);
    expect(drain(queue)).toHaveLength(3);
  });
  it('gives every reaction a climb that pops in, rises and fades out', () => {
    for (const type of Object.keys(LIVE_REACTION_EMOJI) as LiveReactionType[]) {
      expect(REACTION_MOTION[type].duration).toBeGreaterThanOrEqual(2000);
      const start = reactionPose(type, 3, 0);
      const pop = reactionPose(type, 3, 0.07);
      const end = reactionPose(type, 3, 1);
      expect(start.rise).toBe(0);
      expect(start.opacity).toBe(0);
      expect(pop.scale).toBeGreaterThan(1.1);
      expect(end.rise).toBe(1);
      expect(end.opacity).toBe(0);
    }
  });
  it('keeps a particle alive for its own reaction\'s duration', () => {
    const queue = new ReactionFlowQueue();
    queue.enqueue('SAD');
    const [first] = queue.tick(0);
    expect(first.expiresAt).toBe(REACTION_MOTION.SAD.duration);
  });
  it('puts every own tap up at once, one per tap, never more than the lane holds', () => {
    const queue = new ReactionFlowQueue();
    expect(queue.launch('LIKE', 1, 0)).toBe(true);
    expect(queue.tick(0)).toHaveLength(1);
    for (let i = 1; i < 60; i++) queue.launch('LIKE', 1, i * 20);
    const air = queue.tick(60 * 20);
    expect(air).toHaveLength(MAX_ACTIVE);
    // The newest tap is always in the air; the oldest gave way.
    expect(air[air.length - 1].id).toBe('60');
    expect(queue.launch('nonsense', 1, 0)).toBe(false);
  });
  it('lets a badge holder\'s tap trail one more, never a backlog', () => {
    const queue = new ReactionFlowQueue();
    for (let i = 0; i < 50; i++) queue.launch('HEART', 14, i);
    expect(drain(queue).length).toBeLessThanOrEqual(50 + 12);
  });
  it('moves without jumps: size, fade and tilt change a little per step', () => {
    for (const type of Object.keys(LIVE_REACTION_EMOJI) as LiveReactionType[]) {
      let prev = reactionPose(type, 5, 0);
      for (let i = 1; i <= 1000; i++) {
        const next = reactionPose(type, 5, i / 1000);
        expect(Math.abs(next.scale - prev.scale)).toBeLessThan(0.05);
        expect(Math.abs(next.opacity - prev.opacity)).toBeLessThan(0.05);
        expect(Math.abs(next.rotate - prev.rotate)).toBeLessThan(2);
        expect(Math.abs(next.x - prev.x)).toBeLessThan(1);
        prev = next;
      }
      // It leaves the button from its own column, upright.
      const start = reactionPose(type, 5, 0);
      expect(Math.abs(start.x)).toBeLessThan(1e-9);
      expect(Math.abs(start.rotate)).toBeLessThan(1e-9);
    }
  });
});

