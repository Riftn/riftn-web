import { ASSISTANT_USERNAME, isAssistantAddress } from '@/lib/assistant';

/**
 * Where a person's profile lives.
 *
 * `/<username>` for everyone, with one exception: `/assistant` is the
 * Assistant page, so the @assistant account's own profile is `/@assistant`
 * (the profile route accepts the @ form). Without this, tapping the
 * assistant's avatar or name opened the chat page instead of its profile.
 */
export const ASSISTANT_PROFILE_PATH = `/@${ASSISTANT_USERNAME}`;

export function isAssistantHandle(handleOrAddress?: string | null): boolean {
  if (!handleOrAddress) return false;
  const bare = String(handleOrAddress).trim().replace(/^@/, '');
  return bare.toLowerCase() === ASSISTANT_USERNAME || isAssistantAddress(bare);
}

export function profilePath(handleOrAddress?: string | null): string {
  if (isAssistantHandle(handleOrAddress)) return ASSISTANT_PROFILE_PATH;
  return `/${handleOrAddress}`;
}
