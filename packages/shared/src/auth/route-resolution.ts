import type { ModuleKey } from "./module-acl";

export const PUBLIC_APP_PATHS = [
  "/api/health",
  "/api/webhooks",
  "/brand",
  "/manifest.webmanifest",
  "/sw.js",
  "/access-denied",
  "/payment/momo",
] as const;

export const INVENTORY_PROCUREMENT_PREFIXES = [
  "/inventory/ingredients",
  "/inventory/settings",
  "/inventory/suppliers",
  "/inventory/purchase-orders",
  "/inventory/grn",
  "/inventory/supplier-invoices",
  "/inventory/recipes",
  "/inventory/receiving",
] as const;

export const INVENTORY_ROUTE_PREFIXES = [
  "/inventory/dashboard",
  "/inventory/consumption",
  "/inventory/count-assignments",
  "/inventory/count-slips",
  "/inventory/drafts",
  "/inventory/expiry",
  "/inventory/grn",
  "/inventory/ingredients",
  "/inventory/issues",
  "/inventory/production",
  "/inventory/purchase-orders",
  "/inventory/receiving",
  "/inventory/recipes",
  "/inventory/reports",
  "/inventory/settings",
  "/inventory/settings/categories",
  "/inventory/settings/units",
  "/inventory/stock",
  "/inventory/stocktake",
  "/inventory/supplier-invoices",
  "/inventory/supplier-returns",
  "/inventory/suppliers",
  "/inventory/transfers",
  "/inventory/waste",
] as const;

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isRunnerPublicDisplayPath(pathname: string): boolean {
  return /^\/br\/\d+\/runner\/?$/.test(pathname);
}

export function isPublicAppPath(pathname: string): boolean {
  if (pathname.startsWith("/swe-worker-")) return true;
  if (pathname.startsWith("/demo/")) return true;
  if (/^\/br\/\d+\/(?:pos|kds)\/manifest\.webmanifest$/.test(pathname)) {
    return true;
  }
  // Runner is a customer-facing read-only display, not a staff login surface.
  if (isRunnerPublicDisplayPath(pathname)) return true;

  return PUBLIC_APP_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function isAdminRoutePath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function resolveLegacyRouteRedirectPath(
  pathname: string,
): string | null {
  if (pathname === "/admin/finance" || pathname.startsWith("/admin/finance/")) {
    const suffix = pathname.slice("/admin/finance".length);
    return `/finance${suffix}`;
  }

  if (pathname === "/admin/staff" || pathname.startsWith("/admin/staff/")) {
    const suffix = pathname.slice("/admin/staff".length);
    return `/hr/staff${suffix}`;
  }

  if (
    pathname === "/admin/settings/branches" ||
    pathname.startsWith("/admin/settings/branches/")
  ) {
    const suffix = pathname.slice("/admin/settings/branches".length);
    return `/branches${suffix}`;
  }

  const branchMenuLimitsMatch = pathname.match(
    /^\/br\/(\d+)\/menu-limits(\/.*|$)/,
  );
  if (branchMenuLimitsMatch) {
    const branchId = branchMenuLimitsMatch[1];
    const suffix = branchMenuLimitsMatch[2] ?? "";
    return `/br/${branchId}/settings/menu-limits${suffix}`;
  }

  return null;
}

export function resolveModuleFromPath(pathname: string): ModuleKey | null {
  if (pathname === "/admin" || pathname === "/admin/") {
    return "dashboard";
  }
  if (pathname.startsWith("/admin/dashboard")) return "dashboard";
  if (pathname.startsWith("/admin/reports")) return "reports";
  if (pathname.startsWith("/admin/settings")) return "settings";
  // /admin/inventory/* RETIRED: pages removed; module ACL has empty allowedRoles.
  // Mapping kept so URL space resolves to access-denied via standard ACL flow
  // instead of falling through to admin-route landing redirect. See module-acl.ts.
  if (pathname.startsWith("/admin/inventory")) return "inventory_admin";

  for (const prefix of INVENTORY_PROCUREMENT_PREFIXES) {
    if (matchesPathPrefix(pathname, prefix)) {
      return "inventory_procurement";
    }
  }

  if (pathname === "/inventory") return "inventory";
  for (const prefix of INVENTORY_ROUTE_PREFIXES) {
    if (matchesPathPrefix(pathname, prefix)) return "inventory";
  }
  if (pathname.startsWith("/finance")) return "finance";
  if (pathname.startsWith("/branches")) return "branches";
  if (pathname.startsWith("/menu")) return "menu";
  if (pathname.startsWith("/orders")) return "orders";
  if (pathname.startsWith("/hr/staff")) return "staff";
  if (pathname.startsWith("/hr/payroll")) return "hr_payroll";
  if (pathname.startsWith("/hr")) return "hr";
  if (/^\/br\/\d+\/dashboard/.test(pathname)) return "branch_dashboard";
  // menu-limits lives UNDER /settings — check it BEFORE branch_settings so the
  // broader /settings prefix does not swallow the menu-limits sub-route.
  if (/^\/br\/\d+\/settings\/menu-limits/.test(pathname))
    return "branch_menu_limits";
  if (/^\/br\/\d+\/settings/.test(pathname)) return "branch_settings";
  if (/^\/br\/\d+\/pos/.test(pathname)) return "pos";
  if (/^\/br\/\d+\/kds/.test(pathname)) return "kds";
  if (/^\/br\/\d+\/runner/.test(pathname)) return "runner";
  if (pathname.startsWith("/employee/checkout-approvals")) {
    return "employee_checkout_approvals";
  }
  if (pathname.startsWith("/employee")) return "employee";
  if (pathname.startsWith("/notifications")) return "notifications";

  return null;
}
