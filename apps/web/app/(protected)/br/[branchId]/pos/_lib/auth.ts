/**
 * POS-specific auth resolvers.
 *
 * Re-exports the canonical auth helpers from `apps/web/app/_lib/auth.ts` so
 * route-local code can import everything from one place. Adds POS-specific
 * `customAuth` resolvers for `withActionPositional` / `withAction` calls
 * whose composite gate (role list × permission key) cannot be expressed
 * through the standard `roles + permission` option fields alone.
 *
 * Pattern mirrors `inventory/_lib/auth.ts`.
 */

import {
  MODULE_ACL,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/_lib/auth";
import type { ActionContext } from "@/_lib/with-action";

// Re-exports — keep route-local imports tidy.
export {
  getAuthContext,
  getAuthContextWithAnyPermission,
  getAuthContextWithPermission,
} from "@/_lib/auth";

/**
 * POS operators allowed to void / cancel / reduce order flows. Mirrors
 * `MODULE_ACL.pos.allowedRoles` — kept as a named alias so refactoring the
 * role list in one place does not silently re-scope void/cancel beyond the
 * original intent. WS-1b will dedupe the local `POS_VOID_ROLES` constant
 * still living inside `order-actions.ts` against this one.
 */
export const POS_VOID_ROLES: readonly StaffRole[] = MODULE_ACL.pos.allowedRoles;

/**
 * `customAuth` resolver for POS void / cancel / reduce actions. Composite
 * gate: role ∈ POS_VOID_ROLES AND grant `pos:void_order`. Returns `null` on
 * either role mismatch or missing permission grant — wrapper translates
 * that to a `Không có quyền` ActionResult upstream, then the void
 * RPC's own server-side gate provides defense-in-depth (per the
 * POS-KDS-RPC-SERVER-SIDE-ROLE-GATE regression note).
 *
 * Used by `voidOrderItem` (WS-1a) and `reduceOrderItemQuantity` /
 * `cancelOrder` / `editPendingOrderItem` (WS-1b batch 1). WS-1b batch 2+
 * will reuse for any future void path.
 *
 * Signature: accepts but ignores the schema input. `withActionPositional`
 * passes the parsed input to every `customAuth` callable; resolvers that
 * do not need it can declare zero-arity (TS allows narrower-arity).
 */
export async function posVoidAuth(): Promise<ActionContext | null> {
  return getAuthContextWithPermission(
    POS_VOID_ROLES,
    PERMISSION_KEYS.POS_VOID_ORDER,
  );
}

/** POS operators allowed to run day-to-day order lifecycle actions
 * (priority flags, table transfer, served, cart submit). Same role list
 * as `POS_VOID_ROLES` today, but kept as a separate named alias so a
 * future split (e.g. removing chef from non-kitchen lifecycle actions)
 * can land without re-scoping void.
 */
export const POS_USE_ROLES: readonly StaffRole[] = MODULE_ACL.pos.allowedRoles;

/**
 * `customAuth` resolver for POS lifecycle actions: composite gate
 * role ∈ POS_USE_ROLES AND grant `pos:use`. Used by
 * `setOrderPriority` / `setOrderItemPriority` /
 * `transferOrderTable` / `updateOrderStatus` / `markOrderItemServed`
 * and any other lifecycle action that does NOT destroy revenue
 * (those keep `posVoidAuth`).
 */
export async function posUseAuth(): Promise<ActionContext | null> {
  return getAuthContextWithPermission(POS_USE_ROLES, PERMISSION_KEYS.POS_USE);
}
