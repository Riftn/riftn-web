import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from '@/components/ui/sonner';
import titles from '@/i18n/offline-connection-titles.json';
import { resolveLanguage } from '@/lib/user-language-store';

const TOAST_ID = 'offline-connection';
const OFFLINE_DEBOUNCE_MS = 4000;
const titlesByLanguage: Record<string, string> = titles;
const hasTitle = (code: string) => Object.prototype.hasOwnProperty.call(titlesByLanguage, code);

/** Uses bundled copy because the first offline visit may have no cached locale pack. */
export function OfflineConnectionToast() {
  const { pathname } = useLocation();
  const isStreamOverlay = pathname.startsWith('/overlay/');

  useEffect(() => {
    if (isStreamOverlay) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function showOffline() {
      if (navigator.onLine) return;
      const requested = new URLSearchParams(window.location.search).get('hl')?.toLowerCase();
      const language = requested && hasTitle(requested) ? requested : resolveLanguage();
      const code = hasTitle(language) ? language : 'en';
      toast.message(<bdi lang={code.replace('_', '-')}>{titlesByLanguage[code]}</bdi>, {
        id: TOAST_ID,
        duration: 8000,
      });
    }

    function onOffline() {
      clearTimeout(timer);
      timer = setTimeout(showOffline, OFFLINE_DEBOUNCE_MS);
    }

    function onOnline() {
      clearTimeout(timer);
      toast.dismiss(TOAST_ID);
    }

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    showOffline();
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      onOnline();
    };
  }, [isStreamOverlay]);

  return null;
}
