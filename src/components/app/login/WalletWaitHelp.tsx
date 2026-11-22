import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';

/** How long the wallet gets before the way out shows. */
const HELP_AFTER_MS = 8_000;

const isPhone = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod|android/i.test(navigator.userAgent);

/**
 * Shown while the sign-in waits on a wallet that has not answered.
 *
 * The wait dims the whole sheet and takes its taps, so a wallet that never
 * opened (Safari on iPhone does not switch apps for a request sent after the
 * tap) left people on a dark screen with nothing to press. After a few seconds
 * this offers the two things that help: open the wallet app to approve, and
 * cancel back to the sign-in options.
 *
 * The wallet's link is worked out before it is shown, so the tap itself only
 * navigates; Safari only switches apps from a navigation inside the tap.
 */
export function WalletWaitHelp({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const { cancelWalletLogin } = useAuth();
  const [shown, setShown] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), HELP_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (!shown) return;
    let off = false;
    void (async () => {
      try {
        const [{ getAccount }, { wagmiConfig }] = await Promise.all([
          import('@wagmi/core'),
          import('@/lib/wagmi'),
        ]);
        const connector = getAccount(wagmiConfig).connector;
        if (!connector || off) return;
        setWalletName(connector.name || null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const provider = (await connector.getProvider()) as any;
        const meta = provider?.session?.peer?.metadata;
        const redirect = meta?.redirect;
        const url = isPhone() ? (redirect?.universal || redirect?.native || null) : null;
        if (off) return;
        if (meta?.name) setWalletName(meta.name);
        setLink(typeof url === 'string' && url ? url : null);
      } catch {
        /* no wallet attached yet: Cancel alone */
      }
    })();
    return () => { off = true; };
  }, [shown]);

  if (!active || !shown || typeof document === 'undefined') return null;

  const name = walletName || t('toasts.your_wallet', 'your wallet');
  return createPortal(
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[2147483647] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/15 bg-black/70 p-4 text-center text-white backdrop-blur-xl">
        <p className="text-sm font-medium">
          {t('loginModal.walletWaitTitle', 'Waiting for {{wallet}}', { wallet: name })}
        </p>
        <p className="mt-1 text-xs text-white/70">
          {t('loginModal.walletWaitBody', 'Approve the request in your wallet app, or cancel and try again.')}
        </p>
        <div className="mt-3 flex gap-2">
          {link && (
            <a
              href={link}
              className="flex-1 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-black"
            >
              {t('loginModal.walletWaitOpen', 'Open {{wallet}}', { wallet: name })}
            </a>
          )}
          <button
            type="button"
            onClick={() => { void cancelWalletLogin(); }}
            className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white"
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default WalletWaitHelp;
