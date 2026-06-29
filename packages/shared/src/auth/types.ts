/**
 * Access buckets — ordered by privilege level (highest to lowest).
 * These are compatibility auth buckets, not mutable HR position labels.
 */
export const ACCESS_BUCKETS = [
  "owner",
  "branch_manager",
  "warehouse_manager",
  "production_manager",
  "cashier",
  "chef",
  "office",
] as const;

export type AccessBucket = (typeof ACCESS_BUCKETS)[number];

/** Compatibility alias while app code moves from StaffRole to AccessBucket. */
export const STAFF_ROLES = ACCESS_BUCKETS;
export type StaffRole = AccessBucket;

/** Roles that can access /admin/ routes */
export const ADMIN_ROLES: readonly StaffRole[] = ["owner"] as const;

/** Roles that operate at branch level (POS/KDS) */
export const BRANCH_ROLES: readonly StaffRole[] = [
  "cashier",
  "chef",
] as const;

/** Roles that do not require branch scope */
export const TENANT_LEVEL_ROLES: readonly StaffRole[] = [
  "owner",
  "office",
] as const;

/** Roles that managers can create/edit from the current staff screen */
export const MANAGEABLE_STAFF_ROLES: readonly StaffRole[] = [
  "branch_manager",
  "warehouse_manager",
  "production_manager",
  "cashier",
  "chef",
  "office",
] as const;

/** Operational roles that must belong to a branch. */
export const BRANCH_REQUIRED_OPERATIONAL_ROLES: readonly StaffRole[] = [
  "cashier",
  "chef",
  "branch_manager",
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
 * Vietnamese labels for compatibility access buckets.
 * Staff/HR UI should display `positions.label_vi` instead.
 */
export const ROLE_LABEL_VI: Record<StaffRole, string> = {
  owner: "Chủ sở hữu",
  branch_manager: "Quản lý chi nhánh",
  warehouse_manager: "Quản lý Kho Tổng",
  production_manager: "Quản lý Bếp Trung Tâm",
  cashier: "Thu ngân",
  chef: "Bếp",
  office: "Văn phòng",
};

/**
 * Canonical HR position code → StaffRole bucket. TS mirror of the SQL
 * `private.staff_role_from_position_code()` — change both in the same PR
 * (the SQL twin is the latest position-mapper migration). Unknown codes return
 * "unassigned" (fail-safe).
 */
const POSITION_CODE_TO_STAFF_ROLE: Record<string, StaffRole> = {
  owner: "owner",
  branch_manager: "branch_manager",
  office: "office",
  accountant: "office",
  marketing: "office",
  technician: "office",
  design_construction: "office",
  cleaner: "office",
  warehouse_manager: "warehouse_manager",
  central_supply_manager: "warehouse_manager",
  production_manager: "production_manager",
  central_kitchen_manager: "production_manager",
  head_chef: "production_manager",
  kitchen_counter: "chef",
  kitchen_helper: "chef",
  grill_counter: "chef",
  chef: "chef",
  cashier: "cashier",
  cashier_server: "cashier",
  waiter: "cashier",
};

export type BranchKind = "branch" | "central_supply" | "central_kitchen";

const POSITION_CODE_TO_REQUIRED_BRANCH_KIND: Record<string, BranchKind | null> =
  {
    owner: null,
    office: null,
    accountant: null,
    marketing: null,
    technician: null,
    design_construction: null,
    branch_manager: "branch",
    cashier: "branch",
    cashier_server: "branch",
    chef: "branch",
    kitchen_counter: "branch",
    kitchen_helper: "branch",
    grill_counter: "branch",
    cleaner: "branch",
    warehouse_manager: "central_supply",
    central_supply_manager: "central_supply",
    production_manager: "central_kitchen",
    central_kitchen_manager: "central_kitchen",
    head_chef: "central_kitchen",
    waiter: "branch",
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
