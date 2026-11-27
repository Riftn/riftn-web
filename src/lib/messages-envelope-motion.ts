/** Shared with mobile. One slip per unread message, and the ring grows from a
 *  gentle beat at 1 unread to full strength at MESSAGE_SLIP_MAX. Each slip
 *  pops out of the envelope's top edge like a little worm, wriggling up and
 *  out to its own side, fading away as it starts to fall. A few unread only
 *  peek out of the top; the bigger fling is kept for a big pile. */
export const MESSAGE_SLIP_MAX = 20;

/** 0 at 1 unread, 1 at MESSAGE_SLIP_MAX. Eased so 1 to 3 stay small and the
 *  big throws only arrive once the pile really grows. */
export function messageSlipSize(count: number) {
  const shown = Math.min(MESSAGE_SLIP_MAX, Math.max(1, Math.floor(count)));
  return Math.pow((shown - 1) / (MESSAGE_SLIP_MAX - 1), 0.8);
}

/** One point on a slip's trip, in the icon's 32-unit viewBox, measured from
 *  the envelope's centre. `t` runs 0..1 over the slip's life. */
export interface WormFrame { t: number; x: number; y: number; rotate: number; sx: number; sy: number; opacity: number }
export interface MessageSlip { delayMs: number; lifeMs: number; frames: WormFrame[] }

const FRAME_COUNT = 24;
const round = (value: number) => Math.round(value * 100) / 100;
/** Same numbers every time for the same slip, so a new message adds a worm
 *  without reshuffling the ones already crawling. */
const seeded = (index: number, salt: number) => {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

function wormPath(index: number, intensity: number, size: number) {
  // Every slip pops out of the envelope's top edge from its own spot along
  // it, flies up and out to its own side, slows, then falls back down past the
  // envelope like it was thrown: a little upward kick, then gravity. The golden
  // ratio hops each new slip to a fresh lean, so a pile of them fans out.
  const spread = index === 0 ? -.3 : ((index * .618034 + seeded(index, 1) * .2) % 1) * 2 - 1;
  // Nobody goes dead straight up and drops back in: lean at least a little.
  const lean = Math.sign(spread || 1) * (.3 + .7 * Math.abs(spread));
  const startX = (lean * .55 + (seeded(index, 7) - .5) * .4) * 9;
  // How far out it flies grows with the pile: one unread only peeks a slip
  // just clear of the top edge (about 10 units up, a few to the side).
  const reach = lean * (22 + 14 * seeded(index, 2)) * (.85 + .2 * intensity) * (.2 + .8 * size);
  const fullPeak = (15 + 9 * seeded(index, 8)) * (.85 + .2 * intensity);
  const peak = 10 + (fullPeak - 10) * size;
  const peakAt = .3 + .08 * seeded(index, 9);
  const gravity = peak / (peakAt * peakAt);
  const waves = 1.6 + seeded(index, 3);
  const amplitude = (1.9 + 1.3 * seeded(index, 4)) * (.45 + .55 * size);
  const twist = seeded(index, 5) * Math.PI * 2;
  const point = (t: number) => {
    // Starts just inside the envelope (y -6 from its centre, the top edge is
    // at -11) and is clipped until it clears the edge.
    const x = startX + reach * t;
    const y = -6 - 2 * gravity * peakAt * t + gravity * t * t;
    // Wriggle across the way it is flying.
    const vx = reach;
    const vy = -2 * gravity * peakAt + 2 * gravity * t;
    const speed = Math.hypot(vx, vy) || 1;
    const sway = amplitude * Math.min(1, t * 3) * Math.sin(Math.PI * 2 * waves * t + twist);
    return { x: x - vy / speed * sway, y: y + vx / speed * sway };
  };
  const dirX = lean;
  // Keep the slip's letter line on top: worms heading left turn round.
  const flip = dirX < 0 ? 180 : 0;
  // A few unread fade out just as they start to drop. The fall gets longer
  // as the pile grows, building up to the full tumble at MESSAGE_SLIP_MAX.
  const end = Math.min(1, peakAt + .14 + (.86 - peakAt) * size * size);
  const frames: WormFrame[] = [];
  let previous = 0;
  for (let step = 0; step <= FRAME_COUNT; step++) {
    const t = step / FRAME_COUNT;
    const u = t * end;
    const here = point(u);
    const ahead = point(Math.min(1, u + .01));
    const behind = point(Math.max(0, u - .01));
    let rotate = Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180 / Math.PI + flip;
    // Unwrap so the slip never spins the long way round between frames.
    while (rotate - previous > 180) rotate -= 360;
    while (rotate - previous < -180) rotate += 360;
    previous = rotate;
    const grow = u < .12 ? .55 + .45 * u / .12 : t > .6 ? 1 - .2 * (t - .6) / .4 : 1;
    // A light inchworm squish: stretch along the way it's going, then bunch up.
    const squish = 1 + .12 * Math.sin(Math.PI * 4 * waves * u + twist);
    // Fades from the top of the arc so it is gone as it starts to fall.
    const fadeFrom = Math.min(peakAt, end - .1) / end;
    const opacity = u < .05 ? round(u / .05) : t > fadeFrom ? round(1 - (t - fadeFrom) / (1 - fadeFrom)) : 1;
    frames.push({
      t: round(t), x: round(here.x), y: round(here.y), rotate: Math.round(rotate),
      sx: round(grow * squish), sy: round(grow / Math.sqrt(squish)), opacity,
    });
  }
  return { frames, lifeMs: Math.round((1100 + (400 + 600 * seeded(index, 6)) * size) * end) };
}

export function messagesEnvelopeMotion(count: number) {
  const unread = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const shown = Math.min(unread, MESSAGE_SLIP_MAX);
  const size = messageSlipSize(shown);
  // A soft nudge at 1 unread (about 4 degrees of swing), full ring at the cap.
  const intensity = unread === 0 ? 0 : 0.32 + 1.08 * size;
  const cycleMs = Math.round(3400 / Math.sqrt(Math.max(.6, intensity)));
  const slips: MessageSlip[] = [];
  for (let i = 0; i < shown; i++) {
    const { frames, lifeMs } = wormPath(i, intensity, size);
    const delayMs = Math.round(90 + i * Math.min(110, 600 / shown));
    // Every worm is home before the next ring starts.
    slips.push({ frames, delayMs, lifeMs: Math.round(Math.min(lifeMs, cycleMs * .9 - delayMs)) });
  }
  return {
    unread,
    intensity,
    swing: 13 * intensity,
    opacity: Math.min(1, 0.2 + 0.5 * intensity),
    reach: Math.min(12, 8 * intensity),
    cycleMs,
    slips,
  };
}

/** Follow the two sides of CutMessageEnvelope, in its 32-unit viewBox. */
export const ENVELOPE_SIDE_RIPPLE_PATHS = [
  'M2.6 8.5Q1.5 16 2.6 23.5',
  'M29.4 8.5Q30.5 16 29.4 23.5',
] as const;

export const ENVELOPE_BODY_PATH = 'M4 5H20.2Q28 5 28 12.8V27H11.8Q4 27 4 19.2Z M6.6 7.6V19.2Q6.6 24.4 11.8 24.4H25.4V12.8Q25.4 7.6 20.2 7.6Z';
export const ENVELOPE_FLAP_PATH = 'M6 8L16 16.6L26 8';
/** Everywhere around the icon except the envelope's own box (32-unit viewBox,
 *  even-odd), so slips only show once they are out of the envelope. */
export const SLIP_WINDOW_PATH = 'M-40 -60H72V80H-40Z M4 5.2H28V27H4Z';
