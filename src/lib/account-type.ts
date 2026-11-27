/**
 * Personal, Creator or Business — the account type a person picks in
 * Settings, Instagram/X style. Stored in the profile's `customs` blob, so it
 * needs no server change and travels with every profile read:
 *
 *   customs.accountType      'creator' | 'business' (absent = personal)
 *   customs.accountCategory  one of ACCOUNT_CATEGORIES ids, shown under the name
 *   customs.contactEmail     business only, behind the profile's Contact button
 *
 * Nothing is locked away from Personal accounts: this is a label and a
 * contact door, not a paywall. Same shape in dehub-mobile (libs/account-type.ts).
 */
export type AccountType = 'personal' | 'creator' | 'business';

export const CREATOR_CATEGORIES = [
  'artist', 'musician', 'gamer', 'streamer', 'writer', 'podcaster', 'educator',
  'athlete', 'photographer', 'video_creator', 'comedian', 'developer', 'public_figure', 'other',
] as const;

export const BUSINESS_CATEGORIES = [
  'brand', 'shop', 'restaurant', 'cafe', 'agency', 'community', 'media',
  'app', 'project', 'nonprofit', 'local_business', 'other',
] as const;

export function readAccountType(customs: Record<string, unknown> | null | undefined): AccountType {
  const type = customs?.accountType;
  return type === 'creator' || type === 'business' ? type : 'personal';
}

export function readAccountCategory(customs: Record<string, unknown> | null | undefined): string | null {
  const type = readAccountType(customs);
  if (type === 'personal') return null;
  const id = customs?.accountCategory;
  const list: readonly string[] = type === 'creator' ? CREATOR_CATEGORIES : BUSINESS_CATEGORIES;
  return typeof id === 'string' && list.includes(id) ? id : null;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** A business's public contact email, or null. */
export function readContactEmail(customs: Record<string, unknown> | null | undefined): string | null {
  if (readAccountType(customs) !== 'business') return null;
  const email = customs?.contactEmail;
  return typeof email === 'string' && EMAIL.test(email.trim()) ? email.trim() : null;
}

export function isValidContactEmail(value: string): boolean {
  return !value.trim() || EMAIL.test(value.trim());
}
