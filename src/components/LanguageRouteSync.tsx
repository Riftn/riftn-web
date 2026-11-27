import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loadLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { publicPageLanguages } from '@/lib/seo/public-locales';

// The ?hl= value this tab last applied. Module level so a remount can't apply
// the same link twice, and cleared once the URL no longer carries one.
let appliedUrlLanguage: string | null = null;
const urlLanguage = () => {
  try { return new URLSearchParams(window.location.search).get('hl')?.toLowerCase() || null; } catch { return null; }
};

/**
 * Search-result URLs and in-app language changes select the same language.
 *
 * A ?hl= link sets the language for this visit only and is never saved as the
 * reader's preference, so a shared Turkish link can't keep every later visit in
 * Turkish. Both directions read window.location rather than the router's copy:
 * a render that still held the old ?hl= used to switch the language straight
 * back after the reader picked another one.
 */
export function LanguageRouteSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const subscribeLanguage = useCallback((changed: () => void) => {
    i18n.on('languageChanged', changed);
    return () => { i18n.off('languageChanged', changed); };
  }, [i18n]);
  const language = useSyncExternalStore(subscribeLanguage, () => i18n.language || 'en', () => 'en');
  const pendingUrlLanguage = useRef<string | null>(null);
  const languageAtRequest = useRef(i18n.language);
  useEffect(() => {
    const requested = urlLanguage();
    if (!requested) { appliedUrlLanguage = null; return; }
    if (requested === appliedUrlLanguage || !SUPPORTED_LANGUAGES.some(option => option.code === requested)) return;
    appliedUrlLanguage = requested;
    if (i18n.language === requested) return;
    pendingUrlLanguage.current = requested;
    languageAtRequest.current = i18n.language;
    let cancelled = false;
    void loadLanguage(requested).then(ok => {
      // Still the URL being shown, and nobody picked a language meanwhile.
      if (ok && !cancelled && urlLanguage() === requested && i18n.language === languageAtRequest.current) {
        pendingUrlLanguage.current = null;
        void i18n.changeLanguage(requested);
      }
    }).finally(() => { if (!cancelled) pendingUrlLanguage.current = null; });
    return () => { cancelled = true; pendingUrlLanguage.current = null; };
  }, [location.key, location.search, i18n]);

  const syncUrl = useCallback((lang: string) => {
    const languages = publicPageLanguages(location.pathname);
    if (!languages.length) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('hl');
    // Let a newly visited explicit URL finish selecting its language first.
    if (pendingUrlLanguage.current && pendingUrlLanguage.current !== lang) {
      if (lang === languageAtRequest.current) return;
      pendingUrlLanguage.current = null;
    }
    const next = languages.includes(lang) ? lang : null;
    if (requested !== next) {
      // The reader moved off the link's language; don't re-apply that link.
      appliedUrlLanguage = next;
      if (next) params.set('hl', next);
      else params.delete('hl');
      navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
    }
    // location.search: re-check the address bar whenever its query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, location.hash, navigate]);
  useEffect(() => { syncUrl(language); }, [language, syncUrl]);
  useEffect(() => {
    i18n.on('languageChanged', syncUrl);
    return () => { i18n.off('languageChanged', syncUrl); };
  }, [i18n, syncUrl]);
  return null;
}
