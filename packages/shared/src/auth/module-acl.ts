import { ADMIN_ROLES, STAFF_ROLES, type StaffRole } from "./types";
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
  | "finance"
  | "reports"
  | "settings"
  | "pos"
  | "kds"
  | "runner"
  | "branch_settings"
  | "branch_menu_limits"
  | "employee"
  | "notifications";

interface ModuleAcl {
  path: string;
  allowedRoles: readonly StaffRole[];
  label: string;
}

const EMPLOYEE_PORTAL_ROLES: readonly StaffRole[] = STAFF_ROLES.filter(
  (role) => !ADMIN_ROLES.includes(role),
);

export const MODULE_ACL: Record<ModuleKey, ModuleAcl> = {
  dashboard: {
    path: "/admin/dashboard",
    allowedRoles: ["owner", "manager"],
    label: getModuleLabelVi("dashboard"),
  },
  menu: {
    path: "/menu",
    allowedRoles: ["owner", "manager"],
    label: getModuleLabelVi("menu"),
  },
  inventory: {
    path: "/inventory",
    allowedRoles: ["owner", "manager", "staff"],
    label: getModuleLabelVi("inventory"),
  },
  /** NCC, PO, GRN, HĐ NCC, công thức — kho tổng + bếp TT */
  inventory_procurement: {
    path: "/inventory/suppliers",
    allowedRoles: ["owner", "manager", "staff"],
    label: getModuleLabelVi("inventory_procurement"),
  },
  /**
   * Retired Inventory v1 admin surface. Runtime Inventory work is canonical
   * under `/inventory/*`; keep the module key only so old URLs resolve through
   * the shared ACL instead of becoming an unclassified admin route.
   */
  inventory_admin: {
    path: "/admin/inventory",
    allowedRoles: [],
    label: getModuleLabelVi("inventory_admin"),
  },
  orders: {
    path: "/orders",
    allowedRoles: ["owner", "manager", "staff"],
    label: getModuleLabelVi("orders"),
  },
  staff: {
    path: "/admin/staff",
    allowedRoles: ["owner", "manager"],
    label: getModuleLabelVi("staff"),
  },
  hr: {
    path: "/hr",
    allowedRoles: ["owner", "manager"],
    label: getModuleLabelVi("hr"),
  },
  finance: {
    path: "/finance",
    allowedRoles: ["owner", "manager"],
    label: getModuleLabelVi("finance"),
  },
  reports: {
    path: "/admin/reports",
    allowedRoles: ["owner", "manager"],
    label: getModuleLabelVi("reports"),
  },
  settings: {
    path: "/admin/settings",
    allowedRoles: ["owner", "manager"],
    label: getModuleLabelVi("settings"),
  },
  pos: {
    path: "/br/*/pos",
    allowedRoles: ["staff", "manager"],
    label: getModuleLabelVi("pos"),
  },
  kds: {
    path: "/br/*/kds",
    allowedRoles: ["chef", "manager"],
    label: getModuleLabelVi("kds"),
  },
  runner: {
    path: "/br/*/runner",
    allowedRoles: ["staff", "chef", "manager"],
    label: getModuleLabelVi("runner"),
  },
  branch_settings: {
    path: "/br/*/settings",
    allowedRoles: ["owner", "manager"],
    label: getModuleLabelVi("branch_settings"),
  },
  /**
   * Daily sales limits per (branch, menu item). Distinct from
   * branch_settings so staff + chef can co-own quota adjustments
   * without inheriting access to printer/POS/zone configuration.
   */
  branch_menu_limits: {
    path: "/br/*/menu-limits",
    allowedRoles: ["owner", "manager", "staff", "chef"],
    label: getModuleLabelVi("branch_menu_limits"),
  },
  employee: {
    path: "/employee",
    allowedRoles: EMPLOYEE_PORTAL_ROLES,
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
