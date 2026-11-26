import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { AuthContext } from '@/contexts/AuthContext';
import { updateProfile } from '@/lib/api/dehub';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { earnedByRarity, useMilestones } from '@/hooks/use-milestones';
import { BadgeMuseumSheet, MedalPodium } from '@/components/app/profile/BadgeMuseum';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';
import { SETTINGS_LABEL_CLASS } from './SettingsRow';

const FOCUS_RING_CLASS = 'focus-visible:ring-[color:var(--control-ink,white)] focus-visible:ring-offset-transparent';

/**
 * Settings > Profile > Badge Museum: the museum's home. It is off by default,
 * so it shows here and nowhere else until "Show Badge Museum on my profile"
 * is switched on. "View my Badge Museum" opens the full museum (earned and
 * locked, with progress) for yourself either way.
 */
export function BadgeMuseumSetting({ previewAddress }: { /** State gallery: draw for this address, switch saves nothing. */ previewAddress?: string } = {}) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const address = previewAddress ?? auth?.user?.address;
  const queryClient = useQueryClient();
  const [previewShown, setPreviewShown] = useState(false);
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError } = useMilestones(address, { refreshOnMount: !previewAddress });
  const mutationKey = ['badge-museum-visibility', address?.toLowerCase()];
  const saving = useIsMutating({ mutationKey }) > 0;
  const busy = !previewAddress && (isFetching || saving);
  const disabled = !previewAddress && (busy || isError || typeof data?.hidden !== 'boolean');
  const shown = previewAddress ? previewShown : data?.hidden === false;
  const { mutate } = useMutation({
    mutationKey,
    mutationFn: async ({ viewer, show }: { viewer: string; show: boolean }) => {
      const response = await updateProfile({
        badgeMuseumVisibility: show ? 'public' : 'hidden',
        badgeMuseumViewer: viewer,
      });
      if (response?.result !== true) throw new Error('Badge Museum update failed');
    },
    onError: () => toast.error(t('badgeMuseum.saveFailed', 'Could not save. Try again.')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['profile-milestones'] }),
  });

  if (!address) return null;

  const toggle = (next: boolean) => {
    if (previewAddress) {
      setPreviewShown(next);
    } else if (!disabled && !queryClient.isMutating({ mutationKey })) {
      mutate({ viewer: address, show: next });
    }
  };

  const earned = data ? earnedByRarity(data.milestones) : [];
  const title = t('badgeMuseum.title', 'Badge Museum');

  return (
    <div data-setting-anchor="badge-museum" data-badge-museum-setting className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className={cn(SETTINGS_LABEL_CLASS, 'mb-0.5')}>{title}</span>
          <p className="text-sm text-zinc-400">
            {data
              ? t('badgeMuseum.summary', {
                  defaultValue: '{{earned}} of {{total}} badges earned',
                  earned: formatCount(data.earned),
                  total: formatCount(data.total),
                })
              : t('badgeMuseum.loading', 'Loading badges…')}
          </p>
        </div>
        {earned.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(true)}
            aria-label={t('badgeMuseum.viewMine', 'View my Badge Museum')}
            className={cn('h-auto min-h-11 flex-none p-1', FOCUS_RING_CLASS)}
          >
            <MedalPodium medals={earned.slice(0, 3)} sizes={[28, 36]} />
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <label htmlFor="settings-badge-museum" className={cn(SETTINGS_LABEL_CLASS, 'mb-0')}>
            {t('badgeMuseum.showSetting', 'Show Badge Museum on my profile')}
          </label>
          <p id="settings-badge-museum-hint" className="mt-0.5 text-sm text-zinc-400">{t('badgeMuseum.showSettingHint', 'Off: only you can see it here.')}</p>
        </div>
        <Switch
          id="settings-badge-museum"
          aria-describedby="settings-badge-museum-hint"
          aria-busy={busy}
          checked={shown}
          disabled={disabled}
          className={FOCUS_RING_CLASS}
          onCheckedChange={toggle}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        data-badge-museum-view
        onClick={() => setOpen(true)}
        className={cn('-mx-2 h-auto min-h-11 w-[calc(100%+1rem)] justify-start gap-2.5 whitespace-normal px-2 py-2.5 text-left', FOCUS_RING_CLASS)}
      >
        <ThemedIcon icon="dao" aria-hidden className="size-[18px] flex-none text-zinc-400" />
        {t('badgeMuseum.viewMine', 'View my Badge Museum')}
        <ChevronRight aria-hidden className="ml-auto flex-none text-zinc-400" />
      </Button>

      <BadgeMuseumSheet address={address} open={open} onOpenChange={setOpen} />
    </div>
  );
}
