/**
 * The Moments viewer's own action icons (react, comment, share), drawn to
 * read apart from the feed's: a folded two-tone heart, a bubble with lines,
 * and a folded curved arrow.
 */
import { useId } from 'react';

type P = { className?: string; filled?: boolean };

export function MomentHeart({ className, filled }: P) {
  const id = useId();
  if (!filled) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20.5s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.5c0 5.8-8 10.4-8 10.4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff5a8a" /><stop offset="1" stopColor="#ff0a6c" /></linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff2d7a" /><stop offset="1" stopColor="#e0005a" /></linearGradient>
      </defs>
      <path fill={`url(#${id}a)`} d="M12 20.5s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.5c0 5.8-8 10.4-8 10.4z" />
      <path fill={`url(#${id}b)`} d="M12 20.5c-1-2.6-1.4-6.8 0-12.9A4.4 4.4 0 0 1 20 10.1c0 5.8-8 10.4-8 10.4z" opacity=".85" />
    </svg>
  );
}

export function MomentComment({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.5 4h9A3.5 3.5 0 0 1 20 7.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-5 3.5V7.5A3.5 3.5 0 0 1 7.5 4z" />
      <path d="M9 9.5h6M9 12.5h4" />
    </svg>
  );
}

export function MomentShare({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" d="M3.5 19.5c1.2-5.6 5.2-9.3 10.5-9.6V5.5l7 6.5-7 6.5v-4.4c-4.2-.1-7.6 1.6-10.5 5.4z" />
      <path fill="currentColor" opacity=".55" d="M14 5.5l7 6.5h-7z" />
    </svg>
  );
}

/** "Share to Moment": a shelf tile (rounded square, like the Moment faces) with a plus. */
export function MomentAdd({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3.5H8A4.5 4.5 0 0 0 3.5 8v8A4.5 4.5 0 0 0 8 20.5h8a4.5 4.5 0 0 0 4.5-4.5v-6" />
      <path d="M18.5 2.5v6M15.5 5.5h6" />
      <path d="M9.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}
