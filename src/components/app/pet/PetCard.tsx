/**
 * A stream pet's card: the pet, its name and stage, how it feels, and how far
 * it is from growing up. Used on the creator's profile and in Live Studio.
 */
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import type { StreamPet } from '@/lib/api/dehub/stream-pet';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';
import { PetSprite } from './PetSprite';

/** Hours left until it falls asleep, rounded up, never below one. */
function hoursUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000));
}

export function petMoodLine(t: (k: string, o?: Record<string, unknown>) => string, pet: StreamPet, own: boolean): string {
  if (pet.mood === 'egg') return t(own ? 'streamPet.mood.eggOwn' : 'streamPet.mood.egg');
  if (pet.streamingNow) return t('streamPet.mood.streaming');
  if (pet.mood === 'asleep') return t(own ? 'streamPet.mood.asleepOwn' : 'streamPet.mood.asleep');
  if (pet.mood === 'hungry') return t('streamPet.mood.hungry', { hours: hoursUntil(pet.sleepsAt) });
  return t('streamPet.mood.happy');
}

export function PetCard({ pet, own = false, className }: { pet: StreamPet; own?: boolean; className?: string }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const percent = Math.round(pet.progress * 100);
  const toNext = pet.nextStageFood == null ? 0 : Math.max(0, pet.nextStageFood - pet.food);
  const nextStage = pet.nextStageFood == null ? null : ['egg', 'baby', 'kid', 'teen', 'grown', 'legend'][pet.stageIndex + 1];
  const hours = Math.floor(pet.streamedMinutes / 60);

  return (
    <div
      data-stream-pet-card
      data-pet-mood={pet.mood}
      className={cn('relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4', className)}
    >
      <div className="relative flex items-center gap-4">
        <div className="flex h-24 w-24 flex-none items-end justify-center rounded-xl border border-white/10 bg-white/[0.04]">
          <PetSprite color={pet.color} stage={pet.stage} mood={pet.mood} size={88} title={pet.name} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-base font-semibold text-white">{pet.name}</span>
            <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/80">
              {t(`streamPet.stage.${pet.stage}`)}
            </span>
          </div>
          <p className="mt-1 text-sm leading-snug text-white/70">{petMoodLine(t, pet, own)}</p>
          <p className="mt-1 text-[11px] text-white/45">
            {t('streamPet.snacks', { count: pet.food, formatted: formatCount(pet.food) })}
            {hours > 0 && (
              <>
                <span className="text-white/30"> · </span>
                {t('streamPet.hoursStreamed', { count: hours, formatted: formatCount(hours) })}
              </>
            )}
          </p>
        </div>
      </div>
      {nextStage && (
        <>
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('streamPet.toNext', { count: toNext, formatted: formatCount(toNext), stage: t(`streamPet.stage.${nextStage}`) })}
            className="relative mt-4 h-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.06]"
          >
            <motion.div
              data-pet-fill
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white/40 via-white/75 to-white"
              initial={reduceMotion ? false : { width: 0 }}
              animate={{ width: `${Math.max(percent, pet.progress > 0 ? 3 : 0)}%` }}
              transition={{ duration: reduceMotion ? 0 : 1, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="mt-2 text-right text-[11px] text-white/60">
            {t('streamPet.toNext', { count: toNext, formatted: formatCount(toNext), stage: t(`streamPet.stage.${nextStage}`) })}
          </p>
        </>
      )}
    </div>
  );
}
