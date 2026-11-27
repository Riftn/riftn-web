/**
 * Where the Riftn API lives.
 *
 * Production keeps https://api.dehub.io. A backup copy of the site (another
 * domain, or the IPFS copy behind riftn.eth) can be built against a different
 * address with VITE_API_ORIGIN, so moving the API never needs code changes in
 * the middle of an outage. See docs/BACKUP-ADDRESSES.md.
 */
const DEFAULT_API_ORIGIN = 'https://api.dehub.io';

function readApiOrigin(): string {
  const raw = (import.meta.env?.VITE_API_ORIGIN as string | undefined)?.trim();
  if (!raw || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(raw)) return DEFAULT_API_ORIGIN;
  return raw.replace(/\/+$/, '');
}

export const API_ORIGIN = readApiOrigin();

/** Same-origin relay used when the API host can't be reached directly. */
export function backupRelayBase(): string | null {
  const raw = (import.meta.env?.VITE_API_RELAY_BASE as string | undefined)?.trim();
  return raw && /^https:\/\//i.test(raw) ? raw.replace(/\/+$/, '') : null;
}
