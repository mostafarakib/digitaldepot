/**
 * Canonical OAuth provider identifier for Google, matching Phase 3E-1 database records and tests.
 */
export const OAUTH_PROVIDER_GOOGLE = 'GOOGLE' as const;

/**
 * Recent authentication freshness window: 15 minutes in milliseconds.
 */
export const RECENT_AUTH_WINDOW_MS = 15 * 60 * 1000; // 900,000 ms

/**
 * Clock skew tolerance: up to 60 seconds into the future in milliseconds.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000; // 60,000 ms

/**
 * Default return URL for authenticated account OAuth actions.
 */
export const DEFAULT_OAUTH_RETURN_URL = '/account/security';

/**
 * Evaluates whether an authentication timestamp is within the active freshness window.
 *
 * Exact Mathematical Contract:
 * - null, undefined: false
 * - non-finite / invalid timestamp: false
 * - elapsedMs < -60,000 (more than 60s in future): false (rejected)
 * - elapsedMs === -60,000 (exactly 60s in future): true (clock skew boundary)
 * - -60,000 <= elapsedMs <= 900,000: true (fresh)
 * - elapsedMs === 900,000 (exactly 15m old): true (fresh boundary)
 * - elapsedMs > 900,000 (more than 15m old): false (stale)
 */
export function isAuthenticationFresh(
  reauthenticatedAt: Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!reauthenticatedAt) {
    return false;
  }

  const timestamp =
    reauthenticatedAt instanceof Date
      ? reauthenticatedAt.getTime()
      : new Date(reauthenticatedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const elapsedMs = now - timestamp;

  // Stale if more than 60 seconds in the future
  if (elapsedMs < -CLOCK_SKEW_TOLERANCE_MS) {
    return false;
  }

  // Stale if older than 15 minutes
  if (elapsedMs > RECENT_AUTH_WINDOW_MS) {
    return false;
  }

  return true;
}
