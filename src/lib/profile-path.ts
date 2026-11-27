import { ASSISTANT_ADDRESS, ASSISTANT_USERNAME, isAssistantAddress } from '@/lib/assistant';

/**
 * Where a person's profile lives.
 *
 * `/<username>` for everyone, with one exception: `/assistant` is the
 * Assistant page, so the @assistant account's own profile is opened by its
 * address. Without this, tapping the assistant's avatar or name opened the
 * chat page instead of its profile. Not `/@assistant`: the host bounces a
 * fresh load of an @ path between `/@x` and `/%40x`, so a reload or a shared
 * link could fail to open at all.
 */
export const ASSISTANT_PROFILE_PATH = `/app/profile?id=${ASSISTANT_ADDRESS}`;

export function isAssistantHandle(handleOrAddress?: string | null): boolean {
  if (!handleOrAddress) return false;
  const bare = String(handleOrAddress).trim().replace(/^@/, '');
  return bare.toLowerCase() === ASSISTANT_USERNAME || isAssistantAddress(bare);
}

export function profilePath(handleOrAddress?: string | null): string {
  if (isAssistantHandle(handleOrAddress)) return ASSISTANT_PROFILE_PATH;
  return `/${handleOrAddress}`;
}
