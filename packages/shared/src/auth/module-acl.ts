import { STAFF_ROLES, type StaffRole } from "./types";
import { getModuleLabelVi } from "../labels";

/**
 * Fast route candidate gate used by middleware and navigation.
 * Capability checks and database policies remain authoritative.
 */

export type ModuleKey =
  | "owner"
  | "menu"
  | "inventory"
  | "inventory_operations"
  | "orders"
  | "staff"
  | "hr"
  | "hr_payroll"
  | "me"
  | "finance"
  | "branches"
  | "settings"
  | "pos"
  | "kds"
  | "runner"
  | "branch_home"
  | "branch_dashboard"
  | "branch_settings"
  | "branch_menu_limits"
  | "branch_pos_sessions"
  | "branch_team"
  | "branch_stock"
  | "branch_orders"
  | "feedback"
  | "branch_feedback"
  | "employee_checkout_approvals"
  | "employee_leave_approvals"
  | "branch_shift_roster"
  | "branch_shift_attendance"
  | "notifications";

interface ModuleAcl {
  path: string;
  allowedRoles: readonly StaffRole[];
  label: string;
}

export const MODULE_ACL: Record<ModuleKey, ModuleAcl> = {
  owner: {
    path: "/",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("owner"),
  },
  menu: {
    path: "/menu",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("menu"),
  },
  inventory: {
    path: "/inventory",
    // D076 adapters remain temporary until ADR 0015; D091 owns Inventory jobs.
    allowedRoles: [
      "owner",
      "accountant",
      "central_supply_ops",
      "central_kitchen_lead",
    ],
    label: getModuleLabelVi("inventory"),
  },
  inventory_operations: {
    path: "/inventory/stock",
    allowedRoles: ["owner", "central_supply_ops", "central_kitchen_lead"],
    label: getModuleLabelVi("inventory"),
  },
  orders: {
    path: "/orders",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("orders"),
  },
  feedback: {
    path: "/feedback",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("feedback"),
  },
  staff: {
    path: "/hr/staff",
    allowedRoles: STAFF_ROLES,
    label: getModuleLabelVi("staff"),
  },
  hr: {
    path: "/hr",
    allowedRoles: STAFF_ROLES,
    label: getModuleLabelVi("hr"),
  },
  hr_payroll: {
    path: "/hr/payroll",
    allowedRoles: STAFF_ROLES,
    label: getModuleLabelVi("hr_payroll"),
  },
  me: {
    path: "/me",
    allowedRoles: STAFF_ROLES.filter((role) => role !== "owner"),
    label: "Công việc của tôi",
  },
  finance: {
    path: "/finance",
    // D076 temporary adapter until ADR 0015.
    allowedRoles: ["owner", "accountant"],
    label: getModuleLabelVi("finance"),
  },
  branches: {
    path: "/branches",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("branches"),
  },
  settings: {
    path: "/settings",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("settings"),
  },
  pos: {
    path: "/br/*/pos",
    allowedRoles: ["owner", "cashier", "branch_manager"],
    label: getModuleLabelVi("pos"),
  },
  kds: {
    path: "/br/*/kds",
    allowedRoles: ["owner", "chef", "branch_manager"],
    label: getModuleLabelVi("kds"),
  },
  runner: {
    path: "/br/*/runner",
    allowedRoles: ["owner", "cashier", "chef", "branch_manager"],
    label: getModuleLabelVi("runner"),
  },
  branch_home: {
    path: "/br/*",
    allowedRoles: [
      "owner",
      "branch_manager",
      "cashier",
      "chef",
      "branch_staff",
      "central_supply_ops",
      "central_kitchen_lead",
    ],
    label: getModuleLabelVi("branch_home"),
  },
  branch_dashboard: {
    path: "/br/*/dashboard",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("branch_dashboard"),
  },
  branch_settings: {
    path: "/br/*/settings",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("branch_settings"),
  },
  /**
   * Daily sales limits per (branch, menu item). Branch manager day-control
   * surface; durable setup remains under branch_settings.
   */
  branch_menu_limits: {
    path: "/br/*/menu-limits",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("branch_menu_limits"),
  },
  branch_pos_sessions: {
    path: "/br/*/pos-sessions",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("branch_pos_sessions"),
  },
  /** Branch-safe people, attendance, and leave visibility. */
  branch_team: {
    path: "/br/*/team",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("branch_team"),
  },
  branch_stock: {
    path: "/br/*/stock",
    allowedRoles: [
      "owner",
      "branch_manager",
      "central_supply_ops",
      "central_kitchen_lead",
    ],
    label: getModuleLabelVi("branch_stock"),
  },
  branch_orders: {
    path: "/br/*/orders",
    allowedRoles: ["owner", "branch_manager", "cashier"],
    label: getModuleLabelVi("branch_orders"),
  },
  branch_feedback: {
    path: "/br/*/feedback",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("branch_feedback"),
  },
  employee_checkout_approvals: {
    path: "/br/*/shift/checkout-approvals",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("employee_checkout_approvals"),
  },
  employee_leave_approvals: {
    path: "/br/*/shift/leave-approvals",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("employee_leave_approvals"),
  },
  branch_shift_roster: {
    path: "/br/*/shift/roster",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("branch_shift_roster"),
  },
  branch_shift_attendance: {
    path: "/br/*/shift/attendance",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("branch_shift_attendance"),
  },
  notifications: {
    path: "/notifications",
    allowedRoles: STAFF_ROLES,
    label: getModuleLabelVi("notifications"),
  },
};

/** Check if a role can access a module */
export function canAccess(role: StaffRole, moduleKey: ModuleKey): boolean {
  if (role === "owner" && moduleKey === "me") return false;
  if (role === "owner") return true;
  return MODULE_ACL[moduleKey].allowedRoles.includes(role);
}
