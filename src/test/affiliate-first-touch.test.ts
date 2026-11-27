import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/connection-source', () => ({ readLastSession: () => null }));
import { captureAffiliateRefFromUrl, getAffiliateRef, getAffiliateSubRef, getEligibleAffiliateRef, setAffiliateRef } from '../lib/affiliateRef';

beforeEach(() => {
  for (const name of ['dehub_aff_ref', 'dehub_aff_sub']) document.cookie = `${name}=; max-age=0; path=/`;
});

describe('public live-share attribution', () => {
  it('keeps the first live share through later invites and credits only accounts created after arrival', () => {
    const arrival = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(arrival);
    try {
      captureAffiliateRefFromUrl(null, '?live_ref=SHARER&sub=private');
      captureAffiliateRefFromUrl(null, '?live_ref=OTHER');
      setAffiliateRef('INVITE', 'campaign');
      expect(getAffiliateRef()).toBeNull();
      expect(getAffiliateSubRef()).toBeNull();
      expect(getEligibleAffiliateRef()).toBeNull();
      expect(getEligibleAffiliateRef(new Date(arrival - 1000).toISOString())).toBeNull();
      expect(getEligibleAffiliateRef(new Date(arrival + 1000).toISOString())).toBe('SHARER');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('keeps an earlier regular invite and its outreach tag', () => {
    setAffiliateRef('INVITE', 'campaign');
    captureAffiliateRefFromUrl(null, '?live_ref=SHARER');
    expect(getEligibleAffiliateRef()).toBe('INVITE');
    expect(getAffiliateSubRef()).toBe('campaign');
  });
});

describe('first-touch outreach attribution', () => {
  it('keeps the original parent and tag together across later links', () => {
    setAffiliateRef('PARENT', 'john');
    setAffiliateRef('OTHER', 'sarah');
    expect(getAffiliateRef()).toBe('PARENT');
    expect(getAffiliateSubRef()).toBe('john');
  });
  it('does not add a later tag to an existing untagged first touch', () => {
    setAffiliateRef('PARENT');
    setAffiliateRef('PARENT', 'john');
    expect(getAffiliateSubRef()).toBeNull();
  });
  it('rejects a stale tag whose parent differs from the current cookie', () => {
    setAffiliateRef('PARENT', 'john');
    document.cookie = 'dehub_aff_ref=OTHER; path=/';
    expect(getAffiliateSubRef()).toBeNull();
  });
});
