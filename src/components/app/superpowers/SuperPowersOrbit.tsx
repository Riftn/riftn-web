/**
 * SuperPowersOrbit
 * ================
 * The twelve powers on a ring around the badge that unlocks them.
 *
 * The ring answers the page's one question at a glance: what can my badge do,
 * and how much more would the next rung add. Powers sit in unlock order
 * clockwise from twelve o'clock, so the lit chrome arc runs from the top to the
 * last power this account holds. Everything past it is dimmed.
 *
 * Positions are percentages of a square box, not pixels, so the same ring
 * scales from a 360px phone to the desktop column without a transform. Labels
 * only show from `sm` up: at phone width they would collide, and the selected
 * power's name is printed in the panel under the ring anyway.
 */

import type { ReactNode } from 'react';
import { SuperPowerIcon } from '@/components/app/SuperPowerIcon';
import type { SuperPowerInfo } from '@/lib/api/dehub/superpowers';
import { cn } from '@/lib/utils';

/** Ring radius as a share of the box, in the SVG's 0–100 space. */
const RADIUS = 40;

function pointAt(index: number, count: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return { x: 50 + RADIUS * Math.cos(angle), y: 50 + RADIUS * Math.sin(angle) };
}

export interface OrbitPower {
  power: SuperPowerInfo;
  unlocked: boolean;
}

interface SuperPowersOrbitProps {
  powers: OrbitPower[];
  selectedKey: string | null;
  onSelect: (power: SuperPowerInfo) => void;
  /** What sits in the middle of the ring: the badge and its allowance. */
  core: ReactNode;
}

export function SuperPowersOrbit({ powers, selectedKey, onSelect, core }: SuperPowersOrbitProps) {
  const count = powers.length;
  // The arc runs over the unbroken unlocked run from the top. Unlocks are
  // ordered, so this is every power held; a gap would mean data out of order,
  // and stopping at it is the honest drawing.
  let lit = 0;
  while (lit < count && powers[lit].unlocked) lit += 1;

  const start = pointAt(0, count);
  const end = pointAt(Math.max(lit - 1, 0), count);
  const sweep = count ? ((lit - 1) / count) * 360 : 0;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[600px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[8%] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.07),transparent_65%)]"
      />
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="sp-orbit-chrome" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#8a9097" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.35" />
        {lit > 1 && (
          <path
            d={`M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`}
            fill="none"
            stroke="url(#sp-orbit-chrome)"
            strokeWidth="0.6"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 1.2px rgba(255,255,255,0.7))' }}
          />
        )}
      </svg>

      <div className="absolute left-1/2 top-1/2 flex w-[52%] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
        {core}
      </div>

      {powers.map(({ power, unlocked }, index) => {
        const { x, y } = pointAt(index, count);
        const selected = power.key === selectedKey;
        return (
          <button
            key={power.key}
            type="button"
            onClick={() => onSelect(power)}
            aria-pressed={selected}
            aria-label={power.label}
            style={{ left: `${x}%`, top: `${y}%` }}
            className={cn(
              'group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-[#0b0b0d] transition-[width,height,box-shadow,border-color] duration-200',
              selected
                ? 'h-[15.5%] w-[15.5%] border-white shadow-[0_0_0_5px_rgba(255,255,255,0.07),0_0_32px_rgba(255,255,255,0.18)]'
                : 'h-[12.5%] w-[12.5%] hover:border-white/40',
              !selected && (unlocked ? 'border-white/15' : 'border-white/5'),
            )}
          >
            <SuperPowerIcon
              power={power.key}
              alt=""
              className={cn(
                'h-[64%] w-[64%] object-contain transition-opacity',
                !unlocked && 'opacity-25 grayscale group-hover:opacity-45',
              )}
            />
            <span
              className={cn(
                'pointer-events-none absolute left-1/2 top-full mt-1.5 hidden -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold sm:block',
                selected ? 'text-white' : unlocked ? 'text-zinc-300' : 'text-zinc-600',
              )}
            >
              {power.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
