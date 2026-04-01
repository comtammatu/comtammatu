import type { StaffRole } from "./types";

/**
 * Module ACL — SINGLE source of truth for route access control.
 * Used by middleware (proxy.ts) and sidebar navigation.
 */

export type ModuleKey =
  | "dashboard"
  | "menu"
  | "inventory"
  | "orders"
  | "staff"
  | "hr"
  | "crm"
  | "finance"
  | "reports"
  | "settings"
  | "pos"
  | "kds"
  | "employee";

interface ModuleAcl {
  path: string;
  allowedRoles: readonly StaffRole[];
  label: string;
}

export const MODULE_ACL: Record<ModuleKey, ModuleAcl> = {
  dashboard: {
    path: "/admin/dashboard",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: "Dashboard",
  },
  menu: {
    path: "/admin/menu",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: "Menu",
  },
  inventory: {
    path: "/admin/inventory",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: "Inventory",
  },
  orders: {
    path: "/admin/orders",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: "Orders",
  },
  staff: {
    path: "/admin/staff",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: "Nhân viên",
  },
  hr: {
    path: "/admin/hr",
    allowedRoles: ["owner", "super_manager"],
    label: "Nhân sự & Lương",
  },
  crm: {
    path: "/admin/crm",
    allowedRoles: ["owner", "super_manager", "area_manager"],
    label: "CRM",
  },
  finance: {
    path: "/admin/finance",
    allowedRoles: ["owner", "super_manager"],
    label: "Finance",
  },
  reports: {
    path: "/admin/reports",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: "Reports",
  },
  settings: {
    path: "/admin/settings",
    allowedRoles: ["owner", "super_manager"],
    label: "Settings",
  },
  pos: {
    path: "/br/*/pos",
    allowedRoles: ["cashier", "waiter", "branch_manager"],
    label: "POS",
  },
  kds: {
    path: "/br/*/kds",
    allowedRoles: ["chef", "branch_manager"],
    label: "KDS",
  },
  employee: {
    path: "/employee",
    allowedRoles: [
      "owner",
      "super_manager",
      "area_manager",
      "branch_manager",
      "cashier",
      "waiter",
      "chef",
      "office",
    ],
    label: "Employee Portal",
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
