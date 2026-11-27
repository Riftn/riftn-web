import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import './unread-count-chip.css';

/**
 * Unread number on a chat. Squared off like the rest of the app, and it rings
 * once like the Messages icon (red flash, red rim, lines off both sides) when
 * it shows up and each time the number goes up.
 */
export function UnreadCountChip({ count, className }: { count: number; className?: string }) {
  const [run, setRun] = useState(0);
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) setRun(n => n + 1);
    last.current = count;
  }, [count]);
  if (!(count > 0)) return null;
  return (
    <div key={run} data-count-badge className={cn('unread-count-chip min-w-[18px] h-[18px] px-1.5 bg-white rounded-[6px] flex items-center justify-center flex-shrink-0', className)}>
      {[0, 1, 2, 3].map(i => <i key={i} aria-hidden="true" data-side={i % 2} data-echo={i > 1 ? 1 : 0} />)}
      <span className="unread-count-chip__number text-zinc-950 text-[10px] font-bold leading-none tabular-nums">
        {count > 99 ? '99+' : count}
      </span>
    </div>
  );
}
