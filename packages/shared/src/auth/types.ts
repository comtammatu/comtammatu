/**
 * Application authorization roles, ordered by privilege level.
 *
 * Owner surface routes are owner-only. `MODULE_ACL` still describes reusable
 * capabilities because Branch-native routes share keys such as `inventory` and
 * `orders`. Central-site soft-routing is gone; `BranchKind` enum values remain
 * for historical inventory rows only.
 */
export const STAFF_ROLES = [
  "owner",
  "branch_manager",
  "cashier",
  "chef",
  "branch_staff",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles that operate at branch level (POS/KDS) */
export const BRANCH_ROLES: readonly StaffRole[] = ["cashier", "chef"] as const;

/** Roles that do not require branch scope */
export const TENANT_LEVEL_ROLES: readonly StaffRole[] = ["owner"] as const;

/** Roles that managers can create/edit from the current staff screen */
export const MANAGEABLE_STAFF_ROLES: readonly StaffRole[] = [
  "branch_manager",
  "cashier",
  "chef",
] as const;

/** Operational roles that must belong to a branch. */
export const BRANCH_REQUIRED_OPERATIONAL_ROLES: readonly StaffRole[] = [
  "cashier",
  "chef",
  "branch_manager",
  "branch_staff",
] as const;

/**
 * Settings → Bàn, Trạm bếp (cấu hình sàn, không phải chiến lược chuỗi).
 * owner + branch_manager quản lý cấu hình sàn/bếp.
 */
export const BRANCH_FLOOR_SETTINGS_ROLES: readonly StaffRole[] = [
  "owner",
  "branch_manager",
] as const;

/** Settings → Bàn, trạm bếp */
export function canManageBranchFloorSettings(role: StaffRole): boolean {
  return BRANCH_FLOOR_SETTINGS_ROLES.some((r) => r === role);
}

/**
 * Tenant-strategy settings (chain identity, payments, branch roster, print
 * templates) are owner-only. Single source for the owner-only settings gate so
 * pages, nav, and layouts never re-declare a local `["owner"]` array.
 */
export const TENANT_STRATEGY_SETTINGS_ROLES: readonly StaffRole[] = [
  "owner",
] as const;

export function canManageTenantStrategySettings(role: StaffRole): boolean {
  return TENANT_STRATEGY_SETTINGS_ROLES.some((r) => r === role);
}

/**
 * Vietnamese labels for application authorization roles.
 * Staff/HR UI should display `positions.label_vi` instead.
 */
export const ROLE_LABEL_VI: Record<StaffRole, string> = {
  owner: "Chủ sở hữu",
  branch_manager: "Quản lý chi nhánh",
  cashier: "Thu ngân",
  chef: "Bếp",
  branch_staff: "Nhân sự chi nhánh",
};

/**
 * Canonical HR position code → StaffRole bucket. TS mirror of the SQL
 * `private.staff_role_from_position_code()` — change both in the same PR
 * (the SQL twin is the latest position-mapper migration). Unknown codes return
 * "unassigned" (fail-safe). Codes outside this map never gain an access
 * bucket implicitly.
 */
const POSITION_CODE_TO_STAFF_ROLE: Record<string, StaffRole> = {
  owner: "owner",
  branch_manager: "branch_manager",
  cleaner: "branch_staff",
  guard: "branch_staff",
  kitchen_counter: "chef",
  kitchen_helper: "chef",
  grill_counter: "chef",
  chef: "chef",
  cashier: "cashier",
};

export type BranchKind = "branch" | "central_supply" | "central_kitchen";

const POSITION_CODE_TO_REQUIRED_BRANCH_KIND: Record<string, BranchKind | null> =
  {
    owner: null,
    branch_manager: "branch",
    cashier: "branch",
    chef: "branch",
    kitchen_counter: "branch",
    kitchen_helper: "branch",
    grill_counter: "branch",
    cleaner: "branch",
    guard: "branch",
  };

export function staffRoleFromPositionCode(
  code: string | null | undefined,
): StaffRole | "unassigned" {
  if (!code) return "unassigned";
  return POSITION_CODE_TO_STAFF_ROLE[code] ?? "unassigned";
}

export function requiredBranchKindForPositionCode(
  code: string | null | undefined,
): BranchKind | null | "unassigned" {
  if (!code) return "unassigned";
  if (!(code in POSITION_CODE_TO_REQUIRED_BRANCH_KIND)) return "unassigned";
  return POSITION_CODE_TO_REQUIRED_BRANCH_KIND[code] ?? null;
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
  position_code: string;
}

/** Scope IDs extracted from URL or JWT */
export interface ScopeIds {
  tenantId: number;
  branchId: number | null;
}
