import { useEffect, useMemo, useState } from 'react';

function timeFormatter(timeZone: unknown) {
  if (typeof timeZone !== 'string' || !timeZone) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  } catch {
    return null;
  }
}

export function readPublicTimeZone(value: unknown): string {
  return timeFormatter(value) ? String(value) : '';
}

export function useProfileLocalTime(timeZone: unknown): string {
  const formatter = useMemo(() => timeFormatter(timeZone), [timeZone]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!formatter) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [formatter]);
  return formatter?.format(now) ?? '';
}

/** Minutes a zone is ahead of UTC at `at` (negative when behind). */
function zoneOffsetMinutes(timeZone: string, at: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
  } catch {
    return null;
  }
}

/**
 * How far their clock is from the viewer's, in hours (half and quarter hours
 * kept, e.g. 5.5). 0 = same time. null when the zone is not readable.
 */
export function hoursFromViewer(timeZone: unknown, at = Date.now()): number | null {
  if (typeof timeZone !== 'string' || !timeZone) return null;
  const theirs = zoneOffsetMinutes(timeZone, at);
  if (theirs == null) return null;
  const mine = -new Date(at).getTimezoneOffset();
  return Math.round(((theirs - mine) / 60) * 4) / 4;
}

type Copy = (key: string, options: Record<string, unknown>) => string;

/** "Local time 3:12 AM GMT · 8 hrs ahead", or '' when they have not switched it on. */
export function localTimeLine(copy: Copy, time: string, timeZone: unknown): string {
  if (!time) return '';
  const base = copy('profile.localTime', { defaultValue: 'Local time {{time}}', time });
  const diff = hoursFromViewer(timeZone);
  if (diff == null || diff === 0) return base;
  const hours = Math.abs(diff);
  const gap = diff > 0
    ? copy('profile.localTimeAhead', { defaultValue: '{{hours}} hrs ahead', hours })
    : copy('profile.localTimeBehind', { defaultValue: '{{hours}} hrs behind', hours });
  return `${base} · ${gap}`;
}
