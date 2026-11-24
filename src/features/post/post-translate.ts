import { supabase } from '@/integrations/supabase/client';

/**
 * Translate a post draft before it is posted (AI menu > Translate).
 *
 * The draft is private until it is posted, so it goes to translate-text as
 * private text: it is never cached in the shared post translation table.
 */

const LANG_KEY = 'riftn.postTranslateLang';
const TIMEOUT_MS = 20000;

export interface DraftTranslation {
  text: string;
  /** Language the draft was written in, when the translator could tell. */
  from: string | null;
  /** The draft already reads in the picked language. */
  same: boolean;
}

export function rememberedTranslateLang(): string {
  try {
    return localStorage.getItem(LANG_KEY) || 'en';
  } catch {
    return 'en';
  }
}

export function rememberTranslateLang(lang: string): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* private window: just not remembered */
  }
}

export async function translateDraft(text: string, targetLang: string): Promise<DraftTranslation> {
  const typed = text.trim();
  const call = supabase.functions.invoke('translate-text', { body: { text: typed, targetLang } });
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
  const res = await Promise.race([call, timeout]);
  if (res.error) throw res.error;
  const data = (res.data ?? {}) as {
    translatedText?: string;
    sameLanguage?: boolean;
    error?: string;
    detectedLanguage?: { language?: string };
  };
  if (data.error) throw new Error(data.error);
  const out = typeof data.translatedText === 'string' ? data.translatedText.trim() : '';
  if (!out) throw new Error('empty');
  const detected = data.detectedLanguage?.language;
  const from = detected && detected !== 'auto' ? detected.toLowerCase() : null;
  const same = data.sameLanguage === true
    || out.replace(/\s+/g, ' ').toLowerCase() === typed.replace(/\s+/g, ' ').toLowerCase();
  return { text: out, from, same };
}

/** Languages for the picker: the last one used, English, the app language, then the rest by name. */
export function orderedTranslateLanguages(names: Record<string, string>, appLang: string, last: string): string[] {
  const all = Object.keys(names);
  const front = [last, 'en', appLang].filter((c, i, a) => !!names[c] && a.indexOf(c) === i);
  const rest = all
    .filter((c) => !front.includes(c))
    .sort((a, b) => names[a].localeCompare(names[b]));
  return [...front, ...rest];
}
