/**
 * Shared logging policy for OAuth token-refresh failures.
 *
 * A refresh failure is a normal, gracefully-handled lifecycle event: the
 * caller returns null and the UI prompts the user to sign in again. It is
 * therefore never a program "error" and must not be logged via console.error
 * (which the diagnostics service captures as a red ERROR event — see
 * diagnosticsService.installConsoleCapture).
 *
 *  - Expected expiry (token revoked / 401 / 403 / invalid_grant): the everyday
 *    "your session ended, log in again" case → console.debug (not captured).
 *  - Anything else (network error, 5xx, malformed response): still worth a
 *    breadcrumb but not a failure of our program → console.warn.
 */

const EXPECTED_AUTH_EXPIRY_RE =
  /(refresh revoked|invalid_grant|\b401\b|\b403\b|unauthorized|forbidden)/i

export function isExpectedAuthRefreshFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return EXPECTED_AUTH_EXPIRY_RE.test(message)
}

export function logTokenRefreshFailure(serviceLabel: string, error: unknown): void {
  const message = error instanceof Error ? error.message : error
  if (isExpectedAuthRefreshFailure(error)) {
    // Expected: token expired/revoked. Quiet — the user just needs to re-auth.
    console.debug(`${serviceLabel} token refresh failed (expected, re-auth required):`, message)
    return
  }
  console.warn(`${serviceLabel} token refresh failed:`, message)
}
