import { COUNTER_PLACEHOLDERS, formatCount } from '@/lib/format-count';

/**
 * i18next runs every {{placeholder}} through this. Counter placeholders
 * ({{count}}, {{views}}, {{listens}}...) come out short: "1.2K listens".
 * Plurals still pick their form from the real number, and every other
 * placeholder is left exactly as passed.
 */
export function shortenCounterPlaceholder(
  value: unknown,
  format?: string,
  _lng?: string,
  options?: { interpolationkey?: string; [key: string]: unknown },
): unknown {
  if (format) return value;
  const key = options?.interpolationkey;
  if (!key || !COUNTER_PLACEHOLDERS.has(key)) return value;
  if (typeof value === 'number' || typeof value === 'string') return formatCount(value);
  return value;
}
