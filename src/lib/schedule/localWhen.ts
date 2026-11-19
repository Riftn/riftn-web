/**
 * The When sheet's text box in the reader's own language.
 *
 * parseWhen only reads English ("fri 8pm", "in 2 hours"). This turns what a
 * reader types in their language ("cuma 20:00", "2 saat sonra", "yarın 9:00")
 * into those English words first, using the device's own day, month and
 * "in N hours" wording (Intl), so no word lists are kept by hand. It also
 * builds the box's examples in that language.
 * Kept identical in riftn-web and riftn-mobile.
 */

const EN_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const UNITS = ['minute', 'hour', 'day', 'week'] as const;
/** Samples that hit every plural form in the languages we speak (1, few, many, other). */
const SAMPLES = [1, 2, 3, 5, 7, 11, 21, 22, 25];

interface Table {
  words: Array<[string, string]>;
  relative: Array<[RegExp, string]>;
}

const tables = new Map<string, Table>();

/** Intl.RelativeTimeFormat, which some engines (Hermes) leave out. */
type RelativeFormat = {
  format(value: number, unit: string): string;
  formatToParts(value: number, unit: string): Array<{ type: string; value: string }>;
};
type RelativeFormatCtor = new (locale: string, options: Record<string, string>) => RelativeFormat;
const relativeFormat = (): RelativeFormatCtor | null => {
  const ctor = (Intl as unknown as { RelativeTimeFormat?: RelativeFormatCtor }).RelativeTimeFormat;
  return typeof ctor === 'function' ? ctor : null;
};

const lower = (s: string, locale: string) => {
  try { return s.toLocaleLowerCase(locale); } catch { return s.toLowerCase(); }
};
const clean = (s: string, locale: string) => lower(s, locale).replace(/[.,،]/g, ' ').replace(/\s+/g, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isEnglish(locale: string) {
  return /^en\b/i.test(locale || 'en');
}

function table(locale: string): Table {
  const hit = tables.get(locale);
  if (hit) return hit;
  const words = new Map<string, string>();
  const relative: Array<[RegExp, string]> = [];
  const add = (word: string, en: string) => {
    const w = clean(word, locale);
    if (w && !/\d/.test(w) && !words.has(w)) words.set(w, en);
  };
  try {
    // 7 Jan 2024 is a Sunday.
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(2024, 0, 7 + i, 12);
      for (const weekday of ['long', 'short'] as const) add(new Intl.DateTimeFormat(locale, { weekday }).format(d), EN_WEEKDAYS[i]);
    }
    for (let m = 0; m < 12; m += 1) {
      const d = new Date(2024, m, 15, 12);
      for (const month of ['long', 'short'] as const) {
        add(new Intl.DateTimeFormat(locale, { month }).format(d), EN_MONTHS[m]);
        // The form used inside a date ("15 ноября") can differ from the bare one.
        const part = new Intl.DateTimeFormat(locale, { day: 'numeric', month }).formatToParts(d).find(p => p.type === 'month');
        if (part) add(part.value, EN_MONTHS[m]);
      }
    }
  } catch { /* no Intl dates: English only */ }
  const RTF = relativeFormat();
  if (RTF) {
    try {
      const auto = new RTF(locale, { numeric: 'auto' });
      add(auto.format(0, 'day'), 'today');
      add(auto.format(1, 'day'), 'tomorrow');
      for (const style of ['long', 'short', 'narrow'] as const) {
        const rtf = new RTF(locale, { numeric: 'always', style });
        for (const unit of UNITS) {
          const seen = new Set<string>();
          for (const n of SAMPLES) {
            const parts = rtf.formatToParts(n, unit);
            if (!parts.some(p => p.type === 'integer')) continue;
            let numberDone = false;
            const source = parts.map((p) => {
              if (p.type === 'literal') return escape(clean(p.value, locale) ? ` ${clean(p.value, locale)} ` : ' ');
              if (numberDone) return '';
              numberDone = true;
              return ' (\\d+) ';
            }).join('').replace(/(\\ )+|\s+/g, ' ').trim().replace(/ /g, '\\s*');
            if (seen.has(source)) continue;
            seen.add(source);
            relative.push([new RegExp(`^${source}$`, 'u'), `${unit}s`]);
          }
        }
      }
    } catch { /* keep what we have */ }
  }
  const out: Table = {
    words: [...words.entries()].sort((a, b) => b[0].length - a[0].length),
    relative,
  };
  tables.set(locale, out);
  return out;
}

/** What the reader typed, in the English parseWhen reads. Unchanged when English. */
export function toEnglishWhen(input: string, locale: string): string {
  if (!input.trim() || isEnglish(locale)) return input;
  const t = table(locale);
  const text = clean(input, locale);
  for (const [re, unit] of t.relative) {
    const m = text.match(re);
    if (m) return `in ${m[1]} ${unit}`;
  }
  let out = ` ${text} `;
  for (const [word, en] of t.words) {
    out = out.replace(new RegExp(`(\\s)${escape(word)}(?=\\s)`, "gu"), `$1${en}`);
  }
  return out.trim();
}

/** The box's two examples ("cum 20:00", "2 saat sonra"), or null for English. */
export function localWhenExamples(locale: string, now: Date = new Date()): { day: string; relative: string | null } | null {
  if (isEnglish(locale)) return null;
  try {
    const ahead = (5 - now.getDay() + 7) % 7 || 7;
    const friday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, 20, 0);
    const day = `${lower(new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(friday), locale).replace(/\.$/, '')} ${new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(friday)}`;
    const RTF = relativeFormat();
    const relative = RTF ? new RTF(locale, { numeric: 'always' }).format(2, 'hour') : null;
    return { day, relative };
  } catch {
    return null;
  }
}

/** The placeholder with its English examples swapped for the reader's own. */
export function localWhenPlaceholder(text: string, locale: string): string {
  const ex = localWhenExamples(locale);
  if (!ex) return text;
  let out = text.replace('fri 8pm', ex.day);
  if (ex.relative) out = out.replace('in 2 hours', ex.relative);
  return out;
}
