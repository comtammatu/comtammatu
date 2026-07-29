import type { StaffRole } from "./types";

/** CRUD danh mục nguyên liệu + allowlist chi nhánh */
export const INVENTORY_CATALOG_ROLES: readonly StaffRole[] = ["owner"];

/**
 * Read-only ingredient catalog on `/inventory/ingredients`.
 * Central ops may browse; mutations stay on INVENTORY_CATALOG_ROLES.
 */
export const INVENTORY_CATALOG_VIEW_ROLES: readonly StaffRole[] = [
  "owner",
  "central_supply_ops",
  "central_kitchen_lead",
];

/** Tồn kho, luân chuyển, điều chỉnh tồn theo chi nhánh */
export const INVENTORY_OPS_ROLES: readonly StaffRole[] = [
  "owner",
  "central_supply_ops",
  "central_kitchen_lead",
  "branch_manager",
];

/**
 * Coarse route/action gate for GRN + shared procurement reads + suppliers.
 * D093: branch_manager is NOT a procurement writer (no branch GRN). Accountant
 * keeps the GRN-read + PO slice; central roles draft/confirm GRN at pinned site.
 */
export const PROCUREMENT_ROLES: readonly StaffRole[] = [
  "owner",
  "accountant",
  "central_supply_ops",
  "central_kitchen_lead",
];

/**
 * Branch stock-request actors (D093). Distinct from procurement/GRN.
 */
export const STOCK_REQUEST_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
] as const;

export const STOCK_REQUEST_FULFILL_ROLES: readonly StaffRole[] = [
  "owner",
  "central_supply_ops",
  "central_kitchen_lead",
] as const;

/**
 * Procurement roles whose write scope is a single pinned branch/site. Their
 * claims carry a non-null `branch_id`, so the caller compares
 * `effectiveBranchId === targetBranchId` for strict own-branch writes.
 */
export function isBranchScopedProcurementRole(role: string): boolean {
  return (
    role === "central_supply_ops" || role === "central_kitchen_lead"
  );
}

export function isProcurementBranchInScope(
  role: string,
  effectiveBranchId: number | null,
  targetBranchId: number,
): boolean {
  if (!isBranchScopedProcurementRole(role)) return true;
  return effectiveBranchId === targetBranchId;
}

/**
 * Roles allowed to create/approve purchase orders (D091/D093).
 */
export const PO_MUTATE_ROLES: readonly StaffRole[] = [
  "owner",
  "accountant",
] as const;

export const SUPPLIER_RETURN_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
];
