/**
 * A photo with a time limit ("Gone for both of you 1 min after you send it")
 * wears the time it has left, so whoever looks at it can see it running out:
 * "42s", then "12m", "5h", "3d". Ticks every second in the last minute.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Timer } from 'lucide-react';
import { destructLeft, type DmDestruct } from '@/lib/dm-destruct';

export function DmTimeLeft({ destruct, children }: { destruct?: DmDestruct | null; children: ReactNode }) {
  const timed = destruct?.mode === 'time' && !!destruct.expiresAt;
  const [, tick] = useState(0);
  const end = timed ? new Date(destruct!.expiresAt!).getTime() : 0;
  useEffect(() => {
    if (!timed) return;
    let id = 0;
    const step = () => {
      tick((n) => n + 1);
      const ms = end - Date.now();
      if (ms <= 0) return;
      id = window.setTimeout(step, ms <= 61_000 ? 1000 : 30_000);
    };
    id = window.setTimeout(step, end - Date.now() <= 61_000 ? 1000 : 30_000);
    return () => window.clearTimeout(id);
  }, [timed, end]);
  const left = timed ? destructLeft(destruct) : null;
  if (!left) return <>{children}</>;
  return (
    <div className="relative inline-block max-w-full align-top">
      {children}
      <span
        className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm"
        role="timer"
        data-dm-time-left
      >
        <Timer className="h-3 w-3" />
        {left}
      </span>
    </div>
  );
}
