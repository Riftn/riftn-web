import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Landmark } from 'lucide-react';
import { AuthContext } from '@/contexts/AuthContext';
import { getAccountInfo, updateProfile } from '@/lib/api/dehub';
import { Switch } from '@/components/ui/switch';
import { BADGE_MUSEUM_VISIBILITY_KEY, badgeMuseumIsShown, earnedByRarity, useMilestones } from '@/hooks/use-milestones';
import { BadgeMuseumSheet, MedalPodium } from '@/components/app/profile/BadgeMuseum';
import { formatCount } from '@/lib/format-count';
import { cn } from '@/lib/utils';
import { SETTINGS_LABEL_CLASS } from './SettingsRow';

/**
 * Settings > Profile > Badge Museum: the museum's home. It is off by default,
 * so it shows here and nowhere else until "Show Badge Museum on my profile"
 * is switched on. "View my Badge Museum" opens the full museum (earned and
 * locked, with progress) for yourself either way.
 *
 * The switch saves on its own, merged into a fresh copy of `customs` so no
 * other setting is lost (the server replaces the whole blob).
 */
export function BadgeMuseumSetting({ previewAddress }: { /** State gallery: draw for this address, switch saves nothing. */ previewAddress?: string } = {}) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const address = previewAddress ?? auth?.user?.address;
  const queryClient = useQueryClient();
  const [shown, setShown] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const { data } = useMilestones(address);

  useEffect(() => {
    if (!address) return;
    if (previewAddress) {
      setShown(false);
      return;
    }
    let cancelled = false;
    getAccountInfo(address)
      .then((info) => {
        if (!cancelled) setShown(badgeMuseumIsShown(info?.customs as Record<string, unknown> | undefined));
      })
      .catch(() => {
        if (!cancelled) setShown(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, previewAddress]);

  if (!address) return null;

  const toggle = async (next: boolean) => {
    const before = shown;
    setShown(next);
    if (previewAddress) return;
    setSaving(true);
    try {
      const info = await getAccountInfo(address);
      const merged: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries((info?.customs as Record<string, unknown> | undefined) ?? {})) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') merged[key] = value;
      }
      merged[BADGE_MUSEUM_VISIBILITY_KEY] = next ? 'public' : 'hidden';
      await updateProfile({ customs: merged });
      auth?.patchUser?.({ customs: merged } as never);
      void queryClient.invalidateQueries({ queryKey: ['profile-milestones'] });
      void queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
    } catch {
      setShown(before);
      toast.error(t('badgeMuseum.saveFailed', 'Could not save. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const earned = data ? earnedByRarity(data.milestones) : [];
  const title = t('badgeMuseum.title', 'Badge Museum');

  return (
    <div data-setting-anchor="badge-museum" data-badge-museum-setting className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <span className={cn(SETTINGS_LABEL_CLASS, 'mb-0.5')}>{title}</span>
          <p className="text-xs text-zinc-400">
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
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('badgeMuseum.viewMine', 'View my Badge Museum')}
            className="flex-none rounded-xl"
          >
            <MedalPodium medals={earned.slice(0, 3)} sizes={[28, 36]} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <label htmlFor="settings-badge-museum" className="block text-sm text-white">
            {t('badgeMuseum.showSetting', 'Show Badge Museum on my profile')}
          </label>
          <p className="mt-0.5 text-sm text-zinc-400">{t('badgeMuseum.showSettingHint', 'Off: only you can see it here.')}</p>
        </div>
        <Switch
          id="settings-badge-museum"
          checked={!!shown}
          disabled={shown === null || saving}
          onCheckedChange={(next) => void toggle(next)}
        />
      </div>

      <button
        type="button"
        data-badge-museum-view
        onClick={() => setOpen(true)}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-xl px-2 py-2.5 text-left text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
      >
        <Landmark aria-hidden className="h-[18px] w-[18px] flex-none text-zinc-400" />
        {t('badgeMuseum.viewMine', 'View my Badge Museum')}
        <ChevronRight aria-hidden className="ml-auto h-4 w-4 flex-none text-zinc-500" />
      </button>

      <BadgeMuseumSheet address={address} open={open} onOpenChange={setOpen} />
    </div>
  );
}
