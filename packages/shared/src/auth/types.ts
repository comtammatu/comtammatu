/**
 * Staff roles — ordered by privilege level (highest to lowest).
 *
 * HKD lean model: collapsed from the legacy 10-role tree to the 4 roles the
 * DB auth hook actually emits ({owner, manager, staff, chef} — see
 * `staff_role_from_position_code`). Position codes are still tracked in HR;
 * each maps to one of these four via `POSITION_CODE_TO_STAFF_ROLE`.
 */
export const STAFF_ROLES = [
  "owner",
  "manager",
  "staff",
  "chef",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles that can access /admin/ routes */
export const ADMIN_ROLES: readonly StaffRole[] = [
  "owner",
  "manager",
] as const;

/** Roles that operate at branch level (POS/KDS) */
export const BRANCH_ROLES: readonly StaffRole[] = [
  "staff",
  "chef",
] as const;

/** Roles that do not require branch scope */
export const TENANT_LEVEL_ROLES: readonly StaffRole[] = [
  "owner",
  "manager",
  "staff",
] as const;

/** Roles that managers can create/edit from the current staff screen */
export const MANAGEABLE_STAFF_ROLES: readonly StaffRole[] = [
  "manager",
  "staff",
  "chef",
] as const;

/**
 * Operational / floor roles that must belong to a store branch — not headquarters
 * (HQ is office-only: no POS/KDS).
 */
export const HQ_EXCLUDED_OPERATIONAL_ROLES: readonly StaffRole[] = [
  "staff",
  "chef",
  "manager",
] as const;

/**
 * Settings → Bàn, Trạm bếp (cấu hình sàn, không phải chiến lược chuỗi).
 * Owner không gồm — chủ sở hữu xem tổng thể vận hành; chi tiết sàn/bếp do quản lý điều hành.
 */
export const BRANCH_FLOOR_SETTINGS_ROLES: readonly StaffRole[] = [
  "manager",
] as const;

/** Settings → Bàn, trạm bếp (owner không tham gia) */
export function canManageBranchFloorSettings(role: StaffRole): boolean {
  return BRANCH_FLOOR_SETTINGS_ROLES.some((r) => r === role);
}

/** Vietnamese display labels for each role */
export const ROLE_LABEL_VI: Record<StaffRole, string> = {
  owner: "Chủ sở hữu",
  manager: "Quản lý",
  staff: "Nhân viên",
  chef: "Bếp",
};

/**
 * Canonical HR position code → StaffRole bucket. TS mirror of the SQL
 * `private.staff_role_from_position_code()` (HKD lean 4-role collapse).
 * Returns "unassigned" for unknown/missing codes (fail-safe).
 *
 * Mapping (locked, owner): owner→owner; super_manager, area_manager,
 * branch_manager→manager; office, cashier, waiter, warehouse_manager,
 * production_manager→staff (office→staff is anti-escalation); head_chef,
 * chef→chef.
 */
const POSITION_CODE_TO_STAFF_ROLE: Record<string, StaffRole> = {
  owner: "owner",
  super_manager: "manager",
  executive_assistant: "manager",
  area_manager: "manager",
  branch_manager: "manager",
  chief_accountant: "staff",
  accountant: "staff",
  office: "staff",
  warehouse_head: "staff",
  warehouse_keeper: "staff",
  head_chef: "chef",
  chef: "chef",
  kitchen_helper: "chef",
  cashier: "staff",
  waiter: "staff",
  warehouse_manager: "staff",
  production_manager: "staff",
};

export function staffRoleFromPositionCode(
  code: string | null | undefined,
): StaffRole | "unassigned" {
  if (!code) return "unassigned";
  return POSITION_CODE_TO_STAFF_ROLE[code] ?? "unassigned";
}

/** JWT custom claims injected by Supabase auth hook */
export interface JwtClaims {
  tenant_id: number;
  branch_id: number | null;
  user_role: StaffRole;
  /**
   * Canonical HR position code (source of truth). `user_role` is derived from
   * it via the role-bridge mapper (`staffRoleFromPositionCode` / the SQL twin).
   */
  position?: string;
}

/** Scope IDs extracted from URL or JWT */
export interface ScopeIds {
  tenantId: number;
  branchId: number | null;
}
