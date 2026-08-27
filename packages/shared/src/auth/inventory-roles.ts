import type { StaffRole } from "./types";

/**
 * Menu-recipe (BOM) writes keep the owner-only surface; the constant name
 * predates ADR 0045 and is still shared by recipe gates.
 */
export const INVENTORY_CATALOG_ROLES: readonly StaffRole[] = ["owner"];

/**
 * Ingredient catalog + units master writers (ADR 0045). Warehouse ops may
 * add/adjust ingredients and packaging units; RPC gate stays authoritative.
 */
export const INGREDIENT_CATALOG_WRITE_ROLES: readonly StaffRole[] = [
  "owner",
  "central_supply_ops",
];

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
  "central_kitchen_lead",
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
  return role === "central_supply_ops" || role === "central_kitchen_lead";
}

export function isProcurementBranchInScope(
  role: string,
  effectiveBranchId: number | null,
  targetBranchId: number,
): boolean {
  if (!isBranchScopedProcurementRole(role)) return true;
  return effectiveBranchId === targetBranchId;
}

/** Owner, accountant, and pinned central warehouse/kitchen may author POs. */
export const PO_CREATE_ROLES: readonly StaffRole[] = [
  "owner",
  "accountant",
  "central_supply_ops",
  "central_kitchen_lead",
] as const;

export const PO_REVIEW_ROLES: readonly StaffRole[] = [
  "owner",
  "accountant",
] as const;

export const PO_MUTATE_ROLES: readonly StaffRole[] = [
  "owner",
  "accountant",
  "central_supply_ops",
  "central_kitchen_lead",
] as const;

/**
 * Roles that can browse inventory across all branches (D058/ADR 0045/Kho Tổng).
 */
export const INVENTORY_TENANT_READ_ROLES: readonly StaffRole[] = [
  "owner",
  "self_service",
  "accountant",
  "central_supply_ops",
] as const;

/** Residual RPC/role gate; daily supplier-return UI retired (R08). BM stripped. */
export const SUPPLIER_RETURN_ROLES: readonly StaffRole[] = ["owner"];
