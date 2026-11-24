import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlignLeft, Layers } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { AuthContext } from '@/contexts/AuthContext';
import { SPACING_CHOICES, getPostSpacing, savePostSpacing, type PostSpacing } from '@/lib/api/dehub/scheduled';
import { DRIP_CHOICES, dripTimes, gapLabel } from '@/features/post/lib/post-spacing';

export const POST_SPACING_KEY = 'post-spacing';

/** The saved "Space my posts" gap for the signed-in account (shared by the composer and the When? sheet). */
export function usePostSpacing(enabled = true) {
  // Optional: the state gallery renders the sheet without an AuthProvider.
  const walletAddress = useContext(AuthContext)?.walletAddress;
  return useQuery<PostSpacing>({
    queryKey: [POST_SPACING_KEY, walletAddress],
    queryFn: () => getPostSpacing(),
    enabled: enabled && !!walletAddress,
    staleTime: 30_000,
    retry: false,
  });
}

const timeLabel = (d: Date, locale?: string) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function whenLabel(d: Date, t: (k: string, o?: Record<string, unknown>) => string, locale?: string) {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (sameDay(d, now)) return t('postSpacing.todayAt', { defaultValue: 'today at {{time}}', time: timeLabel(d, locale) });
  if (sameDay(d, tomorrow)) return t('postSpacing.tomorrowAt', { defaultValue: 'tomorrow at {{time}}', time: timeLabel(d, locale) });
  return `${d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeLabel(d, locale)}`;
}

/**
 * "Space my posts" in the When? sheet (Requests 86e8907b): one switch and a
 * gap. Saved on the account straight away, so the website, the app and the
 * assistant all space the same way.
 */
export function PostSpacingSection() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || undefined;
  const queryClient = useQueryClient();
  const walletAddress = useContext(AuthContext)?.walletAddress;
  const spacing = usePostSpacing(true);
  const save = useMutation({
    mutationFn: savePostSpacing,
    onSuccess: (next) => queryClient.setQueryData([POST_SPACING_KEY, walletAddress], next),
    onError: () => toast.error(t('postSpacing.saveFailed', { defaultValue: 'Could not save that. Try again.' })),
  });

  if (!walletAddress) return null;
  const data = save.isPending && save.variables !== undefined
    ? { ...(spacing.data ?? { nextAt: null, waiting: 0 }), gapMinutes: save.variables }
    : spacing.data;
  const gap = data?.gapMinutes ?? 0;
  const on = gap > 0;
  const nextAt = data?.nextAt ? new Date(data.nextAt) : null;

  return (
    <section data-post-spacing className="space-y-2.5">
      <label className="flex cursor-pointer items-center gap-3">
        <AlignLeft className="h-4 w-4 shrink-0 text-white/70" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-white">{t('postSpacing.title', { defaultValue: 'Space my posts' })}</span>
          {!on && (
            <span className="text-xs text-white/60">{t('postSpacing.offHint', { defaultValue: 'Each post waits its turn after your last one.' })}</span>
          )}
        </span>
        <Switch
          checked={on}
          disabled={spacing.isLoading}
          onCheckedChange={(v) => save.mutate(v ? (gap || 60) : 0)}
          aria-label={t('postSpacing.title', { defaultValue: 'Space my posts' })}
        />
      </label>
      {on && (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('postSpacing.gapLabel', { defaultValue: 'Time between posts' })}>
            {SPACING_CHOICES.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={g === gap}
                data-kit-chip
                data-active={g === gap ? 'true' : undefined}
                onClick={() => g !== gap && save.mutate(g)}
                className="!h-8 !rounded-[10px] !px-3 text-xs font-semibold"
              >
                {gapLabel(g, t)}
              </button>
            ))}
          </div>
          <p className="text-xs leading-snug text-white/60" data-post-spacing-hint>
            {nextAt
              ? t('postSpacing.hintNext', {
                  defaultValue: 'Each post goes out {{gap}} after your last one. Your next post goes out {{when}}.',
                  gap: gapLabel(gap, t),
                  when: whenLabel(nextAt, t, locale),
                })
              : t('postSpacing.hintNow', {
                  defaultValue: 'Your next post goes out straight away, then each one waits {{gap}} after the last.',
                  gap: gapLabel(gap, t),
                })}
            {(data?.waiting ?? 0) > 0 && (
              <> {t('postSpacing.waiting', { defaultValue: '{{count}} waiting in Planned.', count: data!.waiting })}</>
            )}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * "One post each" for a pick of several photos: every photo becomes its own
 * post, spaced out from the time chosen in the sheet (or now).
 */
export function DripSection({ count, gap, onChange, start }: { count: number; gap: number | null; onChange: (gap: number | null) => void; start: Date }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || undefined;
  const times = gap ? dripTimes(start, count, gap) : [];
  const last = times[times.length - 1];
  return (
    <section data-post-drip className="space-y-2.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <Layers className="h-4 w-4 text-white/70" />
        {t('postSpacing.dripTitle', { defaultValue: '{{count}} photos', count })}
      </p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        <button type="button" role="radio" aria-checked={!gap} data-kit-chip data-active={!gap ? 'true' : undefined} onClick={() => onChange(null)} className="!h-auto !justify-start !whitespace-normal !rounded-[10px] !px-3 !py-2.5 text-left text-xs font-semibold">
          {t('postSpacing.dripOne', { defaultValue: 'One post with all {{count}}', count })}
        </button>
        <button type="button" role="radio" aria-checked={!!gap} data-kit-chip data-active={gap ? 'true' : undefined} onClick={() => onChange(gap || 1440)} className="!h-auto !justify-start !whitespace-normal !rounded-[10px] !px-3 !py-2.5 text-left text-xs font-semibold">
          {t('postSpacing.dripEach', { defaultValue: 'One post each, spaced out' })}
        </button>
      </div>
      {!!gap && (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('postSpacing.howOften', { defaultValue: 'How often' })}>
            {DRIP_CHOICES.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={g === gap} data-kit-chip data-active={g === gap ? 'true' : undefined} onClick={() => onChange(g)} className="!h-8 !rounded-[10px] !px-3 text-xs font-semibold">
                {g === 1440 ? t('postSpacing.onceADay', { defaultValue: 'Once a day' }) : g === 60 ? t('postSpacing.everyHour', { defaultValue: 'Every hour' }) : t('postSpacing.every', { defaultValue: 'Every {{gap}}', gap: gapLabel(g, t) })}
              </button>
            ))}
          </div>
          {last && (
            <p className="text-xs leading-snug text-white/60" data-post-drip-hint>
              {t('postSpacing.dripHint', {
                defaultValue: 'First one {{first}}, last one {{last}}. Each lands in Planned, where you can move or cancel it.',
                first: start.getTime() <= Date.now() + 60_000 ? t('postSpacing.now', { defaultValue: 'now' }) : whenLabel(start, t, locale),
                last: whenLabel(last, t, locale),
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
