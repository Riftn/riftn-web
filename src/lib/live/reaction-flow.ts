export const LIVE_REACTION_EMOJI = {
  LIKE: '👍', HEART: '❤️', CELEBRATE: '🎉', SUPPORT: '✊', LAUGH: '😂',
  HOT: '🔥', HUNDRED: '💯', SAD: '😢', CRY: '😭', POO: '💩', DISLIKE: '👎',
} as const;
export type LiveReactionType = keyof typeof LIVE_REACTION_EMOJI;

export function liveReactionType(value: unknown): LiveReactionType | null {
  if (typeof value !== 'string') return null;
  const key = value.toUpperCase();
  const aliases: Record<string, LiveReactionType> = { LOVE: 'HEART', RESPECT: 'SUPPORT', LOL: 'LAUGH' };
  if (Object.prototype.hasOwnProperty.call(aliases, key)) return aliases[key];
  return Object.prototype.hasOwnProperty.call(LIVE_REACTION_EMOJI, key) ? key as LiveReactionType : null;
}

export interface ReactionParticle {
  id: string;
  type: LiveReactionType;
  expiresAt: number;
  /** Sent by a badge holder: drawn a size up. */
  big?: boolean;
}

export const REACTION_STEP_MS = 140;

/**
 * How each reaction moves. One table drives web and app, so a 🔥 looks the
 * same on every screen. The old flow was one 22px emoji drifting 120px for
 * 1.5s in a small corner box, which on a phone read as nothing happening.
 *
 * - duration: ms from pop-in to gone
 * - sway: px of side-to-side drift at the top of the climb
 * - waves: how many side-to-side swings over the climb
 * - pop: scale at the peak of the pop-in
 * - spin: full turn(s) over the climb (degrees), or 0
 * - wobble: degrees of rock either way, when it doesn't spin
 * - pulse: beats over the climb (a heart beating, a flame flickering), or 0
 */
export interface ReactionMotion {
  duration: number; sway: number; waves: number; pop: number;
  spin: number; wobble: number; pulse: number; pulseDepth: number;
}

export const REACTION_MOTION: Record<LiveReactionType, ReactionMotion> = {
  LIKE:      { duration: 2400, sway: 12, waves: 1,   pop: 1.45, spin: 0,   wobble: 8,  pulse: 0, pulseDepth: 0 },
  HEART:     { duration: 2800, sway: 22, waves: 1.5, pop: 1.35, spin: 0,   wobble: 6,  pulse: 4, pulseDepth: 0.14 },
  CELEBRATE: { duration: 2300, sway: 18, waves: 1,   pop: 1.5,  spin: 360, wobble: 0,  pulse: 0, pulseDepth: 0 },
  SUPPORT:   { duration: 2400, sway: 8,  waves: 1,   pop: 1.55, spin: 0,   wobble: 10, pulse: 2, pulseDepth: 0.1 },
  LAUGH:     { duration: 2600, sway: 16, waves: 2,   pop: 1.4,  spin: 0,   wobble: 22, pulse: 0, pulseDepth: 0 },
  HOT:       { duration: 2000, sway: 7,  waves: 2.5, pop: 1.4,  spin: 0,   wobble: 6,  pulse: 8, pulseDepth: 0.1 },
  HUNDRED:   { duration: 2400, sway: 12, waves: 1,   pop: 1.65, spin: 0,   wobble: 12, pulse: 0, pulseDepth: 0 },
  SAD:       { duration: 3200, sway: 10, waves: 1,   pop: 1.2,  spin: 0,   wobble: 5,  pulse: 0, pulseDepth: 0 },
  CRY:       { duration: 3200, sway: 14, waves: 1.5, pop: 1.25, spin: 0,   wobble: 8,  pulse: 3, pulseDepth: 0.08 },
  POO:       { duration: 2600, sway: 14, waves: 2,   pop: 1.45, spin: 0,   wobble: 18, pulse: 0, pulseDepth: 0 },
  DISLIKE:   { duration: 2400, sway: 8,  waves: 1,   pop: 1.3,  spin: 0,   wobble: 8,  pulse: 0, pulseDepth: 0 },
};

/** Emoji size in px; badge holders' reactions are drawn a size up. */
export const REACTION_SIZE = 32;
export const REACTION_SIZE_BIG = 40;
/** Width of the lane the reactions climb, on the right edge of the picture. */
export const REACTION_LANE_WIDTH = 120;

export interface ReactionPose {
  /** px from the particle's start column, positive is right */
  x: number;
  /** 0 at the bottom of the lane, 1 at the top */
  rise: number;
  /** degrees */
  rotate: number;
  scale: number;
  opacity: number;
}

/** 0..1 eased with a gentle start and finish, so nothing snaps. */
function smooth(u: number): number {
  'worklet';
  const v = Math.max(0, Math.min(1, u));
  return v * v * (3 - 2 * v);
}

/**
 * How far past full size the pop goes. The table's figures read as a jolt on
 * a phone (a 32px emoji jumping to 53px in a tenth of a second), so the pop is
 * a softer swell of a bit under half of that.
 */
