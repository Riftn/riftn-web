import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { wheelColumns, wheelIndexes, wheelLabels, wheelMinutes, uses12Hour } from '@/lib/schedule/clockWheel';

const ITEM = 40;
const VISIBLE = 5;

interface WheelProps {
  items: string[];
  value: number;
  onChange: (index: number) => void;
  label: string;
  className?: string;
}

/**
 * One spinning column, like the iPhone clock: flick or drag it (touch,
 * trackpad, mouse wheel), tap a number, or use the arrow keys. It settles on
 * the row in the middle band.
 */
function Wheel({ items, value, onChange, label, className }: WheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  const [live, setLive] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  // Follow outside changes (a pick, typed text) unless that is where it already sits.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLive(value);
    if (Math.round(el.scrollTop / ITEM) !== value) el.scrollTo({ top: value * ITEM, behavior: el.scrollTop === 0 && value > 0 ? 'auto' : 'smooth' });
  }, [value]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
    setLive(i);
    window.clearTimeout(settle.current);
    // Report once the spin has stopped, so the time doesn't jump mid-flick.
    settle.current = window.setTimeout(() => {
      if (i !== valueRef.current) onChangeRef.current(i);
    }, 140);
  };

  return (
    <div className={cn('relative', className)} style={{ height: ITEM * VISIBLE }}>
      <div
        ref={ref}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuetext={items[value]}
        aria-valuemin={0}
        aria-valuemax={items.length - 1}
        data-time-wheel
        onScroll={onScroll}
        onKeyDown={event => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const next = Math.max(0, Math.min(items.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)));
          if (next !== value) onChange(next);
        }}
        className="scrollbar-hide h-full snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [mask-image:linear-gradient(180deg,transparent,#000_30%,#000_70%,transparent)] focus-visible:ring-2 focus-visible:ring-white/40 rounded-xl"
        style={{ paddingBlock: ITEM * ((VISIBLE - 1) / 2), touchAction: 'pan-y' }}
      >
        {items.map((text, i) => {
          const away = Math.abs(i - live);
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => onChange(i)}
              className="flex w-full snap-center items-center justify-center text-white tabular-nums transition-[opacity,transform] duration-100"
              style={{
                height: ITEM,
                fontSize: away === 0 ? 22 : 19,
                fontWeight: away === 0 ? 700 : 500,
                opacity: away === 0 ? 1 : away === 1 ? 0.55 : 0.3,
                transform: `perspective(300px) rotateX(${Math.max(-60, Math.min(60, (i - live) * 18))}deg)`,
              }}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TimeWheelProps {
  /** Minutes after midnight. */
  minutes: number;
  onChange: (minutes: number) => void;
  locale?: string;
}

/** Hours, minutes and (for 12-hour clocks) AM/PM, side by side over one highlight band. */
export function TimeWheel({ minutes, onChange, locale }: TimeWheelProps) {
  const cols = useMemo(() => wheelColumns(locale), [locale]);
  const twelve = useMemo(() => uses12Hour(locale), [locale]);
  const labels = useMemo(() => wheelLabels(locale), [locale]);
  const idx = wheelIndexes(minutes, twelve);
  const set = (patch: Partial<typeof idx>) => onChange(wheelMinutes({ ...idx, ...patch }, twelve));

  return (
    <div data-time-wheels className="relative mx-auto flex w-full max-w-[280px] items-stretch justify-center gap-1">
      {/* The band the picked row sits in. A kit chip, so every theme draws it. */}
      <div aria-hidden data-kit-chip className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 !rounded-xl !p-0" style={{ height: ITEM }} />
      <Wheel items={cols.hours} value={idx.hour} onChange={hour => set({ hour })} label={labels.hour} className="flex-1" />
      <div aria-hidden className="relative flex items-center text-[22px] font-bold text-white">:</div>
      <Wheel items={cols.minutes} value={idx.minute} onChange={minute => set({ minute })} label={labels.minute} className="flex-1" />
      {cols.periods && (
        <Wheel items={cols.periods} value={idx.period} onChange={period => set({ period })} label={labels.period} className="flex-1" />
      )}
    </div>
  );
}
