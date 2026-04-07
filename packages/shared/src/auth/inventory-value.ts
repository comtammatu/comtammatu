import type { StaffRole } from "./types";

/** Giá trị tồn kho — toàn hệ thống: Owner, Super Manager */
export function canViewInventoryValueSystem(role: StaffRole): boolean {
  return role === "owner" || role === "super_manager";
}

/** Theo khu vực: Owner, Super Manager, Area Manager */
export function canViewInventoryValueByArea(role: StaffRole): boolean {
  return (
    role === "owner" || role === "super_manager" || role === "area_manager"
  );
}

/** Theo chi nhánh: Owner, Super Manager, Area Manager, Manager (branch_manager) */
export function canViewInventoryValueByBranch(role: StaffRole): boolean {
  return (
    role === "owner" ||
    role === "super_manager" ||
    role === "area_manager" ||
    role === "branch_manager"
  );
}

export interface InventoryValueVisibility {
  system: boolean;
  area: boolean;
  branch: boolean;
}

export function getInventoryValueVisibility(
  role: StaffRole,
): InventoryValueVisibility {
  return {
    system: canViewInventoryValueSystem(role),
    area: canViewInventoryValueByArea(role),
    branch: canViewInventoryValueByBranch(role),
  };
}
