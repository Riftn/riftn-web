import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import labels from '@/i18n/no-internet-labels.json';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function OfflineNotice() {
  const offline = useSyncExternalStore(subscribe, () => !navigator.onLine, () => false);
  const { i18n } = useTranslation();
  // The warning must be available even before an offline locale pack can load.
  // This bundled label matches common.noInternetTitle in the native app.
  const code = (i18n.language || 'en').toLowerCase().replace('-', '_');
  const translations: Record<string, string> = labels;

  return (
    <div role="status" className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[90] flex justify-center">
      {offline && (
        <span className="rounded-xl border border-border bg-popover px-3 py-2 text-center text-sm font-medium text-popover-foreground shadow-sm">
          {translations[code] ?? translations[code.split('_')[0]] ?? labels.en}
        </span>
      )}
    </div>
  );
}
