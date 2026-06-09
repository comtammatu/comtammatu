/**
 * RPC error → ActionResult mapper.
 *
 * Server Actions across POS / inventory / payment paths repeat the same
 * pattern: call `supabase.rpc("...")`, inspect `error.message`, lowercase it,
 * substring-match against a handful of known sentinels (`"forbidden"`,
 * `"voidable"`, `"tenant mismatch"`, ...), return a Vietnamese-localized
 * `ActionResult` with a stable `errorCode`. That mapping has been hand-rolled
 * in every action with subtle copy drift — 188 boilerplate signal sites in
 * `pos/order-actions.ts` alone before the action-helper split.
 *
 * This module holds the **mechanism**. Per-route message vocabularies live in
 * each route's `_lib/messages.ts` (e.g. `pos/_lib/messages.ts`,
 * `inventory/_lib/messages.ts`). Authors compose a `readonly RpcErrorMapping[]`
 * literal once and route every RPC error through `mapRpcError(...)`.
 *
 * Design constraints:
 *
 * - No DSL — mappings are plain object literals, each with a `match` predicate
 *   and a Vietnamese `userMessage`. Reviewers can read a mapping table at a
 *   glance.
 * - Stable `errorCode` is optional but recommended — clients that branch on
 *   failure class (`pos/_utils/error-codes.ts`) need a code, not a copy
 *   string. Vietnamese copy can drift; codes do not.
 * - First match wins. Order mappings from most-specific to least-specific.
 * - Fallback never throws. Unknown RPC errors degrade to the supplied
 *   fallback message so the UI always sees a user-safe string. NEVER return
 *   raw `error.message` (rules in `AGENTS.md`: "NEVER return raw Supabase /
 *   Postgres error.message to clients").
 */

import type { ActionResult } from "@comtammatu/shared/types";

/**
 * Single error → ActionResult rule.
 *
 * Predicates receive both the lowercased message and the original Postgres
 * `error.code` (`"42501"`, `"55P03"`, etc.) so mappings can branch on either
 * vector. Code-based mappings are common for advisory-lock contention
 * (`55P03`) and stale-grant `insufficient_privilege` (`42501`); message-based
 * mappings are the default for RPC-raised sentinels like `"forbidden"` or
 * `"voidable"`. Predicates may ignore either arg — JS narrower-arity allowed.
 *
 * @example
 *   { match: (m) => m.includes("forbidden"),
 *     errorCode: "pos.void.forbidden",
 *     userMessage: "Cần quyền hủy đơn POS để hủy món." }
 *
 * @example
 *   { match: (msg, code) => code === "55P03",
 *     errorCode: "db.lock_not_available",
 *     userMessage: "Đang có giao dịch khác. Vui lòng thử lại sau vài giây." }
 */
export interface RpcErrorMapping {
  /**
   * Predicate against the **lowercased** error message and the original
   * Postgres `error.code` (e.g. `"42501"`, `"55P03"`). `mapRpcError`
   * lowercases the message once upstream; `code` is passed through
   * unchanged. Either arg may be omitted by the predicate.
   */
  match: (lowerCasedMessage: string, code?: string) => boolean;
  /** Stable machine-readable code, e.g. `"pos.void.forbidden"`. */
  errorCode?: string;
  /** Vietnamese user-facing copy. */
  userMessage: string;
}

/**
 * Fallback for unmatched RPC errors. Authors override `fallback.userMessage`
 * per route (POS uses "Không thể hủy món. Vui lòng thử lại.", inventory uses
 * its own). The `errorCode` defaults to `"rpc_unknown"` so dashboards can
 * count the unmapped tail.
 */
export interface RpcErrorFallback {
  userMessage: string;
  errorCode?: string;
}

/**
 * Anything with a `.message` field — covers `PostgrestError`, generic `Error`,
 * and the bare `{ message: string }` shape that `supabase.rpc` returns. We
 * accept the loose type intentionally so call sites can pass `error` directly
 * without narrowing.
 */
export interface RpcErrorLike {
  message?: string | null;
  code?: string | null;
}

const DEFAULT_FALLBACK_CODE = "rpc_unknown";

/**
 * Map an RPC error to an `ActionResult<TData>` failure. Lowercases the message
 * once, runs mappings in order, returns the first hit; otherwise returns
 * `fallback`. Never returns `success: true` — this is a failure mapper, not a
 * passthrough. Generic `<TData>` is purely for type plumbing so callers that
 * declare `ActionResult<MyData>` keep their return type intact.
 *
 * @example
 *   if (error) return mapRpcError(error, posVoidMappings, posVoidFallback);
 */
export function mapRpcError<TData = unknown>(
  error: RpcErrorLike,
  mappings: readonly RpcErrorMapping[],
  fallback: RpcErrorFallback,
): ActionResult<TData> {
  const raw = error.message ?? "";
  const msg = raw.toLowerCase();
  const code = error.code ?? undefined;

  for (const mapping of mappings) {
    if (mapping.match(msg, code ?? undefined)) {
      return {
        success: false,
        error: mapping.userMessage,
        errorCode: mapping.errorCode,
      };
    }
  }

  return {
    success: false,
    error: fallback.userMessage,
    errorCode: fallback.errorCode ?? DEFAULT_FALLBACK_CODE,
  };
}

/**
 * Sugar for the common predicate. Use directly when a mapping is purely a
 * substring sentinel — keeps mapping tables readable without inline arrows.
 *
 * @example
 *   { match: includesAny("forbidden", "permission denied"), ... }
 */
export function includesAny(
  ...needles: readonly string[]
): (msg: string) => boolean {
  const lowered = needles.map((n) => n.toLowerCase());
  return (msg) => lowered.some((n) => msg.includes(n));
}
