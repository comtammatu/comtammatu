import { STAFF_ROLES, type StaffRole } from "./types";
import { getModuleLabelVi } from "../labels";

/**
 * Module ACL — SINGLE source of truth for route access control.
 * Used by middleware (proxy.ts) and sidebar navigation.
 */

export type ModuleKey =
  | "menu"
  | "inventory"
  | "inventory_procurement"
  | "orders"
  | "staff"
  | "hr"
  | "hr_payroll"
  | "finance"
  | "branches"
  | "branch_picker"
  | "settings"
  | "pos"
  | "kds"
  | "runner"
  | "operator_home"
  | "branch_dashboard"
  | "branch_settings"
  | "branch_menu_limits"
  | "branch_pos_sessions"
  | "branch_team"
  | "employee_checkout_approvals"
  | "employee_leave_approvals"
  | "notifications";

interface ModuleAcl {
  path: string;
  allowedRoles: readonly StaffRole[];
  label: string;
}

export const MODULE_ACL: Record<ModuleKey, ModuleAcl> = {
  menu: {
    path: "/menu",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("menu"),
  },
  inventory: {
    path: "/inventory",
    allowedRoles: [
      "owner",
      "branch_manager",
      "warehouse_manager",
      "production_manager",
    ],
    label: getModuleLabelVi("inventory"),
  },
  /**
   * NCC, PO, GRN, HĐ NCC, công thức — branch-scoped inventory. `branch_manager`
   * added (D068) so a Kho CN reaches the GRN/production operator routes and the
   * `GrnNewPageContent` canAccess gate. Office PO/invoice reads become reachable
   * but PO create is role-split-closed (PROCUREMENT_PO_ROLES), invoice-match is
   * key-closed, and the PO nav tile stays central-kind-gated.
   */
  inventory_procurement: {
    path: "/inventory/suppliers",
    allowedRoles: [
      "owner",
      "branch_manager",
      "warehouse_manager",
      "production_manager",
    ],
    label: getModuleLabelVi("inventory_procurement"),
  },
  orders: {
    path: "/orders",
    allowedRoles: ["owner", "branch_manager", "cashier"],
    label: getModuleLabelVi("orders"),
  },
  staff: {
    path: "/hr/staff",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("staff"),
  },
  hr: {
    path: "/hr",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("hr"),
  },
  hr_payroll: {
    path: "/hr/payroll",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("hr_payroll"),
  },
  finance: {
    path: "/finance",
    allowedRoles: ["owner", "office"],
    label: getModuleLabelVi("finance"),
  },
  branches: {
    path: "/branches",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("branches"),
  },
  branch_picker: {
    path: "/br",
    allowedRoles: ["owner"],
    label: getModuleLabelVi("branch_picker"),
  },
  settings: {
    path: "/admin/settings",
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
  operator_home: {
    path: "/br/*",
    allowedRoles: [
      "owner",
      "branch_manager",
      "cashier",
      "chef",
      "branch_staff",
      "warehouse_manager",
      "production_manager",
      "office",
    ],
    label: getModuleLabelVi("operator_home"),
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
  /**
   * "Đội hôm nay" branch team board (D059). Scoped to owner/branch_manager
   * only — the underlying aggregate read (attendance, checklist, leave)
   * relies on `hr:view_employee` / `hr:approve_leave_request`, which
   * warehouse_manager/production_manager role templates do not grant
   * (`supabase/_local-dev/dev-tenant-seed.sql`). Extending this ACL to those
   * roles requires a permission-grant change first, not just a nav entry.
   */
  branch_team: {
    path: "/br/*/team",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("branch_team"),
  },
  employee_checkout_approvals: {
    path: "/br/*/shift/checkout-approvals",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("employee_checkout_approvals"),
  },
  /**
   * Branch-native leave-request approval (D059 §4). Backing reads/writes
   * (`fetchLeaveRequests`, `approveLeaveRequest`, `rejectLeaveRequest`) still
   * gate on `hr:approve_leave_request` + branch scope — this module key only
   * fast-gates the route, matching `employee_checkout_approvals`.
   */
  employee_leave_approvals: {
    path: "/br/*/shift/leave-approvals",
    allowedRoles: ["owner", "branch_manager"],
    label: getModuleLabelVi("employee_leave_approvals"),
  },
  notifications: {
    path: "/notifications",
    allowedRoles: STAFF_ROLES,
    label: getModuleLabelVi("notifications"),
  },
};

/** Check if a role can access a module */
export function canAccess(role: StaffRole, moduleKey: ModuleKey): boolean {
  if (role === "owner") return true;
  return MODULE_ACL[moduleKey].allowedRoles.includes(role);
}
