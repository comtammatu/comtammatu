/**
 * Staff roles — ordered by privilege level (highest to lowest).
 * Customer role is handled by Flutter app only.
 */
export const STAFF_ROLES = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "cashier",
  "waiter",
  "chef",
  "office",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles that can access /admin/ routes */
export const ADMIN_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
] as const;

/** Roles that operate at branch level (POS/KDS) */
export const BRANCH_ROLES: readonly StaffRole[] = [
  "cashier",
  "waiter",
  "chef",
] as const;

/** Roles that do not require branch scope */
export const TENANT_LEVEL_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "office",
] as const;

/** Roles that managers can create/edit from the current staff screen */
export const MANAGEABLE_STAFF_ROLES: readonly StaffRole[] = [
  "area_manager",
  "branch_manager",
  "cashier",
  "waiter",
  "chef",
  "office",
] as const;

/**
 * Operational / floor roles that must belong to a store branch — not headquarters
 * (HQ is office-only: no POS/KDS).
 */
export const HQ_EXCLUDED_OPERATIONAL_ROLES: readonly StaffRole[] = [
  "cashier",
  "waiter",
  "chef",
  "branch_manager",
] as const;

/**
 * Settings → Bàn, Trạm bếp (cấu hình sàn, không phải chiến lược chuỗi).
 * Owner không gồm — chủ sở hữu xem tổng thể vận hành; chi tiết sàn/bếp do quản lý điều hành.
 */
export const BRANCH_FLOOR_SETTINGS_ROLES: readonly StaffRole[] = [
  "super_manager",
  "area_manager",
  "branch_manager",
] as const;

/** Settings → Bàn, trạm bếp (owner không tham gia) */
export function canManageBranchFloorSettings(role: StaffRole): boolean {
  return BRANCH_FLOOR_SETTINGS_ROLES.some((r) => r === role);
}

/** Vietnamese display labels for each role */
export const ROLE_LABEL_VI: Record<StaffRole, string> = {
  owner: "Chủ sở hữu",
  super_manager: "Quản lý tổng",
  area_manager: "Quản lý khu vực",
  branch_manager: "Quản lý chi nhánh",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  chef: "Bếp",
  office: "Văn phòng",
};

/** JWT custom claims injected by Supabase auth hook */
export interface JwtClaims {
  tenant_id: number;
  branch_id: number | null;
  area_id: number | null;
  user_role: StaffRole;
}

/** Scope IDs extracted from URL or JWT */
export interface ScopeIds {
  tenantId: number;
  branchId: number | null;
}
