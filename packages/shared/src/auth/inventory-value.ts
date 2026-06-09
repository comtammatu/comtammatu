import type { StaffRole } from "./types";

/** Giá trị tồn kho — toàn hệ thống: Owner, Super Manager */
export function canViewInventoryValueSystem(role: StaffRole): boolean {
  return role === "owner" || role === "super_manager";
}

/** Theo chi nhánh: Owner, Super Manager, Manager (branch_manager) */
export function canViewInventoryValueByBranch(role: StaffRole): boolean {
  return (
    role === "owner" ||
    role === "super_manager" ||
    role === "branch_manager"
  );
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
