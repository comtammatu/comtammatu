import type { StaffRole } from "@comtammatu/shared/auth";

/** All role labels (for display) */
export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Chủ sở hữu",
  super_manager: "Quản lý cấp cao",
  area_manager: "Quản lý khu vực",
  branch_manager: "Quản lý chi nhánh",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  chef: "Bếp",
  office: "Văn phòng",
};

/** Roles manageable via staff page (excludes owner/super_manager) */
export const MANAGEABLE_ROLES: Partial<Record<StaffRole, string>> = {
  area_manager: "Quản lý khu vực",
  branch_manager: "Quản lý chi nhánh",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  chef: "Bếp",
  office: "Văn phòng",
};

/** Roles that are tenant-level (no branch required) */
export const TENANT_LEVEL_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "office",
];
