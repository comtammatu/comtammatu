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

/** Counter roles that may print a provisional bill. Waiter (`branch_staff`) is excluded. */
export function canPrintProvisionalBill(role: StaffRole): boolean {
  return (
    role === "owner" || role === "branch_manager" || role === "cashier"
  );
}

/** Daily sales-limit editor on POS. Same roles as `branch_menu_limits`. */
export function canManagePosMenuLimits(role: StaffRole): boolean {
  return (MODULE_ACL.branch_menu_limits.allowedRoles as readonly StaffRole[]).includes(
    role,
  );
}

/** Item-level edits preserve the POS role surface; the permission grant and
 * RPC state/branch checks remain authoritative. */
const POS_ITEM_MUTATION_ROLES: readonly StaffRole[] =
  MODULE_ACL.pos.allowedRoles;

/** Whole-order cancellation remains a counter/manager operation. */
const POS_ORDER_CANCEL_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
  "cashier",
];

export function isPosOrderCancelRole(role: StaffRole): boolean {
  return POS_ORDER_CANCEL_ROLES.includes(role);
}

/**
 * Item-level mutation gate. Waiter (`branch_staff`) may edit a pending item,
 * reduce its quantity, or void it when granted `pos:void_order`.
 *
 * ID-only paths still rely on the RPC to resolve and enforce branch scope.
 */
export async function posItemMutationAuth(
  input?: unknown,
): Promise<ActionContext | null> {
  return resolvePosPermission(
    POS_ITEM_MUTATION_ROLES,
    PERMISSION_KEYS.POS_VOID_ORDER,
    input,
  );
}

/** Whole-order cancellation gate; waiter item authority does not widen it. */
export async function posOrderCancelAuth(
  input?: unknown,
): Promise<ActionContext | null> {
  return resolvePosPermission(
    POS_ORDER_CANCEL_ROLES,
    PERMISSION_KEYS.POS_VOID_ORDER,
    input,
  );
}

/** POS operators allowed to run day-to-day order lifecycle actions
 * (priority flags, table transfer, item served, cart submit). Kept separate
 * from item mutation authority so either policy can change independently.
 */
const POS_USE_ROLES: readonly StaffRole[] = MODULE_ACL.pos.allowedRoles;

/**
 * `customAuth` resolver for POS lifecycle actions: composite gate
 * role ∈ POS_USE_ROLES AND grant `pos:use`. Used by
 * `setOrderPriority` / `setOrderItemPriority` /
 * `transferOrderTable` / `markOrderItemServed`
 * and any other lifecycle action that does NOT destroy revenue.
 */
export async function posUseAuth(
  input?: unknown,
): Promise<ActionContext | null> {
  return resolvePosPermission(POS_USE_ROLES, PERMISSION_KEYS.POS_USE, input);
}

/**
 * `customAuth` resolver for the cash confirm step. POS_CONFIRM_PAYMENT is
 * a tighter gate than POS_USE — waiter (`branch_staff`) may confirm VietQR
 * but MUST NOT touch the cash drawer. Cashier and branch_manager+ hold
 * POS_CONFIRM_PAYMENT. Provisional print is a separate cashier-counter gate.
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
