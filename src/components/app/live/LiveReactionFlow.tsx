import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import { useReactionFlow } from '@/hooks/use-reaction-flow';
import { LIVE_REACTION_EMOJI, REACTION_LANE_WIDTH, REACTION_MOTION, REACTION_SIZE, REACTION_SIZE_BIG, reactionColumn, reactionPose, type ReactionParticle } from '@/lib/live/reaction-flow';
import { useAuth } from '@/contexts/AuthContext';

/**
 * What the viewer who tapped is about to see, played locally.
 *
 * `nonce` is what makes a repeat of the same reaction a new particle; the type
 * alone cannot, because tapping 👍 twice is the common case.
 */
export interface SelfReaction {
  type: unknown;
  weight?: number;
  nonce: number;
}

export function LiveReactionFlow({ streamId, enabled, bottom = 24, self }: {
  streamId?: string | null;
  enabled: boolean;
  bottom?: number;
  /**
   * The signed-in viewer's own reaction, played the instant they tap it.
   *
   * A tip puts its celebration up on submission and lets the broadcast serve
   * the rest of the room. Reactions used to take the echo as their only
   * source, so a viewer whose socket had dropped, who was not in the room, or
   * whose stream id never resolved tapped the thumb and saw nothing at all —
   * no floating thumb, no error, nothing. The echo is still what the room
   * sees; this is only the sender's own copy.
   */
  self?: SelfReaction | null;
}) {
  const { reactions, addReaction, launchReaction, clearReactions } = useReactionFlow();
  const reducedMotion = useReducedMotion();
  const { isAuthenticated, walletAddress } = useAuth();
  useEffect(() => {
    clearReactions();
    if (!streamId || !enabled) return;
    let cancelled = false;
    let subscription: { leave: () => void } | undefined;
    import('@/lib/api/dehub/stream-presence').then(({ watchStreamReactions }) => {
      if (!cancelled) subscription = watchStreamReactions(streamId, event => {
        // Already played locally on tap — this is the same reaction coming
        // back round, not a second one.
        if (event.isOwnReaction) return;
        addReaction(event.reactionType, event.weight);
      });
    }).catch(() => undefined);
    return () => { cancelled = true; subscription?.leave(); clearReactions(); };
  }, [streamId, enabled, addReaction, clearReactions, isAuthenticated, walletAddress]);

  const lastSelfNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!self || self.nonce === lastSelfNonce.current) return;
    lastSelfNonce.current = self.nonce;
    // Up at once, one per tap: tapping again sends another, like applause.
    launchReaction(self.type, self.weight ?? 1);
  }, [self, launchReaction]);

  // The lane stays in the picture as an empty anchor: it says where the
  // emoji start and how far they climb. The emoji themselves draw on a layer
  // outside the video, so the media box's rounded edge, the close button and
  // the bottom controls can no longer cut them; they rise over all of it and
  // drift lightly past the card's edge.
  const lane = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<{ el: HTMLElement; fixed: boolean } | null>(null);
  const active = reactions.length > 0;

  useLayoutEffect(() => {
    if (!active || !lane.current) { setHost(null); return; }
    // Inside a full-screen viewer, draw in that viewer so the layer stays in
    // its stacking order (under its sheets and menus). In the feed, the page.
    let el: HTMLElement | null = lane.current.parentElement;
    while (el && el !== document.body && getComputedStyle(el).position !== 'fixed') el = el.parentElement;
    setHost(el && el !== document.body ? { el, fixed: false } : { el: document.body, fixed: true });
  }, [active]);

  // Layout effect, so the first frame is already in place and never flashes
  // in the corner of the page.
  useLayoutEffect(() => {
    if (!host) return;
    // Follows the lane when something could have moved it: a scroll (a feed
    // carries the emoji with its card), a resize, or the lane itself changing
    // size. It used to measure on every animation frame, and with the emoji
    // writing their own styles each frame that forced a layout per frame over
    // a playing video, which is what made the climb stutter.
    let frame = 0;
    let last = '';
    const sync = () => {
      frame = 0;
      const from = lane.current?.getBoundingClientRect();
      const to = layer.current;
      if (!from || !to) return;
      const base = host.fixed ? { left: 0, top: 0 } : host.el.getBoundingClientRect();
      const next = `${from.left - base.left}|${from.top - base.top}|${from.width}|${from.height}`;
      if (next === last) return;
      last = next;
      to.style.transform = `translate3d(${from.left - base.left}px, ${from.top - base.top}px, 0)`;
      to.style.width = `${from.width}px`;
      to.style.height = `${from.height}px`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
    sync();
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (lane.current) observer?.observe(lane.current);
    if (!host.fixed) observer?.observe(host.el);
    // A card can also move without a scroll (a banner above it opening); a
    // slow check catches that without measuring every frame.
    const slow = window.setInterval(schedule, 400);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      window.clearInterval(slow);
    };
  }, [host]);

  return <>
    <div ref={lane} aria-hidden="true" data-live-reaction-flow className="pointer-events-none absolute right-1"
      style={{ bottom, width: REACTION_LANE_WIDTH, height: `min(52%, 400px)` }} />
    {host && createPortal(
      <div ref={layer} aria-hidden="true" data-live-reaction-layer
        className={`pointer-events-none left-0 top-0 ${host.fixed ? 'fixed z-40' : 'absolute z-[60]'}`}>
        {reactions.map(item => <ReactionParticleView key={item.id} item={item} lane={lane} still={!!reducedMotion} />)}
      </div>,
      host.el,
    )}
  </>;
}

/** Frames sampled from reactionPose per climb; the browser eases between them. */
const POSE_FRAMES = 36;

/**
 * One emoji on its climb, driven by reactionPose (the same curve the app
 * draws) but handed to the browser as a Web Animation of transform and
 * opacity only. The browser runs that on the compositor, off the main thread,
 * so a busy page (chat arriving, the player decoding) cannot make it stutter;
 * the old version recomputed five values in script on every frame per emoji.
 */
function ReactionParticleView({ item, lane, still }: { item: ReactionParticle; lane: React.RefObject<HTMLDivElement>; still: boolean }) {
  const seed = Number(item.id);
  const ref = useRef<HTMLSpanElement>(null);
  const size = item.big ? REACTION_SIZE_BIG : REACTION_SIZE;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const climb = Math.max(120, (lane.current?.clientHeight ?? 300) - size);
    const frames: Keyframe[] = [];
    for (let i = 0; i <= POSE_FRAMES; i++) {
      const pose = reactionPose(item.type, seed, i / POSE_FRAMES);
      frames.push(still
        ? { opacity: pose.opacity }
        : {
            opacity: pose.opacity,
            transform: `translate3d(${pose.x.toFixed(2)}px, ${(-pose.rise * climb).toFixed(2)}px, 0) rotate(${pose.rotate.toFixed(2)}deg) scale(${pose.scale.toFixed(4)})`,
          });
    }
    const animation = el.animate(frames, { duration: REACTION_MOTION[item.type].duration, easing: 'linear', fill: 'both' });
    return () => animation.cancel();
    // A particle's path is fixed at birth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span ref={ref} data-live-reaction={item.type}
    className="absolute bottom-0 leading-none"
    style={{ right: reactionColumn(seed), fontSize: size, opacity: 0, willChange: 'transform, opacity',
      // text-shadow, not a drop-shadow filter: a filter on a moving glyph is
      // an offscreen repaint every frame in Safari, over a playing video.
      textShadow: '0 2px 6px rgba(0,0,0,.45)' }}
  >{LIVE_REACTION_EMOJI[item.type]}</span>;
}
