/**
 * Live Studio: the creator's stream pet. Hatch it here, name it and pick its
 * colour; it eats a snack for every five minutes on air and grows. Below, where
 * it shows (profile, stream corner) and whether viewers can buy it snacks with
 * their channel points, and who fed it most.
 */
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { SETTINGS_FIELD_CLASS, SETTINGS_LABEL_CLASS } from '@/components/app/settings/SettingsRow';
import { buildAvatarUrl } from '@/lib/media-url';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';
import {
  FEED_COST_MAX,
  FEED_COST_MIN,
  getMyPet,
  hatchPet,
  PET_COLORS,
  PET_NAME_MAX,
  PET_PALETTE,
  saveMyPet,
  type PetColor,
  type PetSettings,
  type StreamPet,
} from '@/lib/api/dehub/stream-pet';
import { PetCard } from '@/components/app/pet/PetCard';
import { PetSprite } from '@/components/app/pet/PetSprite';
import { PointsIcon } from '../points/PointsIcon';

const KEY = ['my-stream-pet'];

function ColorPicker({ value, onChange, disabled }: { value: PetColor; onChange: (c: PetColor) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t('streamPet.studio.color')} className="flex flex-wrap gap-2">
      {PET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={t(`streamPet.color.${c}`)}
          disabled={disabled}
          onClick={() => onChange(c)}
          className={cn(
            'h-8 w-8 rounded-full border-2 transition-transform duration-200 hover:scale-105',
            value === c ? 'scale-110 border-white' : 'border-transparent',
          )}
          style={{ background: PET_PALETTE[c].body }}
        />
      ))}
    </div>
  );
}

export function PetHatch({ onHatched }: { onHatched: (pet: StreamPet) => void }) {
  const { t } = useTranslation();
  const nameId = useId();
  const [name, setName] = useState('');
  const [color, setColor] = useState<PetColor>('violet');
  const hatch = useMutation({
    mutationFn: () => hatchPet(name.trim(), color),
    onSuccess: (pet) => {
      if (pet) onHatched(pet);
      toast.success(t('streamPet.studio.hatched'));
    },
    onError: () => toast.error(t('streamPet.errors.failed')),
  });
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center" data-stream-pet-hatch>
      <div className="flex h-28 w-28 flex-none items-end justify-center self-center rounded-xl border border-white/10 bg-white/[0.04]">
        <PetSprite color={color} stage="egg" mood="egg" size={100} />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <label htmlFor={nameId} className={SETTINGS_LABEL_CLASS}>
            {t('streamPet.studio.name')}
          </label>
          <Input
            id={nameId}
            value={name}
            maxLength={PET_NAME_MAX}
            placeholder={t('streamPet.studio.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            className={SETTINGS_FIELD_CLASS}
          />
        </div>
        <ColorPicker value={color} onChange={setColor} />
        <Button size="sm" disabled={!name.trim() || hatch.isPending} onClick={() => hatch.mutate()}>
          {t('streamPet.studio.hatch')}
        </Button>
      </div>
    </div>
  );
}

export function PetPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nameId = useId();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: getMyPet, staleTime: 30_000, refetchInterval: 60_000 });
  const pet = data?.pet ?? null;
  const [name, setName] = useState('');
  const [cost, setCost] = useState(100);
  useEffect(() => {
    if (!pet) return;
    setName(pet.name);
    setCost(pet.feeding.cost);
  }, [pet?.name, pet?.feeding.cost]); // eslint-disable-line react-hooks/exhaustive-deps

  const put = (next: StreamPet) => {
    qc.setQueryData(KEY, (prev: typeof data) => ({ feeders: prev?.feeders ?? [], pet: next }));
    void qc.invalidateQueries({ queryKey: ['creator-pet'] });
  };
  const save = useMutation({
    mutationFn: (s: PetSettings) => saveMyPet(s),
    onSuccess: (next) => {
      if (next) put(next);
      toast.success(t('streamPet.studio.saved'));
    },
    onError: () => toast.error(t('streamPet.errors.failed')),
  });

  return (
    <PageSection title={t('streamPet.studio.title')}>
      <p className="mb-3 text-xs text-zinc-500">{t('streamPet.studio.intro')}</p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      ) : !pet ? (
        <PetHatch onHatched={put} />
      ) : (
        <div className="space-y-4" data-stream-pet-studio>
          <PetCard pet={pet} own />

          <div className="space-y-3 rounded-xl border border-zinc-800 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={nameId} className={SETTINGS_LABEL_CLASS}>
                  {t('streamPet.studio.name')}
                </label>
                <Input
                  id={nameId}
                  value={name}
                  maxLength={PET_NAME_MAX}
                  onChange={(e) => setName(e.target.value)}
                  className={SETTINGS_FIELD_CLASS}
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!name.trim() || name.trim() === pet.name || save.isPending}
                onClick={() => save.mutate({ name: name.trim() })}
              >
                {t('streamPet.studio.save')}
              </Button>
            </div>
            <ColorPicker value={pet.color} disabled={save.isPending} onChange={(color) => save.mutate({ color })} />
            <label className="flex items-center justify-between gap-3 text-sm text-white">
              <span>{t('streamPet.studio.showOnProfile')}</span>
              <Switch checked={pet.showOnProfile} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ showOnProfile: v })} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-white">
              <span>{t('streamPet.studio.showOnStream')}</span>
              <Switch checked={pet.showOnStream} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ showOnStream: v })} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-white">
              <span>{t('streamPet.studio.feeding')}</span>
              <Switch
                checked={pet.feeding.enabled}
                disabled={save.isPending || !pet.showOnStream}
                onCheckedChange={(v) => save.mutate({ feeding: { enabled: v } })}
              />
            </label>
            {pet.feeding.enabled && pet.showOnStream && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="flex-1">{t('streamPet.studio.cost')}</span>
                <div className="relative w-32 flex-none">
                  <PointsIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={FEED_COST_MIN}
                    max={FEED_COST_MAX}
                    value={cost || ''}
                    aria-label={t('streamPet.studio.cost')}
                    onChange={(e) => setCost(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                    className={`${SETTINGS_FIELD_CLASS} pl-8 tabular-nums`}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={cost === pet.feeding.cost || cost < FEED_COST_MIN || cost > FEED_COST_MAX || save.isPending}
                  onClick={() => save.mutate({ feeding: { cost } })}
                >
                  {t('streamPet.studio.save')}
                </Button>
              </div>
            )}
            <p className="text-xs text-zinc-500">{t('streamPet.studio.rules')}</p>
            <p className="text-xs text-zinc-500">{t('streamPet.studio.requests')}</p>
          </div>

          {!!data?.feeders.length && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-white">{t('streamPet.studio.feeders')}</h4>
              <ol className="space-y-1.5">
                {data.feeders.map((f) => (
                  <li key={f.address} className="flex items-center gap-3 text-sm">
                    <img src={buildAvatarUrl(f.address, f.avatarImageUrl)} alt="" className="h-7 w-7 rounded-full object-cover" loading="lazy" />
                    <span className="min-w-0 flex-1 truncate text-white">{f.displayName || f.username || `${f.address.slice(0, 6)}…`}</span>
                    <span className="tabular-nums text-zinc-300">
                      {t('streamPet.snacks', { count: f.snacks ?? 0, formatted: formatCount(f.snacks ?? 0) })}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </PageSection>
  );
}
