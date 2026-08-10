import { APP_COPY_VI, NAV_GROUP_LABELS_VI } from "../labels";
import { MODULE_ACL, type ModuleKey } from "./module-acl";
import { isPublicAppPath, resolveModuleFromPath } from "./route-resolution";

export type RouteSurface =
  | "owner" // code alias for product plane `control_surface` (Quản lý hệ thống)
  | "self"
  | "branch_management"
  | "branch_operation"
  | "utility"
  | "public";

/** Product Dual Thesis: docs plane `control_surface` === RouteSurface "owner". */
export const CONTROL_SURFACE_ROUTE_SURFACE: RouteSurface = "owner";

export type RoutePrimaryNav =
  | "owner-sidebar"
  | "management-sidebar"
  | "operator-bottom-nav"
  | "operational-chrome"
  | "none";

export type RouteBackBehavior = "none" | "role-home" | "in-flow";

export interface RouteFamilyContract {
  id: string;
  label: string;
  surface: RouteSurface;
  entryPath: string;
  matchPrefixes: readonly string[];
  moduleKeys: readonly ModuleKey[];
  primaryNav: RoutePrimaryNav;
  backBehavior: RouteBackBehavior;
  breadcrumbRoot: string | null;
  requiresBranchId: boolean;
}

export const ROUTE_FAMILY_CONTRACTS = [
  {
    id: "public",
    label: "Public",
    surface: "public",
    entryPath: "/login",
    matchPrefixes: [
      "/login",
      "/access-denied",
      "/api/health",
      "/api/webhooks",
      "/manifest.webmanifest",
      "/sw.js",
      "/r",
      "/api/feedback",
    ],
    moduleKeys: [],
    primaryNav: "none",
    backBehavior: "none",
    breadcrumbRoot: null,
    requiresBranchId: false,
  },
  {
    id: "owner",
    label: APP_COPY_VI.ownerTitle,
    surface: "owner",
    entryPath: "/",
    matchPrefixes: ["/"],
    moduleKeys: ["owner"],
    primaryNav: "owner-sidebar",
    backBehavior: "none",
    breadcrumbRoot: APP_COPY_VI.ownerTitle,
    requiresBranchId: false,
  },
  {
    id: "settings",
    label: MODULE_ACL.settings.label,
    surface: "owner",
    entryPath: MODULE_ACL.settings.path,
    matchPrefixes: [MODULE_ACL.settings.path],
    moduleKeys: ["settings"],
    primaryNav: "owner-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: APP_COPY_VI.ownerTitle,
    requiresBranchId: false,
  },
  {
    id: "menu",
    label: MODULE_ACL.menu.label,
    surface: "owner",
    entryPath: MODULE_ACL.menu.path,
    matchPrefixes: [MODULE_ACL.menu.path],
    moduleKeys: ["menu"],
    primaryNav: "owner-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: APP_COPY_VI.ownerTitle,
    requiresBranchId: false,
  },
  {
    id: "orders",
    label: MODULE_ACL.orders.label,
    surface: "owner",
    entryPath: MODULE_ACL.orders.path,
    matchPrefixes: [MODULE_ACL.orders.path],
    moduleKeys: ["orders"],
    primaryNav: "owner-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: APP_COPY_VI.ownerTitle,
    requiresBranchId: false,
  },
  {
    id: "feedback",
    label: MODULE_ACL.feedback.label,
    surface: "owner",
    entryPath: MODULE_ACL.feedback.path,
    matchPrefixes: [MODULE_ACL.feedback.path],
    moduleKeys: ["feedback"],
    primaryNav: "owner-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: APP_COPY_VI.ownerTitle,
    requiresBranchId: false,
  },
  {
    id: "inventory",
    label: MODULE_ACL.inventory.label,
    surface: "owner",
    entryPath: MODULE_ACL.inventory.path,
    // MODULE_ACL.inventory.path ("/inventory") prefix-matches every
    // /inventory/* sub-route already; the INVENTORY_ROUTE_PREFIXES spread
    // here was fully redundant (D058 W3).
    matchPrefixes: [MODULE_ACL.inventory.path],
    moduleKeys: ["inventory", "inventory_operations"],
    primaryNav: "owner-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: APP_COPY_VI.ownerTitle,
    requiresBranchId: false,
  },
  {
    id: "finance",
    label: MODULE_ACL.finance.label,
    surface: "owner",
    entryPath: MODULE_ACL.finance.path,
    matchPrefixes: [MODULE_ACL.finance.path],
    moduleKeys: ["finance"],
    primaryNav: "owner-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: APP_COPY_VI.ownerTitle,
    requiresBranchId: false,
  },
  {
    id: "branches",
    label: MODULE_ACL.branches.label,
    surface: "owner",
    entryPath: MODULE_ACL.branches.path,
    matchPrefixes: [MODULE_ACL.branches.path],
    moduleKeys: ["branches"],
    primaryNav: "owner-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: APP_COPY_VI.ownerTitle,
    requiresBranchId: false,
  },
  {
    id: "hr",
    label: MODULE_ACL.hr.label,
    surface: "owner",
    entryPath: MODULE_ACL.hr.path,
    matchPrefixes: [MODULE_ACL.hr.path],
    moduleKeys: ["hr", "hr_payroll", "staff"],
    primaryNav: "owner-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: APP_COPY_VI.ownerTitle,
    requiresBranchId: false,
  },
  {
    id: "notifications",
    label: MODULE_ACL.notifications.label,
    surface: "utility",
    entryPath: MODULE_ACL.notifications.path,
    matchPrefixes: [MODULE_ACL.notifications.path],
    moduleKeys: ["notifications"],
    primaryNav: "none",
    backBehavior: "role-home",
    breadcrumbRoot: null,
    requiresBranchId: false,
  },
  {
    id: "self",
    label: MODULE_ACL.me.label,
    surface: "self",
    entryPath: MODULE_ACL.me.path,
    matchPrefixes: [MODULE_ACL.me.path],
    moduleKeys: ["me"],
    primaryNav: "owner-sidebar",
    backBehavior: "in-flow",
    breadcrumbRoot: null,
    requiresBranchId: false,
  },
  {
    id: "branch-home",
    label: MODULE_ACL.branch_home.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]",
    matchPrefixes: ["/br/[branchId]"],
    moduleKeys: ["branch_home"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    // Full-page checkout queue (Team hub links here; legacy `?tab=checkouts`
    // redirects to this route). Breadcrumb root is branch management.
    id: "branch-shift-checkout-approvals",
    label: MODULE_ACL.employee_checkout_approvals.label,
    surface: "branch_management",
    entryPath: "/br/[branchId]/shift/checkout-approvals",
    matchPrefixes: ["/br/[branchId]/shift/checkout-approvals"],
    moduleKeys: ["employee_checkout_approvals"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchManagement,
    requiresBranchId: true,
  },
  {
    // Full-page leave queue (legacy Team `?tab=leaves` redirects here).
    id: "branch-shift-leave-approvals",
    label: MODULE_ACL.employee_leave_approvals.label,
    surface: "branch_management",
    entryPath: "/br/[branchId]/shift/leave-approvals",
    matchPrefixes: ["/br/[branchId]/shift/leave-approvals"],
    moduleKeys: ["employee_leave_approvals"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchManagement,
    requiresBranchId: true,
  },
  {
    // Full-page weekly roster (legacy Team `?tab=roster` redirects here).
    id: "branch-shift-roster",
    label: MODULE_ACL.branch_shift_roster.label,
    surface: "branch_management",
    entryPath: "/br/[branchId]/shift/roster",
    matchPrefixes: ["/br/[branchId]/shift/roster"],
    moduleKeys: ["branch_shift_roster"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchManagement,
    requiresBranchId: true,
  },
  {
    // Full-page attendance table (legacy Team `?tab=attendance` redirects here).
    id: "branch-shift-attendance",
    label: MODULE_ACL.branch_shift_attendance.label,
    surface: "branch_management",
    entryPath: "/br/[branchId]/shift/attendance",
    matchPrefixes: ["/br/[branchId]/shift/attendance"],
    moduleKeys: ["branch_shift_attendance"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchManagement,
    requiresBranchId: true,
  },
  {
    id: "branch-shift",
    label: APP_COPY_VI.employeePortal,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/shift",
    matchPrefixes: ["/br/[branchId]/shift"],
    moduleKeys: ["branch_home"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "branch-profile",
    label: APP_COPY_VI.employeePortal,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/profile",
    matchPrefixes: ["/br/[branchId]/profile"],
    moduleKeys: ["branch_home"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "branch-stock",
    label: MODULE_ACL.branch_stock.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/stock",
    matchPrefixes: ["/br/[branchId]/stock"],
    moduleKeys: ["branch_stock"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "branch-orders",
    label: MODULE_ACL.branch_orders.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/orders",
    matchPrefixes: ["/br/[branchId]/orders"],
    moduleKeys: ["branch_orders"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "branch-menu-limits",
    label: MODULE_ACL.branch_menu_limits.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/menu-limits",
    matchPrefixes: ["/br/[branchId]/menu-limits"],
    moduleKeys: ["branch_menu_limits"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "branch-pos-sessions",
    label: MODULE_ACL.branch_pos_sessions.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/pos-sessions",
    matchPrefixes: ["/br/[branchId]/pos-sessions"],
    moduleKeys: ["branch_pos_sessions"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "branch-close-day",
    label: MODULE_ACL.branch_close_day.label,
    surface: "branch_management",
    entryPath: "/br/[branchId]/close-day",
    matchPrefixes: ["/br/[branchId]/close-day"],
    moduleKeys: ["branch_close_day"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchManagement,
    requiresBranchId: true,
  },
  {
    id: "branch-settings",
    label: MODULE_ACL.branch_settings.label,
    surface: "branch_management",
    entryPath: "/br/[branchId]/settings",
    matchPrefixes: ["/br/[branchId]/settings"],
    moduleKeys: ["branch_settings"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchManagement,
    requiresBranchId: true,
  },
  {
    id: "branch-dashboard",
    label: MODULE_ACL.branch_dashboard.label,
    surface: "branch_management",
    entryPath: "/br/[branchId]/dashboard",
    matchPrefixes: ["/br/[branchId]/dashboard"],
    moduleKeys: ["branch_dashboard"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchManagement,
    requiresBranchId: true,
  },
  {
    id: "branch-team",
    label: MODULE_ACL.branch_team.label,
    surface: "branch_management",
    entryPath: "/br/[branchId]/team",
    matchPrefixes: ["/br/[branchId]/team"],
    moduleKeys: ["branch_team"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchManagement,
    requiresBranchId: true,
  },
  {
    id: "branch-feedback",
    label: MODULE_ACL.branch_feedback.label,
    surface: "branch_management",
    entryPath: "/br/[branchId]/feedback",
    matchPrefixes: ["/br/[branchId]/feedback"],
    moduleKeys: ["branch_feedback"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchManagement,
    requiresBranchId: true,
  },
  {
    id: "pos",
    label: MODULE_ACL.pos.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/pos",
    matchPrefixes: ["/br/[branchId]/pos"],
    moduleKeys: ["pos"],
    primaryNav: "operational-chrome",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "kds",
    label: MODULE_ACL.kds.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/kds",
    matchPrefixes: ["/br/[branchId]/kds"],
    moduleKeys: ["kds"],
    primaryNav: "operational-chrome",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "pickup",
    label: MODULE_ACL.pickup.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/pickup",
    matchPrefixes: ["/br/[branchId]/pickup"],
    moduleKeys: ["pickup"],
    primaryNav: "operational-chrome",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
] as const satisfies readonly RouteFamilyContract[];

function normalizeRoutePath(pathname: string): string {
  return pathname.split(/[?#]/, 1)[0] || "/";
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  if (prefix.includes("[branchId]")) {
    const expression = escapeRegex(prefix).replace("\\[branchId\\]", "\\d+");
    if (prefix === "/br/[branchId]") {
      return new RegExp(`^${expression}/?$`).test(pathname);
    }
    return new RegExp(`^${expression}(?:/|$)`).test(pathname);
  }

  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveRouteFamilyContract(
  pathname: string,
): RouteFamilyContract | null {
  const normalizedPathname = normalizeRoutePath(pathname);
  const publicFamily =
    ROUTE_FAMILY_CONTRACTS.find((family) => family.id === "public") ?? null;

  if (isPublicAppPath(normalizedPathname) || normalizedPathname === "/login") {
    return publicFamily;
  }

  if (!resolveModuleFromPath(normalizedPathname)) {
    return null;
  }

  return (
    ROUTE_FAMILY_CONTRACTS.find((family) =>
      family.matchPrefixes.some((prefix) =>
        matchesRoutePrefix(normalizedPathname, prefix),
      ),
    ) ?? null
  );
}
