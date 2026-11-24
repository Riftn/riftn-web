/**
 * "Space my posts" and "One post each" (Requests 86e8907b): the gap words and
 * the drip timetable, shared by the When? sheet, the composer and the tests.
 */

/** How often a drip of photos goes out, in minutes. */
export const DRIP_CHOICES = [60, 180, 1440] as const;

type T = (key: string, options?: Record<string, unknown>) => string;

/** "30 min", "1 hour", "3 hours", "1 day". */
export function gapLabel(minutes: number, t: T): string {
  if (minutes < 60) return t('postSpacing.minutes', { defaultValue: '{{n}} min', n: minutes });
  if (minutes % 1440 === 0) {
    const n = minutes / 1440;
    return n === 1 ? t('postSpacing.oneDay', { defaultValue: '1 day' }) : t('postSpacing.days', { defaultValue: '{{n}} days', n });
  }
  const n = minutes / 60;
  return n === 1 ? t('postSpacing.oneHour', { defaultValue: '1 hour' }) : t('postSpacing.hours', { defaultValue: '{{n}} hours', n });
}

/**
 * When each photo of a drip goes out: the first at `start` (or now, if that
 * has passed), then one every `gapMinutes`.
 */
export function dripTimes(start: Date, count: number, gapMinutes: number, now: Date = new Date()): Date[] {
  const first = Math.max(start.getTime(), now.getTime());
  return Array.from({ length: Math.max(0, count) }, (_, i) => new Date(first + i * gapMinutes * 60_000));
}

/** A drip time worth sending as a schedule: more than a minute away. Otherwise it posts now. */
export const isLater = (at: Date, now: number = Date.now()) => at.getTime() > now + 60_000;
