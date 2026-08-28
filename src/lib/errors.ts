import { supabase } from './supabaseClient';

// Auth/session errors that a single silent session refresh + one retry can
// clear on their own. The one a tester actually hit on the Today page was
// "JWT issued at future" — device clock skew: the phone's clock ran ahead of
// Supabase's server, so the freshly-minted access token's `iat` looked like it
// was in the future and PostgREST/GoTrue rejected it. refreshSession() re-mints
// the token against the server, and the retry succeeds. See DECISIONS.md D-026.
const RECOVERABLE_AUTH_ERROR =
  /\bjwt\b|issued at future|bad_jwt|token (?:expired|used before issued)|jwt expired|invalid claim/i;

export function isRecoverableAuthError(e: unknown): boolean {
  return RECOVERABLE_AUTH_ERROR.test((e as Error)?.message ?? '');
}

// Run `fn`; if it fails with a recoverable auth error, refresh the session once
// and run `fn` again. A second failure (or any non-auth error) bubbles to the
// caller's own catch, where toDisplayError() turns it into something readable.
//
// Only wrap idempotent reads in this. A write retried after a response-level
// failure could double-apply if the first attempt reached the server.
export async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isRecoverableAuthError(e)) throw e;
    await supabase.auth.refreshSession();
    return fn();
  }
}

// Message to show the user for a caught error. Known auth/session failures get a
// plain-language line pointing at the actual cause (device clock / stale
// session); everything else falls through to its own message unchanged.
export function toDisplayError(e: unknown): string {
  if (isRecoverableAuthError(e)) {
    return 'Your session went out of sync — check your device’s date & time is set to update automatically, then reload.';
  }
  return (e as Error)?.message ?? 'Something went wrong.';
}