function popPeak(m: ReactionMotion): number {
  'worklet';
  return 1 + (m.pop - 1) * 0.6;
}

/** Where a particle sits `t` (0..1) of the way through its climb. */
export function reactionPose(type: LiveReactionType, seed: number, t: number): ReactionPose {
  // The app runs this on the UI thread inside an animated style.
  'worklet';
  const m = REACTION_MOTION[type] ?? REACTION_MOTION.LIKE;
  const p = Math.max(0, Math.min(1, t));
  const phase = (seed * 2.39996) % (Math.PI * 2);
  const side = seed % 2 ? 1 : -1;
  const peak = popPeak(m);
  // Swell in (fast out of the button, easing into the peak), settle to full
  // size, then shrink a little as it fades near the top. Every leg is eased,
  // so there is no corner where the size changes speed all at once.
  let scale = p < 0.08 ? 0.4 + (peak - 0.4) * (1 - Math.pow(1 - p / 0.08, 3))
    : p < 0.22 ? peak + (1 - peak) * smooth((p - 0.08) / 0.14)
    : p > 0.72 ? 1 - 0.2 * smooth((p - 0.72) / 0.28)
    : 1;
  // The beat (a heart, a flame) fades in after the pop rather than fighting it.
  if (m.pulse) scale *= 1 + m.pulseDepth * smooth((p - 0.15) / 0.15) * Math.sin(p * Math.PI * 2 * m.pulse);
  // The rock also eases in from upright, so a particle never starts tilted.
  const rotate = m.spin
    ? side * m.spin * (1 - Math.pow(1 - p, 2))
    : m.wobble * smooth(p / 0.2) * Math.sin(p * Math.PI * 2 * 1.5 + phase);
  return {
    x: m.sway * (0.25 + 0.75 * p) * Math.sin(p * Math.PI * 2 * m.waves + phase) - m.sway * 0.25 * Math.sin(phase),
    // Quick off the button, easing out as it nears the top.
    rise: 1 - Math.pow(1 - p, 1.7),
    rotate,
    scale,
    opacity: p < 0.06 ? smooth(p / 0.06) : p > 0.68 ? 1 - smooth((p - 0.68) / 0.32) : 1,
  };
}

/** The column a particle starts in, px from the lane's right edge. */
export function reactionColumn(seed: number): number {
  return 6 + (seed * 37 % 5) * 14;
}

/**
 * The most emoji in the air at once. Past about two dozen a phone's lane is a
 * smear rather than applause, and every extra one is another layer to move.
 */
export const MAX_ACTIVE = 24;

/** A small FIFO fountain. Bound both the picture and the backlog during a raid. */
export class ReactionFlowQueue {
  private pending: { type: LiveReactionType; big: boolean }[] = [];
  private active: ReactionParticle[] = [];
  private sequence = 0;

  enqueue(value: unknown, weight = 1): void {
    const type = liveReactionType(value);
    if (!type) return;
    const safeWeight = Number.isFinite(weight) ? Math.max(1, Math.min(14, weight)) : 1;
    const count = safeWeight > 1 ? 5 + Math.floor(Math.log2(safeWeight)) * 2 : 3;
    for (let i = 0; i < count; i++) this.pending.push({ type, big: safeWeight > 1 });
    // Keep recent applause rather than replaying minutes of stale reactions.
    if (this.pending.length > 600) this.pending.splice(0, this.pending.length - 600);
  }

  /**
   * The viewer's own tap: one emoji up NOW, not in the queue behind the room.
   * Every tap is another one, so holding a finger to the button reads as a
   * stream of applause rather than a trickle that lags the taps. A full lane
   * gives up its oldest (the one already fading at the top) to make room.
   */
  launch(value: unknown, weight = 1, now = Date.now()): boolean {
    const type = liveReactionType(value);
    if (!type) return false;
    const big = Number.isFinite(weight) && weight > 1;
    this.active = this.active.filter(item => item.expiresAt > now);
    if (this.active.length >= MAX_ACTIVE) this.active.shift();
    this.active.push({ id: String(++this.sequence), type, big, expiresAt: now + REACTION_MOTION[type].duration });
    // A badge holder's tap trails one more, never a backlog of them.
    if (big && this.pending.length < 12) this.pending.push({ type, big });
    return true;
  }

  tick(now: number): ReactionParticle[] {
    this.active = this.active.filter(item => item.expiresAt > now);
    const count = Math.min(MAX_ACTIVE - this.active.length, this.pending.length > 30 ? 3 : 1);
    for (let i = 0; i < count && this.pending.length; i++) {
      const next = this.pending.shift()!;
      this.active.push({ id: String(++this.sequence), type: next.type, big: next.big, expiresAt: now + REACTION_MOTION[next.type].duration });
    }
    return [...this.active];
  }

  get busy(): boolean { return this.pending.length > 0 || this.active.length > 0; }
  remove(id: string): void { this.active = this.active.filter(item => item.id !== id); }
  clear(): void { this.pending = []; this.active = []; }
}
