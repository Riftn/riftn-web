/**
 * The stream pet itself: a round little creature drawn in SVG, so it stays
 * sharp at any size and needs no image files. It grows a feature with each
 * stage (ears, a tail, a tuft, a halo), blinks and bobs when it is happy,
 * droops when hungry and breathes slowly with closed eyes when asleep.
 *
 * Its colour is the one the creator picked, the same in every theme, so the
 * pet is recognisably theirs wherever it shows.
 */
import { useId } from 'react';
import '@/styles/stream-pet.css';
import { PET_PALETTE, type PetColor, type PetMood, type PetStage } from '@/lib/api/dehub/stream-pet';
import { cn } from '@/lib/utils';

const SCALE: Record<PetStage, number> = { egg: 1, baby: 0.62, kid: 0.74, teen: 0.86, grown: 0.95, legend: 1 };

interface Props {
  color: PetColor;
  stage: PetStage;
  mood: PetMood;
  size?: number;
  /** Bumped by the parent to play one happy chomp (a viewer's snack). */
  chomp?: number;
  className?: string;
  title?: string;
}

export function PetSprite({ color, stage, mood, size = 96, chomp = 0, className, title }: Props) {
  const id = useId().replace(/:/g, '');
  const p = PET_PALETTE[color] ?? PET_PALETTE.violet;
  const stageIndex = ['egg', 'baby', 'kid', 'teen', 'grown', 'legend'].indexOf(stage);

  if (stage === 'egg' || mood === 'egg') {
    return (
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
        data-pet-sprite="egg"
        className={cn('stream-pet', className)}
      >
        <defs>
          <radialGradient id={`egg-${id}`} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor={p.belly} />
            <stop offset="100%" stopColor={p.body} />
          </radialGradient>
        </defs>
        <ellipse cx="50" cy="92" rx="22" ry="4" fill="rgba(0,0,0,0.22)" className="stream-pet-shadow" />
        <g className="stream-pet-egg">
          <path d="M50 14 C70 14 80 44 80 62 C80 80 67 90 50 90 C33 90 20 80 20 62 C20 44 30 14 50 14 Z" fill={`url(#egg-${id})`} stroke={p.shade} strokeWidth="2" />
          <circle cx="38" cy="52" r="5" fill={p.body} opacity="0.7" />
          <circle cx="60" cy="40" r="3.5" fill={p.body} opacity="0.7" />
          <circle cx="62" cy="70" r="6" fill={p.body} opacity="0.6" />
          <path d="M34 62 l6 -5 l5 5 l6 -6 l5 5 l6 -5 l5 5" fill="none" stroke={p.shade} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        </g>
      </svg>
    );
  }

  const s = SCALE[stage];
  const ears = stageIndex >= 2;
  const tail = stageIndex >= 3;
  const tuft = stageIndex >= 4;
  const halo = stageIndex >= 5;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-pet-sprite={stage}
      data-pet-mood={mood}
      className={cn('stream-pet', className)}
    >
      <defs>
        <radialGradient id={`body-${id}`} cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor={p.belly} />
          <stop offset="45%" stopColor={p.body} />
          <stop offset="100%" stopColor={p.shade} />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="93" rx={26 * s} ry="4" fill="rgba(0,0,0,0.22)" className="stream-pet-shadow" />
      {/* Scaled from the feet, so a small pet stands on the same floor as a big one. */}
      <g transform={`translate(50 92) scale(${s}) translate(-50 -92)`}>
        <g key={chomp} className={cn('stream-pet-body', chomp > 0 && 'stream-pet-chomp')}>
          {halo && <ellipse cx="50" cy="8" rx="17" ry="4.5" fill="none" stroke="#ffe08a" strokeWidth="3" className="stream-pet-halo" />}
          {tail && (
            <path d="M78 74 C94 72 96 56 86 52 C80 50 78 58 84 60" fill="none" stroke={p.shade} strokeWidth="7" strokeLinecap="round" />
          )}
          {ears && (
            <>
              <path d="M26 40 L22 12 L44 28 Z" fill={p.body} stroke={p.shade} strokeWidth="2" strokeLinejoin="round" />
              <path d="M74 40 L78 12 L56 28 Z" fill={p.body} stroke={p.shade} strokeWidth="2" strokeLinejoin="round" />
              <path d="M28 34 L26 20 L37 29 Z" fill={p.belly} opacity="0.8" />
              <path d="M72 34 L74 20 L63 29 Z" fill={p.belly} opacity="0.8" />
            </>
          )}
          {tuft && (
            <path d="M50 22 C46 12 40 10 38 14 M50 22 C50 10 54 6 56 8 M50 22 C56 14 62 14 63 18" fill="none" stroke={p.shade} strokeWidth="3.5" strokeLinecap="round" />
          )}
          <ellipse cx="38" cy="90" rx="9" ry="5" fill={p.shade} />
          <ellipse cx="62" cy="90" rx="9" ry="5" fill={p.shade} />
          <path d="M50 20 C76 20 86 44 86 62 C86 80 72 90 50 90 C28 90 14 80 14 62 C14 44 24 20 50 20 Z" fill={`url(#body-${id})`} stroke={p.shade} strokeWidth="2" />
          <ellipse cx="50" cy="70" rx="22" ry="15" fill={p.belly} opacity="0.85" />
          <ellipse cx="29" cy="62" rx="6" ry="3.5" fill="#ff7aa8" opacity={mood === 'asleep' ? 0.25 : 0.45} />
          <ellipse cx="71" cy="62" rx="6" ry="3.5" fill="#ff7aa8" opacity={mood === 'asleep' ? 0.25 : 0.45} />
          <Face mood={mood} />
        </g>
      </g>
      {mood === 'asleep' && (
        <g className="stream-pet-z" fill="#ffffff" fontFamily="ui-rounded, system-ui, sans-serif" fontWeight="700">
          <text x="74" y="30" fontSize="12">z</text>
          <text x="82" y="18" fontSize="9">z</text>
        </g>
      )}
    </svg>
  );
}

