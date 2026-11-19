import { afterEach, describe, expect, it } from 'vitest';
import { STALE_RELOAD_AFTER_MS, takeStaleReload, __setNewerDeployIdForTest } from './version-check';

describe('takeStaleReload', () => {
  afterEach(() => {
    __setNewerDeployIdForTest(null);
    sessionStorage.clear();
  });

  it('never reloads when no newer deploy has been seen', () => {
    expect(takeStaleReload(STALE_RELOAD_AFTER_MS * 2)).toBe(false);
  });

  it('keeps a fresh tab running after a deploy instead of reloading on navigation', () => {
    __setNewerDeployIdForTest('abc123');
    expect(takeStaleReload(60_000)).toBe(false);
    expect(takeStaleReload(STALE_RELOAD_AFTER_MS - 1)).toBe(false);
  });

  it('reloads a long-lived tab once per newer deploy', () => {
    __setNewerDeployIdForTest('abc123');
    expect(takeStaleReload(STALE_RELOAD_AFTER_MS)).toBe(true);
    expect(takeStaleReload(STALE_RELOAD_AFTER_MS + 1)).toBe(false);
    __setNewerDeployIdForTest('def456');
    expect(takeStaleReload(STALE_RELOAD_AFTER_MS + 2)).toBe(true);
  });
});
