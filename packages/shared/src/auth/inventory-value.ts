import type { StaffRole } from "./types";

/** Giá trị tồn kho — toàn hệ thống: Owner */
function canViewInventoryValueSystem(role: StaffRole): boolean {
  return role === "owner";
}

/** Theo chi nhánh: Owner, Manager (branch_manager) */
function canViewInventoryValueByBranch(role: StaffRole): boolean {
  return role === "owner" || role === "branch_manager";
}

export interface InventoryValueVisibility {
  system: boolean;
  branch: boolean;
}

export function getInventoryValueVisibility(
  role: StaffRole,
): InventoryValueVisibility {
  return {
    system: canViewInventoryValueSystem(role),
    branch: canViewInventoryValueByBranch(role),
  };
}
