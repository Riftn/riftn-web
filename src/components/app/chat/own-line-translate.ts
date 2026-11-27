/**
 * Translate on a line you sent yourself (message menu, or the small button
 * under it). Only you see the result; nothing is sent or saved.
 *
 * It goes into the language you read Riftn in. When the line is already in
 * that language, it goes into the language you translate to in the chat
 * composer instead (the same pick as the composer's Translate), so a line
 * typed in your own language shows the way it reads in the other one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation as useI18n } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserLanguage } from '@/hooks/use-user-language';
import { translateTarget } from '@/hooks/use-compose-translate';

const HAS_LETTERS = /\p{L}/u;
const TIMEOUT_MS = 8000;

type Answer = { text: string; lang: string } | 'same' | null;

function sameWords(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function ask(text: string, lang: string): Promise<Answer> {
  // Private: a direct message never goes to a provider that keeps its input.
  const call = supabase.functions.invoke('translate-text', { body: { text, targetLang: lang, purpose: 'chat' } });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
  const res = await Promise.race([call, timeout]);
  if (!res || res.error) return null;
  const data = (res.data ?? {}) as { translatedText?: string; sameLanguage?: boolean };
  const out = typeof data.translatedText === 'string' ? data.translatedText.trim() : '';
  if (!out) return null;
  if (data.sameLanguage === true || sameWords(out, text)) return 'same';
  return { text: out, lang };
}

/** Your line in your language, or in your composer language when it already reads in yours. */
export async function translateOwnLine(text: string, readerLang: string, composeLang: string): Promise<Answer> {
  const typed = text.trim();
  if (!typed || !HAS_LETTERS.test(typed)) return 'same';
  const first = await ask(typed, readerLang);
  if (first !== 'same') return first;
  if (!composeLang || composeLang === readerLang) return 'same';
  return ask(typed, composeLang);
}

export function useOwnLineTranslate(text: string, enabled: boolean) {
  const { t } = useI18n();
  const { language } = useUserLanguage();
  const [result, setResult] = useState<{ text: string; lang: string } | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  // An edit or a language change makes the old answer stale.
  useEffect(() => {
    generation.current += 1;
    setResult(null);
    setShown(false);
    setBusy(false);
  }, [text, language]);

  const translate = useCallback(async () => {
    if (!enabled || busy) return;
    if (result) { setShown(true); return; }
    const mine = ++generation.current;
    setBusy(true);
    try {
      const answer = await translateOwnLine(text, language, translateTarget());
      if (mine !== generation.current) return;
      if (answer === 'same') {
        toast(t('stories.alreadyYourLanguage', { defaultValue: 'Already in your language' }));
      } else if (!answer) {
        toast.error(t('copy.037091068590', { defaultValue: 'Translation failed' }));
      } else {
        setResult(answer);
        setShown(true);
      }
    } catch {
      if (mine === generation.current) toast.error(t('copy.037091068590', { defaultValue: 'Translation failed' }));
    } finally {
      if (mine === generation.current) setBusy(false);
    }
  }, [enabled, busy, result, text, language, t]);

  const showOriginal = useCallback(() => setShown(false), []);

  return {
    isTranslated: shown && !!result,
    translatedText: result?.text ?? '',
    lang: result?.lang ?? null,
    isLoading: busy,
    translate,
    showOriginal,
  };
}
