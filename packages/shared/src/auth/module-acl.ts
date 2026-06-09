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
  | "hr_payroll"
  | "crm"
  | "finance"
  | "accounting"
  | "reports"
  | "settings"
  | "pos"
  | "kds"
  | "runner"
  | "branch_settings"
  | "branch_menu_limits"
  | "employee"
  | "employee_checkout_approvals"
  | "notifications"
  | "feedback";

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
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("dashboard"),
  },
  menu: {
    path: "/menu",
    allowedRoles: ["owner", "super_manager", "branch_manager"],
    label: getModuleLabelVi("menu"),
  },
  inventory: {
    path: "/inventory",
    allowedRoles: [
      "owner",
      "super_manager",
      "branch_manager",
      "warehouse_manager",
      "production_manager",
    ],
    label: getModuleLabelVi("inventory"),
  },
  /** NCC, PO, GRN, HĐ NCC, công thức — kho tổng + bếp TT */
  inventory_procurement: {
    path: "/inventory/suppliers",
    allowedRoles: [
      "owner",
      "super_manager",
      "warehouse_manager",
      "production_manager",
    ],
    label: getModuleLabelVi("inventory_procurement"),
  },
  /**
   * Retired Inventory admin surface. Runtime Inventory work is canonical
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
    allowedRoles: ["owner", "super_manager", "branch_manager", "cashier"],
    label: getModuleLabelVi("orders"),
  },
  staff: {
    path: "/admin/staff",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("staff"),
  },
  hr: {
    path: "/hr",
    allowedRoles: ["owner", "super_manager", "branch_manager"],
    label: getModuleLabelVi("hr"),
  },
  hr_payroll: {
    path: "/hr/payroll",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("hr_payroll"),
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
    allowedRoles: ["owner", "super_manager", "branch_manager"],
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
  runner: {
    path: "/br/*/runner",
    allowedRoles: ["cashier", "waiter", "chef", "branch_manager"],
    label: getModuleLabelVi("runner"),
  },
  branch_settings: {
    path: "/br/*/settings",
    allowedRoles: ["owner", "super_manager", "branch_manager"],
    label: getModuleLabelVi("branch_settings"),
  },
  /**
   * Daily sales limits per (branch, menu item). Distinct from
   * branch_settings so cashier + chef can co-own quota adjustments
   * without inheriting access to printer/POS/zone configuration.
   */
  branch_menu_limits: {
    path: "/br/*/menu-limits",
    allowedRoles: [
      "owner",
      "super_manager",
      "branch_manager",
      "cashier",
      "chef",
    ],
    label: getModuleLabelVi("branch_menu_limits"),
  },
  employee: {
    path: "/employee",
    allowedRoles: EMPLOYEE_PORTAL_ROLES,
    label: getModuleLabelVi("employee"),
  },
  employee_checkout_approvals: {
    path: "/employee/checkout-approvals",
    allowedRoles: ["owner", "super_manager", "branch_manager"],
    label: getModuleLabelVi("employee_checkout_approvals"),
  },
  notifications: {
    path: "/notifications",
    allowedRoles: STAFF_ROLES,
    label: getModuleLabelVi("notifications"),
  },
  feedback: {
    path: "/admin/feedback",
    allowedRoles: ["owner", "super_manager", "branch_manager"],
    label: getModuleLabelVi("feedback"),
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
