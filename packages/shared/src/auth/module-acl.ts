import { STAFF_ROLES, type StaffRole } from "./types";
import { getModuleLabelVi } from "../labels";
import { PERMISSION_KEYS, type PermissionKey } from "./permissions";

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
  | "runner"
  | "branch_settings"
  | "branch_menu_limits"
  | "employee"
  | "notifications"
  | "feedback";

interface ModuleAcl {
  path: string;
  allowedRoles: readonly StaffRole[];
  label: string;
  permissionAccess?: ModulePermissionAccess;
}

export interface ModulePermissionAccess {
  scope: "tenant" | "branch";
  mode: "any" | "all";
  keys: readonly PermissionKey[];
}

export const MODULE_ACL: Record<ModuleKey, ModuleAcl> = {
  dashboard: {
    path: "/admin/dashboard",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("dashboard"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [PERMISSION_KEYS.DASHBOARD_VIEW],
    },
  },
  menu: {
    path: "/menu",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: getModuleLabelVi("menu"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [
        PERMISSION_KEYS.MENU_READ,
        PERMISSION_KEYS.MENU_WRITE,
        PERMISSION_KEYS.MENU_PUBLISH,
        PERMISSION_KEYS.MENU_MANAGE_CATEGORY,
      ],
    },
  },
  inventory: {
    path: "/inventory",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager", "warehouse_manager", "production_manager"],
    label: getModuleLabelVi("inventory"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [
        PERMISSION_KEYS.INVENTORY_READ,
        PERMISSION_KEYS.INVENTORY_WRITE,
        PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
        PERMISSION_KEYS.INVENTORY_TRANSFER_CREATE,
        PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
      ],
    },
  },
  /** NCC, PO, GRN, HĐ NCC, công thức — kho tổng + bếp TT */
  inventory_procurement: {
    path: "/inventory/suppliers",
    allowedRoles: ["owner", "super_manager", "warehouse_manager", "production_manager"],
    label: getModuleLabelVi("inventory_procurement"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [
        PERMISSION_KEYS.PROCUREMENT_READ,
        PERMISSION_KEYS.PROCUREMENT_PO_CREATE,
        PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
        PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE,
      ],
    },
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
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager", "cashier"],
    label: getModuleLabelVi("orders"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [PERMISSION_KEYS.ORDERS_READ, PERMISSION_KEYS.ORDERS_WRITE],
    },
  },
  staff: {
    path: "/admin/staff",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("staff"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [
        PERMISSION_KEYS.STAFF_VIEW,
        PERMISSION_KEYS.STAFF_MANAGE,
        PERMISSION_KEYS.STAFF_ASSIGN_PERMISSION,
        PERMISSION_KEYS.STAFF_ASSIGN_POSITION,
      ],
    },
  },
  hr: {
    path: "/hr",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("hr"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [PERMISSION_KEYS.HR_VIEW_EMPLOYEE, PERMISSION_KEYS.HR_MANAGE_EMPLOYEE],
    },
  },
  crm: {
    path: "/admin/crm",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("crm"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [PERMISSION_KEYS.CRM_READ, PERMISSION_KEYS.CRM_WRITE],
    },
  },
  finance: {
    path: "/finance",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("finance"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [
        PERMISSION_KEYS.FINANCE_VIEW,
        PERMISSION_KEYS.FINANCE_EXPENSE_CREATE,
        PERMISSION_KEYS.FINANCE_PAYROLL_CALCULATE,
      ],
    },
  },
  /** Accounting admin — period close / reopen. Gate on period_reopen perm. */
  accounting: {
    path: "/admin/accounting",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("accounting"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [PERMISSION_KEYS.ACCOUNTING_PERIOD_REOPEN],
    },
  },
  reports: {
    path: "/admin/reports",
    allowedRoles: ["owner", "super_manager"],
    label: getModuleLabelVi("reports"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [
        PERMISSION_KEYS.REPORTS_VIEW_BRANCH,
        PERMISSION_KEYS.REPORTS_VIEW_TENANT,
        PERMISSION_KEYS.REPORTS_EXPORT,
      ],
    },
  },
  settings: {
    path: "/admin/settings",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: getModuleLabelVi("settings"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [
        PERMISSION_KEYS.SETTINGS_BRANCH,
        PERMISSION_KEYS.SETTINGS_TENANT,
        PERMISSION_KEYS.SETTINGS_INTEGRATIONS,
        PERMISSION_KEYS.SETTINGS_BRANCH_NETWORK,
      ],
    },
  },
  pos: {
    path: "/br/*/pos",
    allowedRoles: ["cashier", "waiter", "branch_manager"],
    label: getModuleLabelVi("pos"),
    permissionAccess: {
      scope: "branch",
      mode: "any",
      keys: [PERMISSION_KEYS.POS_USE],
    },
  },
  kds: {
    path: "/br/*/kds",
    allowedRoles: ["chef", "branch_manager"],
    label: getModuleLabelVi("kds"),
    permissionAccess: {
      scope: "branch",
      mode: "any",
      keys: [PERMISSION_KEYS.KDS_USE],
    },
  },
  runner: {
    path: "/br/*/runner",
    allowedRoles: ["cashier", "waiter", "chef", "branch_manager"],
    label: getModuleLabelVi("runner"),
    permissionAccess: {
      scope: "branch",
      mode: "any",
      keys: [PERMISSION_KEYS.POS_USE, PERMISSION_KEYS.KDS_USE],
    },
  },
  branch_settings: {
    path: "/br/*/settings",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: getModuleLabelVi("branch_settings"),
    permissionAccess: {
      scope: "branch",
      mode: "any",
      keys: [
        PERMISSION_KEYS.SETTINGS_BRANCH,
        PERMISSION_KEYS.SETTINGS_BRANCH_NETWORK,
      ],
    },
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
      "area_manager",
      "branch_manager",
      "cashier",
      "chef",
    ],
    label: getModuleLabelVi("branch_menu_limits"),
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
  feedback: {
    path: "/admin/feedback",
    allowedRoles: ["owner", "super_manager", "area_manager", "branch_manager"],
    label: getModuleLabelVi("feedback"),
    permissionAccess: {
      scope: "tenant",
      mode: "any",
      keys: [
        PERMISSION_KEYS.FEEDBACK_VIEW,
        PERMISSION_KEYS.FEEDBACK_VIEW_REPORT,
        PERMISSION_KEYS.FEEDBACK_MANAGE_SETTINGS,
      ],
    },
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

/** Get the permission gate attached to a module route. */
export function getModulePermissionAccess(
  moduleKey: ModuleKey,
): ModulePermissionAccess | null {
  return MODULE_ACL[moduleKey].permissionAccess ?? null;
}
