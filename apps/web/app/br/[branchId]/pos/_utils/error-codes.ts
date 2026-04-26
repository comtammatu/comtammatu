/**
 * POS Server Action error codes.
 *
 * Stable machine-readable identifiers for failure classes. Set on
 * `ActionResult.errorCode` alongside the human-readable `error` string.
 * Clients that branch on failure type (retry-vs-fail, alternate UI flow)
 * MUST check `errorCode` — substring matches against the Vietnamese
 * `error` string break silently when copy is reworded.
 *
 * Categories:
 *   - INPUT_*: Zod validation / shape errors. Non-retryable.
 *   - AUTH_*:  Authn/authz failures. Non-retryable until re-login.
 *   - SCOPE_*: Branch / session / scope mismatches. Non-retryable.
 *   - CART_*:  Cart-state errors. Non-retryable (user must fix cart).
 *   - DB_*:    Database-side failures. Some are retryable (lock contention).
 *   - RPC_*:   Generic RPC failure not otherwise classified. Retryable.
 *
 * When adding a new code:
 *   1. Add to this map
 *   2. Pick the right family (INPUT/AUTH/SCOPE/CART/DB/RPC)
 *   3. Update `RETRYABLE_POS_ERROR_CODES` if the new failure should retry
 */
export const POS_ERROR_CODES = {
  INPUT_INVALID_BRANCH: "INPUT_INVALID_BRANCH",
  INPUT_INVALID_CART: "INPUT_INVALID_CART",
  INPUT_INVALID_SESSION: "INPUT_INVALID_SESSION",
  INPUT_INVALID_IDEMPOTENCY: "INPUT_INVALID_IDEMPOTENCY",
  INPUT_INVALID_DISCOUNT: "INPUT_INVALID_DISCOUNT",
  INPUT_INVALID_SPLIT: "INPUT_INVALID_SPLIT",
  INPUT_INVALID_MERGE: "INPUT_INVALID_MERGE",

  AUTH_NO_PERMISSION: "AUTH_NO_PERMISSION",
  AUTH_SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",

  SCOPE_BRANCH_MISMATCH: "SCOPE_BRANCH_MISMATCH",

  CART_EMPTY: "CART_EMPTY",

  DB_PERMISSION_DENIED: "DB_PERMISSION_DENIED",
  DB_LOCK_NOT_AVAILABLE: "DB_LOCK_NOT_AVAILABLE",

  RPC_GENERIC: "RPC_GENERIC",
} as const;

export type PosErrorCode =
  (typeof POS_ERROR_CODES)[keyof typeof POS_ERROR_CODES];

/**
 * Codes that justify a retry in `submitPosOrderWithRetry`. Anything else
 * short-circuits the retry loop — re-trying a permission-denied or
 * empty-cart error just burns time.
 *
 * Currently retryable:
 *   - DB_LOCK_NOT_AVAILABLE — pg advisory lock contention, transient
 *   - RPC_GENERIC — uncategorized RPC failure (could be network)
 */
export const RETRYABLE_POS_ERROR_CODES: ReadonlySet<PosErrorCode> = new Set([
  POS_ERROR_CODES.DB_LOCK_NOT_AVAILABLE,
  POS_ERROR_CODES.RPC_GENERIC,
]);

export function isRetryablePosErrorCode(
  code: string | undefined,
): code is PosErrorCode {
  if (code === undefined) return false;
  return RETRYABLE_POS_ERROR_CODES.has(code as PosErrorCode);
}
