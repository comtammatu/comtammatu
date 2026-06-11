/**
 * Access buckets — ordered by privilege level (highest to lowest).
 * These are compatibility auth buckets, not mutable HR position labels.
 * Customer role is handled by Flutter app only.
 */
export const ACCESS_BUCKETS = [
  "owner",
  "super_manager",
  "branch_manager",
  "warehouse_manager",
  "production_manager",
  "cashier",
  "waiter",
  "chef",
  "office",
] as const;

export type AccessBucket = (typeof ACCESS_BUCKETS)[number];

/** Compatibility alias while app code moves from StaffRole to AccessBucket. */
export const STAFF_ROLES = ACCESS_BUCKETS;
export type StaffRole = AccessBucket;

/** Roles that can access /admin/ routes */
export const ADMIN_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
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
  "office",
] as const;

/** Roles that managers can create/edit from the current staff screen */
export const MANAGEABLE_STAFF_ROLES: readonly StaffRole[] = [
  "branch_manager",
  "warehouse_manager",
  "production_manager",
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
  "branch_manager",
] as const;

/** Settings → Bàn, trạm bếp (owner không tham gia) */
export function canManageBranchFloorSettings(role: StaffRole): boolean {
  return BRANCH_FLOOR_SETTINGS_ROLES.some((r) => r === role);
}

/**
 * Vietnamese labels for compatibility access buckets.
 * Staff/HR UI should display `positions.label_vi` instead.
 */
export const ROLE_LABEL_VI: Record<StaffRole, string> = {
  owner: "Chủ sở hữu",
  super_manager: "Quản lý tổng",
  branch_manager: "Quản lý chi nhánh",
  warehouse_manager: "Quản lý kho tổng",
  production_manager: "Quản lý sản xuất",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  chef: "Bếp",
  office: "Văn phòng",
};

/**
 * Canonical HR position code → StaffRole bucket. TS mirror of the SQL
 * `private.staff_role_from_position_code()` — change both in the same PR
 * (migration 20260610230000 is the current twin). Only the 11 canonical
 * English codes below; unknown codes return "unassigned" (fail-safe).
 */
const POSITION_CODE_TO_STAFF_ROLE: Record<string, StaffRole> = {
  owner: "owner",
  super_manager: "super_manager",
  branch_manager: "branch_manager",
  office: "office",
  warehouse_manager: "warehouse_manager",
  production_manager: "production_manager",
  head_chef: "production_manager",
  kitchen_helper: "chef",
  chef: "chef",
  cashier: "cashier",
  waiter: "waiter",
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
  access_bucket?: AccessBucket;
  /**
   * Canonical HR position code (source of truth). `user_role` is derived from
   * it via the role-bridge mapper (`staffRoleFromPositionCode` / the SQL twin).
   */
  position?: string;
  position_code?: string;
}

/** Scope IDs extracted from URL or JWT */
export interface ScopeIds {
  tenantId: number;
  branchId: number | null;
}
