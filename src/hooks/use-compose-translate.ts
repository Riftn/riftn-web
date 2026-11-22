/**
 * The composer's Translate button: rewrites what is typed into the chosen
 * language before it is sent. English until the person picks another in the
 * chat composer's menu; the pick is shared (same key as the chat composer and
 * the app).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SUPPORTED_LANGUAGES } from '@/i18n';

export const TRANSLATE_TO_KEY = 'riftn.chat.translateTo';

export function translateTarget(fallback = 'en'): string {
  try { return localStorage.getItem(TRANSLATE_TO_KEY) || fallback; } catch { return fallback; }
}

export function translateTargetName(code = translateTarget()): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.nativeName ?? code;
}

export function useComposeTranslate(text: string, setText: (value: string) => void) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const translate = useCallback(async (code = translateTarget()) => {
    const draft = text.trim();
    if (!draft || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        body: { text: draft, targetLang: code },
      });
      const out: string | undefined = data?.translatedText;
      if (error || !out) {
        toast.error(t('copy.037091068590', { defaultValue: 'Translation failed' }));
        return;
      }
      if (data?.sameLanguage || out.trim() === draft) {
        toast(`${t('copy.8fe147696fbf', { defaultValue: 'Translate' })} · ${translateTargetName(code)} ✓`);
        return;
      }
      if (mounted.current) setText(out);
    } catch {
      toast.error(t('copy.037091068590', { defaultValue: 'Translation failed' }));
    } finally {
      setBusy(false);
    }
  }, [text, busy, setText, t]);
  return { translate, busy };
}
