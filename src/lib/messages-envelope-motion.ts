/** Shared with mobile. One slip per unread message, and the ring grows from a
 *  gentle beat at 1 unread to full strength at MESSAGE_SLIP_MAX. */
export const MESSAGE_SLIP_MAX = 20;

export interface MessageSlip { dx: number; dy: number; rotate: number; delayMs: number }

export function messagesEnvelopeMotion(count: number) {
  const unread = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const shown = Math.min(unread, MESSAGE_SLIP_MAX);
  const intensity = unread === 0 ? 0 : 0.78 + 0.62 * (shown - 1) / (MESSAGE_SLIP_MAX - 1);
  const slips: MessageSlip[] = [];
  for (let i = 0; i < shown; i++) {
    // Fan out over the top of the envelope; launch order hops around the fan.
    const angle = (shown === 1 ? 0 : -64 + 128 * i / (shown - 1)) * Math.PI / 180;
    const distance = (16 + 3.5 * ((i * 5) % 3)) * (0.8 + 0.25 * intensity);
    const order = (i * (shown % 7 ? 7 : 3)) % shown;
    slips.push({
      dx: Math.round(Math.sin(angle) * distance * 10) / 10,
      dy: Math.round((-Math.cos(angle) * distance - 3) * 10) / 10,
      rotate: Math.round(angle * 38 + (i % 2 ? 9 : -9)),
      delayMs: Math.round(100 + order * Math.min(220, 1000 / shown)),
    });
  }
  return {
    unread,
    intensity,
    swing: 13 * intensity,
    opacity: Math.min(1, 0.2 + 0.5 * intensity),
    reach: Math.min(12, 8 * intensity),
    cycleMs: Math.round(3400 / Math.sqrt(Math.max(1, intensity))),
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
