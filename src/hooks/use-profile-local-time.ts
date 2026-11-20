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
