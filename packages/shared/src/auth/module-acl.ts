import { STAFF_ROLES, type StaffRole } from "./types";
import { getModuleLabelVi } from "../labels";

/**
 * Module ACL — SINGLE source of truth for route access control.
 * Used by middleware (proxy.ts) and sidebar navigation.
 */

export type ModuleKey =
  | "dashboard"
  | "menu"
  | "inventory"
  | "inventory_procurement"
  | "inventory_admin"
  | "orders"
  | "staff"
  | "hr"
  | "crm"
  | "finance"
  | "accounting"
  | "reports"
  | "settings"
  | "pos"
  | "kds"
  | "branch_settings"
  | "employee"
  | "notifications";

interface ModuleAcl {
  path: string;
  allowedRoles: readonly StaffRole[];
  label: string;
}

export const MODULE_ACL: Record<ModuleKey, ModuleAcl> = {
  dashboard: {
    path: "/admin/dashboard",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("dashboard"),
  },
  menu: {
    path: "/menu",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: getModuleLabelVi("menu"),
  },
  inventory: {
    path: "/inventory",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager", "warehouse_manager", "production_manager"],
    label: getModuleLabelVi("inventory"),
  },
  /** NCC, PO, GRN, HĐ NCC, công thức — kho tổng + bếp TT */
  inventory_procurement: {
    path: "/inventory/suppliers",
    allowedRoles: ["owner", "super_manager", "warehouse_manager", "production_manager"],
    label: getModuleLabelVi("inventory_procurement"),
  },
  /**
   * Cấu hình kho — admin tools: trust leaderboard, cold-chain policy,
   * express windows, feature flags. Route gate passes these roles into
   * the hub page; each sub-tool keeps its own fine-grained permission gate.
   */
  inventory_admin: {
    path: "/admin/inventory",
    allowedRoles: [
      "owner",
      "super_manager",
      "area_manager",
      "branch_manager",
      "warehouse_manager",
    ],
    label: getModuleLabelVi("inventory_admin"),
  },
  orders: {
    path: "/orders",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager", "cashier"],
    label: getModuleLabelVi("orders"),
  },
  staff: {
    path: "/admin/staff",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("staff"),
  },
  hr: {
    path: "/hr",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("hr"),
  },
  crm: {
    path: "/admin/crm",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("crm"),
  },
  finance: {
    path: "/finance",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("finance"),
  },
  /** Accounting admin — period close / reopen. Gate on period_reopen perm. */
  accounting: {
    path: "/admin/accounting",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("accounting"),
  },
  reports: {
    path: "/admin/reports",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("reports"),
  },
  settings: {
    path: "/admin/settings",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: getModuleLabelVi("settings"),
  },
  pos: {
    path: "/br/*/pos",
    allowedRoles: ["cashier", "waiter", "branch_manager"],
    label: getModuleLabelVi("pos"),
  },
  kds: {
    path: "/br/*/kds",
    allowedRoles: ["chef", "branch_manager"],
    label: getModuleLabelVi("kds"),
  },
  branch_settings: {
    path: "/br/*/settings",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: getModuleLabelVi("branch_settings"),
  },
  employee: {
    path: "/employee",
    allowedRoles: STAFF_ROLES,
    label: getModuleLabelVi("employee"),
  },
  notifications: {
    path: "/notifications",
    allowedRoles: STAFF_ROLES,
    label: getModuleLabelVi("notifications"),
  },
};

/** Check if a role can access a module */
export function canAccess(role: StaffRole, moduleKey: ModuleKey): boolean {
  return MODULE_ACL[moduleKey].allowedRoles.includes(role);
}

/** Get all modules a role can access */
export function getAccessibleModules(role: StaffRole): ModuleKey[] {
  return (Object.keys(MODULE_ACL) as ModuleKey[]).filter((key) =>
    MODULE_ACL[key].allowedRoles.includes(role),
  );
}
