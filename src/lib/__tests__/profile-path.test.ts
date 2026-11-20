import { describe, expect, it } from 'vitest';
import { ASSISTANT_ADDRESS } from '@/lib/assistant';
import { ASSISTANT_PROFILE_PATH, profilePath } from '@/lib/profile-path';

describe('profilePath', () => {
  it('keeps every other profile at /<name>', () => {
    expect(profilePath('mal')).toBe('/mal');
    expect(profilePath('0xabc')).toBe('/0xabc');
  });

  it('sends @assistant to its profile, not the Assistant page', () => {
    expect(ASSISTANT_PROFILE_PATH).toBe('/@assistant');
    expect(profilePath('assistant')).toBe('/@assistant');
    expect(profilePath('@Assistant')).toBe('/@assistant');
    expect(profilePath(ASSISTANT_ADDRESS.toUpperCase().replace('0X', '0x'))).toBe('/@assistant');
  });
});
