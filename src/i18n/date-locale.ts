import { formatDistance, setDefaultOptions } from 'date-fns';
import { ar, es, fr, nl, tr, enUS } from 'date-fns/locale';

const locales = { ar, es, fr, nl, tr };
export function applyDateLocale(language: string): void {
  setDefaultOptions({ locale: locales[language as keyof typeof locales] || enUS });
}

/**
 * Whether the viewer's own region writes times on a 24-hour clock (Turkey and
 * most of Europe: 14:30) or a 12-hour one (US: 2:30 PM). Read from the
 * browser's regional settings, not the app language.
 */
export function usesRegion24h(): boolean {
  try {
    const cycle = (new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions() as { hourCycle?: string }).hourCycle;
    if (cycle) return cycle === 'h23' || cycle === 'h24';
  } catch {
    // fall through
  }
  return true;
}

/** A message clock in the viewer's local time and regional format (midnight is 00:00 on a 24-hour clock). */
export function formatMessageTime(date: Date, locale?: string, h24: boolean = usesRegion24h()): string {
  return h24
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' });
}

export function formatRelativeTime(input: string | number | Date | null | undefined, language: string, style: 'long' | 'short' | 'narrow' = 'long'): string {
  const value = input == null ? NaN : new Date(input).getTime();
  const elapsed = Number.isFinite(value) ? Math.max(0, Date.now() - value) : 0;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86400000], ['month', 30 * 86400000], ['week', 7 * 86400000],
    ['day', 86400000], ['hour', 3600000], ['minute', 60000],
  ];
  const [unit, size] = units.find(([, duration]) => elapsed >= duration) || ['second', Infinity];
  try {
    return new Intl.RelativeTimeFormat(language.replace('_', '-'), { numeric: 'auto', style })
      .format(-Math.floor(elapsed / size), unit);
  } catch {
    // Older browsers can omit RelativeTimeFormat entirely; use the bundled
    // date locales instead of retrying the same missing constructor.
    const locale = locales[language.split(/[-_]/)[0] as keyof typeof locales] || enUS;
    const now = Date.now();
    return formatDistance(new Date(now - elapsed), new Date(now), { locale, addSuffix: true });
  }
}
