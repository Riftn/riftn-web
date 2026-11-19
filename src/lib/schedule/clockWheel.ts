/**
 * Columns for the "When?" sheet's spinning time wheel: hours, minutes and,
 * where the reader's clock is 12-hour, AM/PM. Same file in the app
 * (riftn-mobile libs/clockWheel.ts).
 */
export const WHEEL_MINUTE_STEP = 5;

/** True when the locale writes 1 PM rather than 13:00. */
export function uses12Hour(locale: string | undefined): boolean {
  try {
    const cycle = (new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions() as { hourCycle?: string }).hourCycle;
    if (cycle) return cycle === 'h12' || cycle === 'h11';
    return !new Date(2024, 0, 1, 13).toLocaleTimeString(locale, { hour: 'numeric' }).includes('13');
  } catch {
    return false;
  }
}

/** The locale's own words for morning and afternoon ("AM"/"PM", "ÖÖ"/"ÖS", "午前"/"午後"). */
export function periodLabels(locale: string | undefined): [string, string] {
  const word = (h: number, fallback: string) => {
    try {
      const parts = new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true }).formatToParts(new Date(2024, 0, 1, h));
      return parts.find(p => p.type === 'dayPeriod')?.value?.trim() || fallback;
    } catch {
      return fallback;
    }
  };
  return [word(9, 'AM'), word(21, 'PM')];
}

export interface WheelColumns {
  hours: string[];
  minutes: string[];
  periods: [string, string] | null;
}

export function wheelColumns(locale: string | undefined): WheelColumns {
  const twelve = uses12Hour(locale);
  return {
    hours: twelve
      ? Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i))
      : Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
    minutes: Array.from({ length: 60 / WHEEL_MINUTE_STEP }, (_, i) => String(i * WHEEL_MINUTE_STEP).padStart(2, '0')),
    periods: twelve ? periodLabels(locale) : null,
  };
}

/** Where each wheel sits for a time of day given in minutes after midnight. */
export function wheelIndexes(totalMinutes: number, twelve: boolean) {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = Math.min(60 / WHEEL_MINUTE_STEP - 1, Math.round((totalMinutes % 60) / WHEEL_MINUTE_STEP));
  return { hour: twelve ? hour % 12 : hour, minute, period: hour >= 12 ? 1 : 0 };
}

/** Minutes after midnight for the wheels' positions. */
export function wheelMinutes(idx: { hour: number; minute: number; period: number }, twelve: boolean): number {
  const hour = twelve ? (idx.hour % 12) + (idx.period ? 12 : 0) : idx.hour;
  return hour * 60 + idx.minute * WHEEL_MINUTE_STEP;
}

/** Screen-reader names for the wheels, in the reader's language ("Stunde", "dakika"). */
export function wheelLabels(locale: string | undefined): { hour: string; minute: string; period: string } {
  const name = (field: string, fallback: string) => {
    try {
      const names = new (Intl as unknown as { DisplayNames: new (l: string | undefined, o: { type: string }) => { of: (f: string) => string | undefined } }).DisplayNames(locale, { type: 'dateTimeField' });
      const text = names.of(field);
      return text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : fallback;
    } catch {
      return fallback;
    }
  };
  return { hour: name('hour', 'Hour'), minute: name('minute', 'Minute'), period: name('dayPeriod', 'AM/PM') };
}
