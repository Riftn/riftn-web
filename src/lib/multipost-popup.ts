/**
 * Connecting a multi-post account from the composer signs in through a small
 * window (a new tab on phones) so the post being written never unloads. The
 * platform sends that window back here with `?mp_popup=1&connected=x`; it tells
 * the composer and closes. If the browser won't let it close, the settings page
 * underneath loads as usual and shows the account as connected.
 */
export const MULTIPOST_POPUP_PARAM = 'mp_popup';
export const MULTIPOST_CHANNEL = 'riftn-multipost';

export interface MultipostPopupResult { connected: string | null; error: string | null; platform: string | null }

export function finishMultipostPopup(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.get(MULTIPOST_POPUP_PARAM) !== '1') return;
  const result: MultipostPopupResult = {
    connected: params.get('connected'),
    error: params.get('error'),
    platform: params.get('platform'),
  };
  try {
    const channel = new BroadcastChannel(MULTIPOST_CHANNEL);
    channel.postMessage(result);
    channel.close();
  } catch { /* old browser: the composer refetches when its tab gets focus back */ }
  setTimeout(() => window.close(), 150);
}

/** Opened inside the click so popup blockers allow it; filled in once the sign-in link arrives. */
export function openMultipostWindow(): Window | null {
  try {
    return window.open('', 'riftn-multipost', 'popup,width=520,height=760');
  } catch {
    return null;
  }
}
