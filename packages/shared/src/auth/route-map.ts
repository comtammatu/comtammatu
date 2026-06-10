import { APP_COPY_VI, NAV_GROUP_LABELS_VI } from "../labels";
import { MODULE_ACL, type ModuleKey } from "./module-acl";
import {
  INVENTORY_ROUTE_PREFIXES,
  isPublicAppPath,
  resolveLegacyRouteRedirectPath,
  resolveModuleFromPath,
  stripBetaPrefix,
} from "./route-resolution";

export type RouteSurface =
  | "admin"
  | "workspace"
  | "branch_operation"
  | "employee"
  | "public";

export type RoutePrimaryNav =
  | "admin-sidebar"
  | "workspace-sidebar"
  | "employee-bottom-nav"
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
    id: "employee",
    label: MODULE_ACL.employee.label,
    surface: "employee",
    entryPath: MODULE_ACL.employee.path,
    matchPrefixes: [MODULE_ACL.employee.path],
    moduleKeys: ["employee"],
    primaryNav: "employee-bottom-nav",
    backBehavior: "in-flow",
    breadcrumbRoot: MODULE_ACL.employee.label,
    requiresBranchId: false,
  },
  {
    id: "admin",
    label: APP_COPY_VI.adminSurface,
    surface: "admin",
    entryPath: MODULE_ACL.dashboard.path,
    matchPrefixes: ["/admin"],
    moduleKeys: [
      "dashboard",
      "staff",
      "reports",
      "settings",
      "accounting",
    ],
    primaryNav: "admin-sidebar",
    backBehavior: "none",
    breadcrumbRoot: APP_COPY_VI.adminSurface,
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
    matchPrefixes: [MODULE_ACL.inventory.path, ...INVENTORY_ROUTE_PREFIXES],
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
    id: "hr",
    label: MODULE_ACL.hr.label,
    surface: "workspace",
    entryPath: MODULE_ACL.hr.path,
    matchPrefixes: [MODULE_ACL.hr.path],
    moduleKeys: ["hr", "hr_payroll"],
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
    id: "branch-settings",
    label: MODULE_ACL.branch_settings.label,
    surface: "branch_operation",
    entryPath: "/br/[branchId]/settings",
    matchPrefixes: ["/br/[branchId]/settings"],
    moduleKeys: ["branch_settings"],
    primaryNav: "operational-chrome",
    backBehavior: "role-home",
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
    primaryNav: "operational-chrome",
    backBehavior: "role-home",
    breadcrumbRoot: NAV_GROUP_LABELS_VI.branchOperations,
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
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  const legacyRedirectPath = resolveLegacyRouteRedirectPath(pathOnly);
  return stripBetaPrefix(legacyRedirectPath ?? pathOnly);
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  if (prefix.includes("[branchId]")) {
    const expression = escapeRegex(prefix).replace("\\[branchId\\]", "\\d+");
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

  if (
    isPublicAppPath(normalizedPathname) ||
    normalizedPathname === "/login" ||
    normalizedPathname === "/beta/login"
  ) {
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
