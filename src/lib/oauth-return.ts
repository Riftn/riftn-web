export const SOCIAL_OAUTH_PENDING_KEY = 'dehub_social_oauth_pending';

export function hasOAuthSessionCallback(search: string, hash: string): boolean {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.slice(1));
  if ([query, fragment].some((params) =>
    params.has('error') || params.has('error_code') || params.has('error_description'),
  )) return false;

  return [query, fragment].some((params) =>
    !!params.get('access_token') && !!params.get('refresh_token'),
  );
}

// Capture the incoming URL before Supabase consumes the callback parameters.
export const oauthSessionCallbackAtLoad = typeof window !== 'undefined' &&
  hasOAuthSessionCallback(window.location.search, window.location.hash);
