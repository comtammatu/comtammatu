import { APP_COPY_VI, NAV_GROUP_LABELS_VI } from "../labels";
import { MODULE_ACL, type ModuleKey } from "./module-acl";
import { isPublicAppPath, resolveModuleFromPath } from "./route-resolution";

export type RouteSurface =
  | "admin"
  | "workspace"
  | "branch_management"
  | "branch_operation"
  | "public";

export type RoutePrimaryNav =
  | "admin-sidebar"
  | "workspace-sidebar"
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
      "/payment/momo",
      "/api/health",
      "/api/webhooks",
      "/manifest.webmanifest",
      "/sw.js",
    ],
    moduleKeys: [],
    primaryNav: "none",
    backBehavior: "none",
    breadcrumbRoot: null,
    requiresBranchId: false,
  },
  {
    id: "admin",
    label: APP_COPY_VI.settingsLabel,
    surface: "admin",
    entryPath: MODULE_ACL.settings.path,
    matchPrefixes: ["/admin"],
    moduleKeys: ["settings"],
    primaryNav: "admin-sidebar",
    backBehavior: "none",
    breadcrumbRoot: APP_COPY_VI.settingsLabel,
    requiresBranchId: false,
  },
  {
    id: "menu",
    label: MODULE_ACL.menu.label,
    surface: "workspace",
    entryPath: MODULE_ACL.menu.path,
    matchPrefixes: [MODULE_ACL.menu.path],
    moduleKeys: ["menu"],
    primaryNav: "workspace-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.workspaces,
    requiresBranchId: false,
  },
  {
    id: "orders",
    label: MODULE_ACL.orders.label,
    surface: "workspace",
    entryPath: MODULE_ACL.orders.path,
    matchPrefixes: [MODULE_ACL.orders.path],
    moduleKeys: ["orders"],
    primaryNav: "workspace-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.workspaces,
    requiresBranchId: false,
  },
  {
    id: "inventory",
    label: MODULE_ACL.inventory.label,
    surface: "workspace",
    entryPath: MODULE_ACL.inventory.path,
    // MODULE_ACL.inventory.path ("/inventory") prefix-matches every
    // /inventory/* sub-route already; the INVENTORY_ROUTE_PREFIXES spread
    // here was fully redundant (D058 W3).
    matchPrefixes: [MODULE_ACL.inventory.path],
    moduleKeys: ["inventory", "inventory_procurement"],
    primaryNav: "workspace-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.workspaces,
    requiresBranchId: false,
  },
  {
    id: "finance",
    label: MODULE_ACL.finance.label,
    surface: "workspace",
    entryPath: MODULE_ACL.finance.path,
    matchPrefixes: [MODULE_ACL.finance.path],
    moduleKeys: ["finance"],
    primaryNav: "workspace-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.workspaces,
    requiresBranchId: false,
  },
  {
    id: "branches",
    label: MODULE_ACL.branches.label,
    surface: "workspace",
    entryPath: MODULE_ACL.branches.path,
    matchPrefixes: [MODULE_ACL.branches.path],
    moduleKeys: ["branches"],
    primaryNav: "workspace-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.workspaces,
    requiresBranchId: false,
  },
  {
    id: "hr",
    label: MODULE_ACL.hr.label,
    surface: "workspace",
    entryPath: MODULE_ACL.hr.path,
    matchPrefixes: [MODULE_ACL.hr.path],
    moduleKeys: ["hr", "hr_payroll", "staff"],
    primaryNav: "workspace-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.workspaces,
    requiresBranchId: false,
  },
  {
    id: "notifications",
    label: MODULE_ACL.notifications.label,
    surface: "workspace",
    entryPath: MODULE_ACL.notifications.path,
    matchPrefixes: [MODULE_ACL.notifications.path],
    moduleKeys: ["notifications"],
    primaryNav: "workspace-sidebar",
    backBehavior: "role-home",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.workspaces,
    requiresBranchId: false,
  },
  {
    id: "branch-picker",
    label: MODULE_ACL.branch_picker.label,
    surface: "branch_operation",
    entryPath: MODULE_ACL.branch_picker.path,
    matchPrefixes: ["/br"],
    moduleKeys: ["branch_picker"],
    primaryNav: "none",
    backBehavior: "role-home",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: false,
  },
  {
    id: "operator-home",
    label: MODULE_ACL.operator_home.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]",
    matchPrefixes: ["/br/[branchId]", "/br/[branchId]/more"],
    moduleKeys: ["operator_home"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    // First-match: checkout-approvals is re-keyed to its own module (D058 §5),
    // so it MUST precede the broader operator-shift family or that
    // less-specific prefix wins.
    id: "operator-shift-checkout-approvals",
    label: MODULE_ACL.employee_checkout_approvals.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/shift/checkout-approvals",
    matchPrefixes: ["/br/[branchId]/shift/checkout-approvals"],
    moduleKeys: ["employee_checkout_approvals"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    // First-match: leave-approvals is re-keyed to its own module (D059 §4),
    // so it MUST precede the broader operator-shift family or that
    // less-specific prefix wins.
    id: "operator-shift-leave-approvals",
    label: MODULE_ACL.employee_leave_approvals.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/shift/leave-approvals",
    matchPrefixes: ["/br/[branchId]/shift/leave-approvals"],
    moduleKeys: ["employee_leave_approvals"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "operator-shift",
    label: APP_COPY_VI.employeePortal,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/shift",
    matchPrefixes: ["/br/[branchId]/shift"],
    moduleKeys: ["operator_home"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "operator-profile",
    label: APP_COPY_VI.employeePortal,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/profile",
    matchPrefixes: ["/br/[branchId]/profile"],
    moduleKeys: ["operator_home"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "operator-stock",
    label: MODULE_ACL.inventory.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/stock",
    matchPrefixes: ["/br/[branchId]/stock"],
    moduleKeys: ["inventory"],
    primaryNav: "operator-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
    requiresBranchId: true,
  },
  {
    id: "operator-orders",
    label: MODULE_ACL.orders.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/orders",
    matchPrefixes: ["/br/[branchId]/orders"],
    moduleKeys: ["orders"],
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
    id: "runner",
    label: MODULE_ACL.runner.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/runner",
    matchPrefixes: ["/br/[branchId]/runner"],
    moduleKeys: ["runner"],
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
  if (prefix === "/br") {
    return pathname === "/br" || pathname === "/br/";
  }

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
