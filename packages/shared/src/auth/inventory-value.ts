import type { StaffRole } from "./types";

/** Giá trị tồn kho — toàn hệ thống: Owner, Manager */
export function canViewInventoryValueSystem(role: StaffRole): boolean {
  return role === "owner" || role === "manager";
}

/**
 * Theo khu vực: Owner, Manager.
 * (HKD lean: vùng/khu vực đã gỡ — quản lý xem toàn hệ thống.)
 */
export function canViewInventoryValueByArea(role: StaffRole): boolean {
  return role === "owner" || role === "manager";
}

/** Theo chi nhánh: Owner, Manager */
export function canViewInventoryValueByBranch(role: StaffRole): boolean {
  return role === "owner" || role === "manager";
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
