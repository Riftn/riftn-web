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

const relativeFormats = new Map<string, Intl.RelativeTimeFormat | null>();

export function formatPostAge(date: Date | null, language: string, t: TFunction, now = Date.now()): string {
  if (!date || !Number.isFinite(date.getTime())) return '';
  const minutes = Math.floor(Math.max(0, now - date.getTime()) / 60000);
  if (minutes === 0) return formatRelativeTime(null, language);

  const age = ageUnits.find(({ minutes: size }) => minutes >= size) ?? ageUnits[5];
  const count = Math.floor(minutes / age.minutes);
  const locale = language.replace(/_/g, '-');
  const compactAge = `${count}${age.suffix}`;
  if (/^en(?:-|$)/i.test(locale)) return `${compactAge} ago`;

  if (!relativeFormats.has(locale)) {
    try {
      const supported = Intl.RelativeTimeFormat.supportedLocalesOf(locale);
      relativeFormats.set(locale, supported.length
        ? new Intl.RelativeTimeFormat(supported, { numeric: 'always', style: 'short' })
        : null);
    } catch {
      relativeFormats.set(locale, null);
    }
  }
  // Hermes on iOS can convert hour and minute measurements into seconds.
  const relativeFormat = relativeFormats.get(locale);
  if (relativeFormat) return relativeFormat.format(-count, age.unit);

  const time = t(age.key, { count, defaultValue: compactAge });
  return t('stories.agoLabel', { time, defaultValue: '{{time}} ago' });
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
