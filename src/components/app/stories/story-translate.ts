/**
 * Whether a Moment's caption reads as a language other than the viewer's,
 * judged on the device with no request, so the Translate chip only shows where
 * it is useful.
 *
 * Text drawn on a Moment is flattened into the photo or overlay image, so the
 * caption is the only text a Moment stores as words.
 *
 * Scripts settle it on sight: an Arabic caption for an English reader, or a
 * Latin one for an Arabic reader. Two Latin languages are told apart by their
 * small words (see chat-language-hint), and when there are too few of those, by
 * letters the reader's alphabet does not use ("güzel" for an English reader).
 * Anything still unclear stays without a chip: a caption in the reader's own
 * language with a Translate chip on it is noise.
 *
 * Kept in step with riftn-mobile/components/Stories/story-translate.ts.
 */
import { chatLineLanguage } from '@/lib/chat-language-hint';

const SCRIPTS = [
  'Latin', 'Cyrillic', 'Arabic', 'Hebrew', 'Greek', 'Thai', 'Devanagari', 'Bengali', 'Tamil',
  'Telugu', 'Kannada', 'Malayalam', 'Gujarati', 'Gurmukhi', 'Sinhala', 'Georgian', 'Armenian',
  'Ethiopic', 'Khmer', 'Lao', 'Myanmar', 'Tibetan', 'Hangul', 'Han',
] as const;
// Built one by one so an engine missing a script's table loses that script,
// not the whole viewer.
const SCRIPT_TESTS = SCRIPTS.flatMap((name) => {
  try {
    return [[name, new RegExp(`\\p{Script=${name}}`, 'u')] as const];
  } catch {
    return [];
  }
});
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** The script each non-Latin reader language is written in. Everything else reads Latin. */
const READER_SCRIPT: Record<string, string> = {
  ja: 'Japanese', zh: 'Han', yue: 'Han', wuu: 'Han', ko: 'Hangul',
  ru: 'Cyrillic', uk: 'Cyrillic', bg: 'Cyrillic', be: 'Cyrillic', kk: 'Cyrillic', mn: 'Cyrillic', mk: 'Cyrillic', ky: 'Cyrillic', tg: 'Cyrillic', sr: 'Cyrillic',
  ar: 'Arabic', fa: 'Arabic', ur: 'Arabic', ps: 'Arabic', pbt: 'Arabic', sd: 'Arabic', skr: 'Arabic',
  acm: 'Arabic', acw: 'Arabic', aec: 'Arabic', ajp: 'Arabic', apd: 'Arabic', ary: 'Arabic', arz: 'Arabic', ayn: 'Arabic',
  he: 'Hebrew', yi: 'Hebrew', el: 'Greek', th: 'Thai',
  hi: 'Devanagari', mr: 'Devanagari', ne: 'Devanagari', mag: 'Devanagari', bho: 'Devanagari', hne: 'Devanagari', mai: 'Devanagari',
  bn: 'Bengali', as: 'Bengali', ctg: 'Bengali', syl: 'Bengali',
  ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', gu: 'Gujarati', pa: 'Gurmukhi', si: 'Sinhala',
  ka: 'Georgian', hy: 'Armenian', am: 'Ethiopic', ti: 'Ethiopic', km: 'Khmer', lo: 'Lao', my: 'Myanmar', bo: 'Tibetan',
};

/**
 * Letters beyond a-z that each Latin reader language writes with. A caption
 * using a letter outside this set is in some other language. Only languages
 * listed here get that check; for the rest an unclear caption stays as is.
 */
const READER_LETTERS: Record<string, string> = {
  en: '',
  es: 'áéíóúñü',
  pt: 'áâãàçéêíóôõú',
  fr: 'àâæçéèêëîïôœùûüÿ',
  de: 'äöüß',
  it: 'àèéìíîòóù',
  nl: 'éëïöüáèóú',
  tr: 'çğıöşüâî',
  id: '',
  tl: 'ñ',
};

function base(lang: string): string {
  return lang.toLowerCase().split(/[-_]/)[0];
}

/** Links, handles, tags and cashtags say nothing about the language. */
function prose(text: string): string {
  return text
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/[@#$][\p{L}\p{N}_.-]+/gu, ' ');
}

/** The script most of the letters are in; kana makes it Japanese. */
function textScript(letters: string[]): string {
  if (letters.some((c) => KANA.test(c))) return 'Japanese';
  const counts = new Map<string, number>();
  for (const c of letters) {
    const hit = SCRIPT_TESTS.find(([, re]) => re.test(c));
    const name = hit ? hit[0] : 'Other';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best = 'Latin';
  let most = 0;
  for (const [name, n] of counts) if (n > most) { best = name; most = n; }
  return best;
}

export function momentTextLooksForeign(text: string | null | undefined, readerLang: string): boolean {
  const words = prose(text ?? '');
  const letters = words.match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  const reader = base(readerLang || 'en');
  const script = textScript(letters);
  const readerScript = READER_SCRIPT[reader] ?? 'Latin';
  if (script !== 'Latin' || readerScript !== 'Latin') return script !== readerScript;

  const lang = chatLineLanguage(words);
  if (lang) return base(lang) !== reader;

  const own = READER_LETTERS[reader];
  if (own === undefined) return false;
  return letters.some((c) => {
    const lower = c.toLowerCase();
    return !/[a-z]/.test(lower) && !own.includes(lower);
  });
}
