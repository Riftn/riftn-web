import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactionFlowQueue, REACTION_STEP_MS, type ReactionParticle } from '@/lib/live/reaction-flow';

function sameParticles(a: ReactionParticle[], b: ReactionParticle[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function useReactionFlow() {
  const queue = useRef(new ReactionFlowQueue());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reactions, setReactions] = useState<ReactionParticle[]>([]);
  const clearReactions = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    queue.current.clear();
    setReactions([]);
  }, []);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    queue.current.clear();
  }, []);
  // Most steps only wait for particles to finish their climb: the same list
  // keeps the same array, so nothing re-renders while they fly.
  const publish = useCallback((next: ReactionParticle[]) => {
    setReactions(current => (sameParticles(current, next) ? current : next));
  }, []);
  const run = useCallback(() => {
    if (timer.current !== null || !queue.current.busy) return;
    const step = () => {
      publish(queue.current.tick(Date.now()));
      timer.current = queue.current.busy ? setTimeout(step, REACTION_STEP_MS) : null;
    };
    step();
  }, [publish]);
  const addReaction = useCallback((type: unknown, weight = 1) => {
    queue.current.enqueue(type, weight);
    run();
  }, [run]);
  /** The viewer's own tap: up at once, one per tap (see ReactionFlowQueue.launch). */
  const launchReaction = useCallback((type: unknown, weight = 1) => {
    if (!queue.current.launch(type, weight, Date.now())) return;
    publish(queue.current.tick(Date.now()));
    run();
  }, [publish, run]);
  const removeReaction = useCallback((id: string) => {
    queue.current.remove(id);
    setReactions(items => items.filter(item => item.id !== id));
  }, []);
  return { reactions, addReaction, launchReaction, removeReaction, clearReactions };
}
