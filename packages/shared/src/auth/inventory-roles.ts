import type { StaffRole } from "./types";

/** CRUD danh mục nguyên liệu + allowlist chi nhánh */
export const INVENTORY_CATALOG_ROLES: readonly StaffRole[] = ["owner"];

/** Tồn kho, luân chuyển, điều chỉnh tồn theo chi nhánh */
export const INVENTORY_OPS_ROLES: readonly StaffRole[] = [
  "owner",
  "central_supply_ops",
  "central_kitchen_lead",
  "branch_manager",
];

/**
 * Coarse route/action gate for GRN + shared procurement reads + suppliers.
 * `branch_manager` is admitted (D091) so a branch can receive directly from a
 * supplier; the fine differentiation is the per-action permission key + grant
 * (branch_manager holds GRN/supplier/production keys, never recipe/invoice/PO).
 * D076 adapters remain temporary until ADR 0015; D091 gives the accountant a
 * GRN/PO slice and central roles their site-scoped Inventory jobs
 * (GRN draft/confirm; no PO mutate via grants). Owner remains tenant-wide via
 * `has_permission` / `auth_is_owner` and may procure for `branch`,
 * `central_supply`, and `central_kitchen` destinations (D091).
 */
export const PROCUREMENT_ROLES: readonly StaffRole[] = [
  "owner",
  "accountant",
  "central_supply_ops",
  "central_kitchen_lead",
  "branch_manager",
];

/**
 * Procurement roles whose write scope is a single pinned branch/site. Their
 * claims carry a non-null `branch_id`, so the caller compares
 * `effectiveBranchId === targetBranchId` for strict own-branch writes. Shared
 * by GRN actions (one copy — no MIRROR drift). Roles NOT listed here (e.g.
 * owner, accountant) are tenant-wide and bypass the equality check.
 */
export function isBranchScopedProcurementRole(role: string): boolean {
  return (
    role === "branch_manager" ||
    role === "central_supply_ops" ||
    role === "central_kitchen_lead"
  );
}

/**
 * Pure own-branch decision for a procurement write (D091 cross-branch guard).
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

/**
 * Roles allowed to create/approve purchase orders (D091).
 * Central warehouse roles and branch_manager are intentionally excluded —
 * they draft GRN only; accountant|owner own the PO slice.
 */
export const PO_MUTATE_ROLES: readonly StaffRole[] = [
  "owner",
  "accountant",
] as const;

export const SUPPLIER_RETURN_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];
