import { submitOrder } from "../actions";
import type { CartSnapshot } from "../_providers/cart-store";
import { POS_ERROR_CODES, isRetryablePosErrorCode } from "./error-codes";
import { buildSubmitOrderCart } from "./submit-payload";

/**
 * Retry schedule for the POS submit round-trip.
 *
 * Total wall-budget: 1.4 s across 3 attempts (0 ms, +400 ms, +1000 ms).
 * Tuned for flaky branch Wi-Fi: a typical dropped-response round-trip
 * recovers within the second attempt; the third is a last-chance safety
 * net before we surface the error to the cashier.
 *
 * The server dedupes same-key retries via `orders.idempotency_key`
 * (see migration 20260408100000_pos_order_counter_idempotency.sql).
 */
const SUBMIT_RETRY_BACKOFF_MS = [0, 400, 1000] as const;

/**
 * Vietnamese substrings that indicate a NON-retryable submit error.
 * KEPT AS A FALLBACK ONLY — the primary check is `errorCode` from
 * `submitOrder` (typed via `POS_ERROR_CODES`). The substring list
 * still catches:
 *   - Pre-`errorCode` callers that haven't been migrated
 *   - Errors thrown outside `submitOrder` (e.g. action wrapper)
 *   - Defensive coverage if a code is forgotten
 *
 * If the server action renames any of these strings AND the corresponding
 * `errorCode` is also missing, retry behavior for that category silently
 * regresses to "retry 3 times, then error" — which burns ~1.4 s of
 * cashier time. The errorCode path is the durable contract.
 */
const NON_RETRYABLE_ERROR_SUBSTRINGS: readonly string[] = [
  "Giỏ hàng",
  "không hợp lệ",
  "quyền",
  "Phiên đăng nhập",
  "chi nhánh",
];

/**
 * Decide if a failed submit attempt is worth retrying.
 *
 * Decision order:
 *   1. If `errorCode` is set, branch on that — stable contract.
 *   2. Otherwise fall back to substring matching against `error`.
 *
 * Pure — no side effects.
 */
function shouldRetrySubmit(
  errorCode: string | undefined,
  error: string | undefined,
): boolean {
  // Path 1 (preferred): explicit machine-readable code.
  if (errorCode !== undefined) {
    return isRetryablePosErrorCode(errorCode);
  }
  // Path 2 (fallback): substring match against the error message.
  if (error === undefined) return false;
  return !NON_RETRYABLE_ERROR_SUBSTRINGS.some((substring) =>
    error.includes(substring),
  );
}

export interface SubmitPosOrderArgs {
  branchId: number;
  sessionId: number;
  cartSnapshot: CartSnapshot;
  tableId?: number | null;
  isPriority?: boolean;
  dailyLimitHoldToken?: string;
}

type SubmitResult = Awaited<ReturnType<typeof submitOrder>>;

/**
 * Idempotent POS submit with short retry window.
 *
 * - Generates ONE UUID per call and reuses it across all retry attempts
 *   so a dropped response on attempt N is safely deduped by the server
 *   on attempt N+1 via `orders.idempotency_key`.
 * - Walks SUBMIT_RETRY_BACKOFF_MS, sleeping between attempts.
 * - Breaks early on non-retryable errors (see shouldRetrySubmit).
 * - Never throws. The returned ActionResult surfaces the final outcome;
 *   callers own toast / UI orchestration.
 */
export async function submitPosOrderWithRetry(
  args: SubmitPosOrderArgs,
): Promise<SubmitResult> {
  const idempotencyKey = crypto.randomUUID();

  let result: SubmitResult = {
    success: false,
    error: "Không thể tạo đơn hàng",
    errorCode: POS_ERROR_CODES.RPC_GENERIC,
  };

  for (const delay of SUBMIT_RETRY_BACKOFF_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    result = await submitOrder(
      args.branchId,
      buildSubmitOrderCart(args),
      args.sessionId,
      idempotencyKey,
      args.dailyLimitHoldToken,
    );
    if (result.success) break;
    if (!shouldRetrySubmit(result.errorCode, result.error)) break;
  }

  return result;
}
