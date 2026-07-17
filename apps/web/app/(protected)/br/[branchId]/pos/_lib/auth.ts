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
  type JwtClaims,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/_lib/auth";
import type { ActionContext } from "@/_lib/with-action";

function branchIdFromInput(input?: unknown): number | null {
  const branchId =
    input !== null && typeof input === "object" && "branchId" in input
      ? input.branchId
      : undefined;
  return typeof branchId === "number" &&
    Number.isInteger(branchId) &&
    branchId > 0
    ? branchId
    : null;
}

function resolvePosPermission(
  roles: readonly StaffRole[],
  permission: string,
  input?: unknown,
) {
  return getAuthContextWithPermission(
    roles,
    permission,
    branchIdFromInput(input),
  );
}

export function isPosBranchInScope(
  claims: Pick<JwtClaims, "user_role" | "branch_id">,
  branchId: number,
): boolean {
  return claims.user_role === "owner" || claims.branch_id === branchId;
}

/**
 * POS operators allowed to void / cancel / reduce order flows. Mirrors
 * `MODULE_ACL.pos.allowedRoles` — kept as a named alias so refactoring the
 * role list in one place does not silently re-scope void/cancel beyond the
 * original intent.
 */
const POS_VOID_ROLES: readonly StaffRole[] = MODULE_ACL.pos.allowedRoles;

/**
 * `customAuth` resolver for POS void / cancel / reduce actions. Composite
 * gate: role ∈ POS_VOID_ROLES AND grant `pos:void_order`. Returns `null` on
 * either role mismatch or missing permission grant — wrapper translates
 * that to a `Không có quyền` ActionResult upstream, then the void
 * RPC's own server-side gate provides defense-in-depth (per the
 * POS-KDS-RPC-SERVER-SIDE-ROLE-GATE regression note).
 *
 * Used by `voidOrderItem`, `reduceOrderItemQuantity`, `cancelOrder`, and
 * `editPendingOrderItem`.
 *
 * Signature: receives parsed schema input when available. Branch-aware
 * actions probe their branch-scoped grant before the handler runs; ID-only
 * paths still rely on handler/RPC branch checks.
 */
export async function posVoidAuth(
  input?: unknown,
): Promise<ActionContext | null> {
  return resolvePosPermission(
    POS_VOID_ROLES,
    PERMISSION_KEYS.POS_VOID_ORDER,
    input,
  );
}

/** POS operators allowed to run day-to-day order lifecycle actions
 * (priority flags, table transfer, item served, cart submit). Same role list
 * as `POS_VOID_ROLES` today, but kept as a separate named alias so a
 * future split (e.g. removing chef from non-kitchen lifecycle actions)
 * can land without re-scoping void.
 */
const POS_USE_ROLES: readonly StaffRole[] = MODULE_ACL.pos.allowedRoles;

/**
 * `customAuth` resolver for POS lifecycle actions: composite gate
 * role ∈ POS_USE_ROLES AND grant `pos:use`. Used by
 * `setOrderPriority` / `setOrderItemPriority` /
 * `transferOrderTable` / `markOrderItemServed`
 * and any other lifecycle action that does NOT destroy revenue
 * (those keep `posVoidAuth`).
 */
export async function posUseAuth(
  input?: unknown,
): Promise<ActionContext | null> {
  return resolvePosPermission(POS_USE_ROLES, PERMISSION_KEYS.POS_USE, input);
}

/**
 * `customAuth` resolver for the cash confirm step. POS_CONFIRM_PAYMENT is
 * a tighter gate than POS_USE — staff with POS_USE + POS_PRINT but without POS_CONFIRM_PAYMENT can print
 * provisional bills but MUST NOT touch the cash drawer. Cashier and
 * branch_manager+ hold POS_CONFIRM_PAYMENT.
 *
 * VietQR paths keep `posUseAuth` instead because bank settlement does not
 * touch the physical cash drawer.
 */
export async function posConfirmPaymentAuth(
  input?: unknown,
): Promise<ActionContext | null> {
  return resolvePosPermission(
    POS_USE_ROLES,
    PERMISSION_KEYS.POS_CONFIRM_PAYMENT,
    input,
  );
}
