/**
 * Purchase-price / inventory-value visibility (D088).
 * Branch managers must not see purchase unit costs or chain PO prices.
 * Temporary capability until ADR 0015 price-read grants.
 */

import type { StaffRole } from "./types";

export type InventoryValueVisibility = {
  system: boolean;
  branch: boolean;
};

/** Giá trị tồn kho — toàn hệ thống: Owner */
function canViewInventoryValueSystem(role: StaffRole): boolean {
  return role === "owner";
}

/**
 * Branch valuation / WAC for management analytics.
 * D088: branch_manager does not see purchase-price-derived value.
 */
function canViewInventoryValueByBranch(role: StaffRole): boolean {
  return role === "owner" || role === "accountant";
}

export function getInventoryValueVisibility(
  role: StaffRole,
): InventoryValueVisibility {
  return {
    system: canViewInventoryValueSystem(role),
    branch: canViewInventoryValueByBranch(role),
  };
}

/**
 * Whether the role may read purchase unit costs / PO estimated prices
 * in UI payloads (not CSS hide). Owner + accountant + central ops (need
 * costs to draft GRN); branch_manager denied.
 */
export function canViewPurchasePrice(role: StaffRole): boolean {
  return (
    role === "owner" ||
    role === "accountant" ||
    role === "central_supply_ops" ||
    role === "central_kitchen_lead"
  );
}
