import type { StaffRole } from "./types";

/** CRUD danh mục nguyên liệu + allowlist chi nhánh */
export const INVENTORY_CATALOG_ROLES: readonly StaffRole[] = ["owner"];

/** Tồn kho, luân chuyển, điều chỉnh tồn theo chi nhánh */
export const INVENTORY_OPS_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

/**
 * Coarse route/action gate for GRN + shared procurement reads + suppliers.
 * `branch_manager` is admitted (D068) so a branch can receive directly from a
 * supplier; the fine differentiation is the per-action permission key + grant
 * (branch_manager holds GRN/supplier/production keys, never recipe/invoice).
 */
export const PROCUREMENT_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];

/**
 * Procurement roles whose write scope is a single pinned branch. Their claims
 * carry a non-null `branch_id`, so the caller compares
 * `effectiveBranchId === targetBranchId` for strict own-branch writes. Shared
 * by GRN actions (one copy — no MIRROR drift). Roles NOT listed here (e.g.
 * owner) are tenant-wide and bypass the equality check.
 */
export function isBranchScopedProcurementRole(role: string): boolean {
  return role === "branch_manager";
}

/**
 * Pure own-branch decision for a procurement write (D068 cross-branch guard).
 * `effectiveBranchId` is the actor's own operable branch — their non-null claim
 * for a pinned role. A branch-scoped role may write only that branch; a
 * non-scoped role (owner) is tenant-wide. The real guard
 * (`canAccessProcurementBranch`) calls this so the decision body itself — not a
 * reconstruction — is unit-tested.
 */
export function isProcurementBranchInScope(
  role: string,
  effectiveBranchId: number | null,
  targetBranchId: number,
): boolean {
  if (!isBranchScopedProcurementRole(role)) return true;
  return effectiveBranchId === targetBranchId;
}

/** Phiếu trả NCC + credit notes. */
export const SUPPLIER_RETURN_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];
