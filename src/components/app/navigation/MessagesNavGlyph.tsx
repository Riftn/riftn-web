import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LucideProps } from 'lucide-react';
import MessageEnvelope from '@/components/ui/cut-icons/message-envelope';
import {
  ENVELOPE_BODY_PATH, ENVELOPE_FLAP_PATH, ENVELOPE_SIDE_RIPPLE_PATHS, MESSAGE_SLIP_TAIL, SLIP_WINDOW_PATH, messagesEnvelopeMotion,
  type MessageSlip, type WormFrame,
} from '@/lib/messages-envelope-motion';
import './messages-nav-glyph.css';

function RedEnvelope() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d={ENVELOPE_BODY_PATH} fill="var(--messages-red)" fillRule="evenodd" />
      <path d={ENVELOPE_FLAP_PATH} stroke="var(--messages-red)" strokeWidth="2.6" strokeLinejoin="round" />
    </svg>
  );
}

/** One @keyframes rule per slip: hidden for most of the ring, then a wriggly
 *  trip that starts at its launch moment, so every ring replays it in step. */
function slipKeyframes(name: string, slip: MessageSlip, frames: WormFrame[], cycleMs: number) {
  const at = (t: number) => Math.min(100, (slip.delayMs + t * slip.lifeMs) / cycleMs * 100).toFixed(2);
  const stops = frames.map(f => `${at(f.t)}%{opacity:${f.opacity};transform:translate(${f.x}px,${f.y}px) rotate(${f.rotate}deg) scale(${f.sx},${f.sy})}`);
  const first = frames[0];
  const last = frames[frames.length - 1];
  return `@keyframes ${name}{0%{opacity:0;transform:translate(${first.x}px,${first.y}px) scale(.4)}${stops.join('')}`
    + `${Math.min(100, Number(at(1)) + .01).toFixed(2)}%,100%{opacity:0;transform:translate(${last.x}px,${last.y}px) scale(.6)}}`;
}

/**
 * Messages icon for the bottom bar and the side panel. Unread messages ring it
 * on the same beat as the notification bell: it swings, glows red, sends lines
 * off both sides and one red slip per unread message (up to 20) wriggles out
 * of its top edge like a little worm, flies up and out to its own side, then
 * tumbles back down. More unread
 * means a harder, faster ring.
 */
export function MessagesNavGlyph({ unread, className, ...props }: LucideProps & { unread: number }) {
  const glyphId = `messages-slips-${useId().replace(/:/g, '')}`;
  const profile = useMemo(() => messagesEnvelopeMotion(unread), [unread]);
  const keyframes = useMemo(() => profile.slips.map((slip, index) => {
    const name = `${glyphId}-${profile.unread}-${index}`;
    const body = slip.tail.map((track, k) => slipKeyframes(`${name}-${k}`, slip, track, profile.cycleMs));
    return slipKeyframes(name, slip, slip.frames, profile.cycleMs) + body.join('');
  }).join(''), [glyphId, profile]);
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(() => !document.hidden);
  const [run, setRun] = useState(0);
  const last = useRef(unread);
  useEffect(() => {
    if (unread > last.current) setRun(n => n + 1);
    last.current = unread;
  }, [unread]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = typeof IntersectionObserver === 'undefined' ? null
      : new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (observer) observer.observe(element);
    else setVisible(true);
    const update = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  const ringing = profile.unread > 0;
  const style = {
    '--messages-swing': `${profile.swing}deg`,
    '--messages-opacity': profile.opacity,
    '--messages-reach': `${profile.reach}px`,
    '--messages-cycle': `${profile.cycleMs}ms`,
  } as CSSProperties;
  return (
    <span ref={ref} className="messages-nav-glyph" style={style}
      data-unread={ringing} data-unread-count={profile.unread} data-running={visible && foreground}>
      <span key={run} className="messages-nav-glyph__swing">
        {ringing && <span className="messages-nav-glyph__rim"><RedEnvelope /></span>}
        {ringing && <style>{keyframes}</style>}
        {ringing && (
          <svg className="messages-nav-glyph__layer" viewBox="0 0 32 32" aria-hidden="true">
            {/* Slips are hidden while inside the envelope, so each one appears
                as it pops out of the top edge and again as it falls past. */}
            <clipPath id={glyphId}><path clipRule="evenodd" d={SLIP_WINDOW_PATH} /></clipPath>
            <g clipPath={`url(#${glyphId})`}>
            {profile.slips.map((slip, index) => {
              const animationName = `${glyphId}-${profile.unread}-${index}`;
              return (
                <g key={index}>
                  {MESSAGE_SLIP_TAIL.map((dot, k) => (
                    <circle key={dot.gap} className="messages-nav-glyph__slip" cx="16" cy="16" r={dot.radius}
                      fill="var(--messages-red)" fillOpacity={dot.opacity} style={{ animationName: `${animationName}-${k}` }} />
                  ))}
                  <g className="messages-nav-glyph__slip" data-testid="messages-slip" style={{ animationName }}>
                    <rect x="12.2" y="13.2" width="7.6" height="5.6" rx="1" fill="var(--messages-red)" />
                    <rect x="13.6" y="14.7" width="4.8" height="1" rx=".5" fill="rgb(255 255 255 / .8)" />
                  </g>
                </g>
              );
            })}
            </g>
          </svg>
        )}
        <MessageEnvelope className={className} {...props} />
        {ringing && <span className="messages-nav-glyph__hot"><RedEnvelope /></span>}
        {ringing && (
          <svg className="messages-nav-glyph__layer" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            {ENVELOPE_SIDE_RIPPLE_PATHS.map((path, side) => [0, 1].map(echo => (
              <path key={`${side}-${echo}`} className="messages-nav-glyph__wave" data-side={side} data-echo={echo}
                d={path} stroke="var(--messages-red)" strokeWidth="1.1" strokeLinecap="round" />
            )))}
          </svg>
        )}
      </span>
    </span>
  );
}
