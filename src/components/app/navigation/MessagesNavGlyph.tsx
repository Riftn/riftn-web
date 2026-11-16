import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { LucideProps } from 'lucide-react';
import MessageEnvelope from '@/components/ui/cut-icons/message-envelope';
import {
  ENVELOPE_BODY_PATH, ENVELOPE_FLAP_PATH, ENVELOPE_SIDE_RIPPLE_PATHS, messagesEnvelopeMotion,
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

/**
 * Messages icon for the bottom bar and the side panel. Unread messages ring it
 * on the same beat as the notification bell: it swings, glows red, sends lines
 * off both sides and throws one red slip out of the top per unread message
 * (up to 20). More unread means a harder, faster ring.
 */
export function MessagesNavGlyph({ unread, className, ...props }: LucideProps & { unread: number }) {
  const clipId = `messages-slips-${useId().replace(/:/g, '')}`;
  const profile = messagesEnvelopeMotion(unread);
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
        {ringing && (
          <svg className="messages-nav-glyph__layer" viewBox="0 0 32 32" aria-hidden="true">
            <clipPath id={clipId}><rect x="-14" y="-36" width="60" height="41.2" /></clipPath>
            <g clipPath={`url(#${clipId})`}>
              {profile.slips.map((slip, index) => (
                <g key={index} className="messages-nav-glyph__slip" data-testid="messages-slip" style={{
                  '--slip-x': `${slip.dx}px`, '--slip-y': `${slip.dy}px`, '--slip-rotate': `${slip.rotate}deg`,
                  animationDelay: `${slip.delayMs}ms`,
                } as CSSProperties}>
                  <rect x="12.2" y="1.5" width="7.6" height="5.6" rx="1" fill="var(--messages-red)" />
                  <rect x="13.6" y="3" width="4.8" height="1" rx=".5" fill="rgb(255 255 255 / .8)" />
                </g>
              ))}
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
