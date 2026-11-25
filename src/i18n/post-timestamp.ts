import type { TFunction } from 'i18next';
import { formatRelativeTime } from './date-locale';

const ageUnits = [
  { unit: 'year', minutes: 525600, suffix: 'y', key: 'communities.time.years' },
  { unit: 'month', minutes: 43200, suffix: 'mo', key: 'communities.time.months' },
  { unit: 'week', minutes: 10080, suffix: 'w', key: 'communities.time.weeks' },
  { unit: 'day', minutes: 1440, suffix: 'd', key: 'communities.time.days' },
  { unit: 'hour', minutes: 60, suffix: 'h', key: 'comments.timeHours' },
  { unit: 'minute', minutes: 1, suffix: 'm', key: 'comments.timeMinutes' },
] as const;

const unitFormats = new Map<string, Intl.NumberFormat | null>();

export function formatPostAge(date: Date | null, language: string, t: TFunction, now = Date.now()): string {
  if (!date || !Number.isFinite(date.getTime())) return '';
  const minutes = Math.floor(Math.max(0, now - date.getTime()) / 60000);
  if (minutes === 0) return formatRelativeTime(null, language);

  const age = ageUnits.find(({ minutes: size }) => minutes >= size) ?? ageUnits[5];
  const count = Math.floor(minutes / age.minutes);
  const locale = language.replace(/_/g, '-');
  if (/^en(?:-|$)/i.test(locale)) return `${count}${age.suffix}`;

  const key = `${locale}:${age.unit}`;
  if (!unitFormats.has(key)) {
    try {
      const supported = Intl.NumberFormat.supportedLocalesOf(locale);
      const options = { style: 'unit', unit: age.unit, unitDisplay: 'short' } as const;
      unitFormats.set(key, supported.length ? new Intl.NumberFormat(supported, options) : null);
    } catch {
      // Some mobile runtimes lack unit formatting. Use the app's translations.
      unitFormats.set(key, null);
    }
  }
  return unitFormats.get(key)?.format(count) ?? t(age.key, { count, defaultValue: `${count}${age.suffix}` });
}

export function parsePostTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatPostDate(date: Date, language: string, options: Intl.DateTimeFormatOptions): string {
  // The timestamp supplies the instant. Intl uses the viewer's current time zone.
  return date.toLocaleString(language.replace(/_/g, '-'), options);
}

export function formatArticlePostDate(date: Date, language: string): string {
  return formatPostDate(date, language, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}
