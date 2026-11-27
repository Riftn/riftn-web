// Share links that credit the sharer. App sets the code at sign-in (see
// useAffiliateShareUrl.ts), so handlers read it synchronously, inside the tap.

/** Append `ref=CODE`, keeping path, query and hash. Root-relative stays relative. */
export const withAffiliateRef = (url: string, code: string | null | undefined, parameter = 'ref'): string => {
  if (!code) return url;
  try {
    const relative = url.startsWith('/') && !url.startsWith('//');
    const u = relative ? new URL(url, 'https://riftn.com') : new URL(url);
    if (parameter === 'live_ref') {
      u.searchParams.delete('ref');
      u.searchParams.delete('aff');
      u.searchParams.delete('sub');
    }
    u.searchParams.set(parameter, code);
    return relative ? u.pathname + u.search + u.hash : u.toString();
  } catch {
    return url;
  }
};

let viewerCode: string | null = null;
// Bumped on every clear, so a lookup that finishes after sign-out is dropped.
let epoch = 0;

/** The signed-in viewer's code, or null when signed out or they have none. */
export const setViewerAffiliateCode = (code: string | null) => {
  viewerCode = code;
  if (!code) epoch++;
};

export const viewerCodeEpoch = () => epoch;

const isDehub = (url: string) => {
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  try {
    const host = new URL(url).hostname;
    return host === 'riftn.com' || host.endsWith('.riftn.com') || host === 'dehub.io' || host.endsWith('.dehub.io') || host === window.location.hostname;
  } catch {
    return false;
  }
};

/** `url` with the viewer's `?ref=CODE`; unchanged without one or off Riftn. */
export const viewerShareUrl = (url: string): string =>
  viewerCode && isDehub(url) ? withAffiliateRef(url, viewerCode) : url;

/** Public live shares use the viewer's code, and credit only a later signup. */
export const viewerLiveShareUrl = (url: string, isPublic: boolean): string =>
  isPublic && viewerCode && isDehub(url) ? withAffiliateRef(url, viewerCode, 'live_ref') : url;