function Face({ mood }: { mood: PetMood }) {
  if (mood === 'asleep') {
    return (
      <g fill="none" stroke="#2a2340" strokeWidth="2.6" strokeLinecap="round">
        <path d="M33 52 q5 4 10 0" />
        <path d="M57 52 q5 4 10 0" />
        <path d="M47 64 q3 2 6 0" />
      </g>
    );
  }
  if (mood === 'hungry') {
    return (
      <g>
        <g className="stream-pet-eyes">
          <ellipse cx="38" cy="52" rx="4.5" ry="5" fill="#2a2340" />
          <ellipse cx="62" cy="52" rx="4.5" ry="5" fill="#2a2340" />
          <circle cx="39.5" cy="50.5" r="1.4" fill="#fff" />
          <circle cx="63.5" cy="50.5" r="1.4" fill="#fff" />
        </g>
        {/* Worried brows and a little open mouth. */}
        <path d="M32 44 l9 -3" stroke="#2a2340" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M68 44 l-9 -3" stroke="#2a2340" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="50" cy="66" rx="3.5" ry="4" fill="#2a2340" />
      </g>
    );
  }
  return (
    <g>
      <g className="stream-pet-eyes">
        <ellipse cx="38" cy="52" rx="5" ry="6" fill="#2a2340" />
        <ellipse cx="62" cy="52" rx="5" ry="6" fill="#2a2340" />
        <circle cx="40" cy="49.5" r="1.8" fill="#fff" />
        <circle cx="64" cy="49.5" r="1.8" fill="#fff" />
      </g>
      <path d="M43 63 q7 7 14 0" fill="none" stroke="#2a2340" strokeWidth="2.6" strokeLinecap="round" />
    </g>
  );
}
