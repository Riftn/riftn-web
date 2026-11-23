/**
 * The creator's pet in the corner of their live stream. Everyone watching sees
 * it bob along; a tap opens a small card where a viewer can buy it a snack with
 * the channel points they earned on this channel. When anyone feeds it, it
 * chomps and a line rises from it saying who did.
 *
 * Loaded on demand by the live card. Draws nothing when the creator has no pet
 * or keeps it off their stream.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getMyStreamPoints } from '@/lib/api/dehub/live-rewards';
import { feedErrorKey, feedStreamPet, getStreamPet, watchStreamPet, type PetFeeder, type StreamPet } from '@/lib/api/dehub/stream-pet';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';
import { PointsIcon } from '@/components/app/live/points/PointsIcon';
import { PetSprite } from './PetSprite';
import { petMoodLine } from './PetCard';

interface Props {
  streamId: string;
  own?: boolean;
  signedIn?: boolean;
  className?: string;
  /** The state gallery shows the card already open. */
  initiallyOpen?: boolean;
}

const who = (f: PetFeeder) => f.displayName || (f.username ? `@${f.username}` : `${f.address.slice(0, 6)}…`);

export default function StreamPetCorner({ streamId, own = false, signedIn = false, className, initiallyOpen = false }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['stream-pet', streamId];
  const { data: pet } = useQuery({ queryKey: key, queryFn: () => getStreamPet(streamId), staleTime: 60_000, refetchInterval: 5 * 60_000, retry: false });
  const [open, setOpen] = useState(initiallyOpen);
  const [chomp, setChomp] = useState(0);
  const [fedLine, setFedLine] = useState<{ id: number; text: string } | null>(null);
  const lineTimer = useRef<number>();

  useEffect(() => {
    const sub = watchStreamPet(streamId, (u) => {
      qc.setQueryData(key, u.pet);
      if (u.fed) {
        setChomp((n) => n + 1);
        window.clearTimeout(lineTimer.current);
        setFedLine({ id: Date.now(), text: t('streamPet.fedBy', { name: who(u.fed.by), pet: u.pet?.name ?? '' }) });
        lineTimer.current = window.setTimeout(() => setFedLine(null), 2600);
      }
    });
    return () => {
      sub.leave();
      window.clearTimeout(lineTimer.current);
    };
  }, [streamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canFeed = !!pet && pet.feeding.enabled && !own;
  const points = useQuery({
    queryKey: ['live-points', streamId],
    queryFn: () => getMyStreamPoints(streamId),
    enabled: open && canFeed && signedIn,
    staleTime: 15_000,
  });
  const feed = useMutation({
    mutationFn: () => feedStreamPet(streamId),
    onSuccess: (res) => {
      if (res.pet) qc.setQueryData(key, res.pet);
      void qc.invalidateQueries({ queryKey: ['live-points', streamId] });
      toast.success(t('streamPet.fed', { pet: pet?.name ?? '' }));
    },
    onError: (err) => toast.error(t(feedErrorKey(err))),
  });

  if (!pet) return null;
  const balance = points.data?.balance ?? null;
  const short = balance != null && balance < pet.feeding.cost;

  return (
    <div data-no-navigate data-keep-dark data-on-media data-stream-pet-corner onClick={(e) => e.stopPropagation()} className={cn('pointer-events-auto flex flex-col items-end', className)}>
      {open && (
        <div
          data-stream-pet-panel
          className="mb-2 w-56 rounded-2xl border border-white/15 bg-black/55 p-3 text-white shadow-lg backdrop-blur-[24px] backdrop-saturate-[180%] stream-pet-fed-in"
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{pet.name}</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] text-white/80">{t(`streamPet.stage.${pet.stage}`)}</span>
          </div>
          <p className="mt-1 text-xs leading-snug text-white/70">{petMoodLine(t, pet, own)}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white/80 transition-[width] duration-700" style={{ width: `${Math.round(pet.progress * 100)}%` }} />
          </div>
          {canFeed && (
            <>
              <button
                type="button"
                disabled={feed.isPending || !signedIn || short}
                onClick={() => feed.mutate()}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/15 px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/25 disabled:opacity-50"
              >
                {t('streamPet.feed')}
                <span className="inline-flex items-center gap-1 tabular-nums text-white/80">
                  <PointsIcon className="h-3 w-3" />
                  {formatCount(pet.feeding.cost)}
                </span>
              </button>
              <p className="mt-1.5 text-center text-[10px] text-white/55">
                {!signedIn
                  ? t('streamPet.signIn')
                  : balance == null
                    ? t('streamPet.pointsHint')
                    : t('streamPet.balance', { formatted: formatCount(balance) })}
              </p>
            </>
          )}
        </div>
      )}
      <div className="relative">
        {fedLine && (
          <span
            key={fedLine.id}
            className="stream-pet-fed pointer-events-none absolute bottom-full right-0 mb-1 whitespace-nowrap rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md"
          >
            {fedLine.text}
          </span>
        )}
        <button
          type="button"
          aria-label={t('streamPet.open', { pet: pet.name })}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-16 w-16 items-end justify-center rounded-2xl border border-white/15 bg-black/35 backdrop-blur-[24px] backdrop-saturate-[180%] transition-transform duration-200 active:scale-95"
        >
          <PetSprite color={pet.color} stage={pet.stage} mood={pet.mood} size={58} chomp={chomp} />
        </button>
      </div>
    </div>
  );
}

export type { StreamPet };
