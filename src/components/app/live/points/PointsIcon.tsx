/**
 * Channel points' own mark: a coin edge with a raised centre, drawn in the
 * current text colour so it takes each theme's ink like the line icons do.
 */
export function PointsIcon({ className = 'h-4 w-4', strokeWidth = 1.8 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 3v2.2M12 18.8V21" />
    </svg>
  );
}
