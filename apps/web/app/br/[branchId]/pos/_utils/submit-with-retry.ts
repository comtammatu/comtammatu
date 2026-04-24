import { submitOrder } from "../actions";
import type { CartSnapshot } from "../_providers/cart-store";

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
export const SUBMIT_RETRY_BACKOFF_MS = [0, 400, 1000] as const;

/**
 * Vietnamese substrings that indicate a NON-retryable submit error.
 * These are the short-circuit conditions — retrying them just burns
 * time and shows the cashier spinner longer for no benefit.
 *
 * KEEP IN SYNC with the error strings returned by
 *   `submitOrder()` in apps/web/app/br/[branchId]/pos/order-actions.ts
 *
 * Categories:
 *   - "Giỏ hàng"        : empty cart / invalid cart state
 *   - "không hợp lệ"     : Zod validation failure (invalid branch/session/etc.)
 *   - "quyền"            : permission denied
 *   - "Phiên đăng nhập"  : session expired / not authenticated
 *   - "chi nhánh"        : branch-id mismatch with JWT claim
 *
 * If the server action renames any of these strings, retry behavior
 * for that category silently regresses to "retry 3 times, then error" —
 * which burns ~1.4 s of cashier time before the real error surfaces.
 * Long-term fix: use explicit error codes on the server side, not
 * substring matching. Deferred.
 */
const NON_RETRYABLE_ERROR_SUBSTRINGS: readonly string[] = [
  "Giỏ hàng",
  "không hợp lệ",
  "quyền",
  "Phiên đăng nhập",
  "chi nhánh",
];

/** Testable predicate. Pure — no side effects. */
export function isNonRetryableSubmitError(error: string): boolean {
  return NON_RETRYABLE_ERROR_SUBSTRINGS.some((substring) =>
    error.includes(substring),
  );
}

export interface SubmitPosOrderArgs {
  branchId: number;
  sessionId: number;
  cartSnapshot: CartSnapshot;
  tableId?: number | null;
}

type SubmitResult = Awaited<ReturnType<typeof submitOrder>>;

/**
 * Idempotent POS submit with short retry window.
 *
 * - Generates ONE UUID per call and reuses it across all retry attempts
 *   so a dropped response on attempt N is safely deduped by the server
 *   on attempt N+1 via `orders.idempotency_key`.
 * - Walks SUBMIT_RETRY_BACKOFF_MS, sleeping between attempts.
 * - Breaks early on non-retryable errors (see isNonRetryableSubmitError).
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
  };

  for (const delay of SUBMIT_RETRY_BACKOFF_MS) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    result = await submitOrder(
      args.branchId,
      {
        items: args.cartSnapshot.items,
        order_type: args.cartSnapshot.orderType,
        table_id: args.tableId ?? undefined,
        note: args.cartSnapshot.note.trim() || undefined,
      },
      args.sessionId,
      idempotencyKey,
    );
    if (result.success) break;
    if (isNonRetryableSubmitError(result.error ?? "")) break;
  }

  return result;
}
