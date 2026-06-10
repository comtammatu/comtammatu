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
export const BETA_ROUTE_PREFIX = "/beta" as const;

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
  const resolvedPathname = stripBetaPrefix(pathname);
  return /^\/br\/\d+\/runner\/?$/.test(resolvedPathname);
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

export function isBetaPath(pathname: string): boolean {
  return (
    pathname === BETA_ROUTE_PREFIX ||
    pathname.startsWith(`${BETA_ROUTE_PREFIX}/`)
  );
}

export function stripBetaPrefix(pathname: string): string {
  if (!isBetaPath(pathname)) {
    return pathname;
  }

  const stripped = pathname.slice(BETA_ROUTE_PREFIX.length);
  return stripped.length > 0 ? stripped : "/";
}

export function isAdminRoutePath(pathname: string): boolean {
  const resolvedPathname = stripBetaPrefix(pathname);
  return (
    resolvedPathname === "/admin" || resolvedPathname.startsWith("/admin/")
  );
}

export function resolveLegacyRouteRedirectPath(
  pathname: string,
): string | null {
  const betaPath = isBetaPath(pathname);
  const resolvedPathname = stripBetaPrefix(pathname);

  if (
    resolvedPathname === "/admin/finance" ||
    resolvedPathname.startsWith("/admin/finance/")
  ) {
    const suffix = resolvedPathname.slice("/admin/finance".length);
    const target = `/finance${suffix}`;
    return betaPath ? `${BETA_ROUTE_PREFIX}${target}` : target;
  }

  return null;
}

export function resolveModuleFromPath(pathname: string): ModuleKey | null {
  const resolvedPathname = stripBetaPrefix(pathname);

  if (resolvedPathname === "/admin" || resolvedPathname === "/admin/") {
    return "dashboard";
  }
  if (resolvedPathname.startsWith("/admin/dashboard")) return "dashboard";
  if (resolvedPathname.startsWith("/admin/staff")) return "staff";
  if (resolvedPathname.startsWith("/admin/reports")) return "reports";
  if (resolvedPathname.startsWith("/admin/settings")) return "settings";
  // /admin/inventory/* RETIRED: pages removed; module ACL has empty allowedRoles.
  // Mapping kept so URL space resolves to access-denied via standard ACL flow
  // instead of falling through to admin-route landing redirect. See module-acl.ts.
  if (resolvedPathname.startsWith("/admin/inventory")) return "inventory_admin";
  if (resolvedPathname.startsWith("/admin/accounting")) return "accounting";

  for (const prefix of INVENTORY_PROCUREMENT_PREFIXES) {
    if (matchesPathPrefix(resolvedPathname, prefix)) {
      return "inventory_procurement";
    }
  }

  if (resolvedPathname === "/inventory") return "inventory";
  for (const prefix of INVENTORY_ROUTE_PREFIXES) {
    if (matchesPathPrefix(resolvedPathname, prefix)) return "inventory";
  }
  if (resolvedPathname.startsWith("/finance")) return "finance";
  if (resolvedPathname.startsWith("/menu")) return "menu";
  if (resolvedPathname.startsWith("/orders")) return "orders";
  if (resolvedPathname.startsWith("/hr/payroll")) return "hr_payroll";
  if (resolvedPathname.startsWith("/hr")) return "hr";
  if (/^\/br\/\d+\/settings/.test(resolvedPathname)) return "branch_settings";
  if (/^\/br\/\d+\/menu-limits/.test(resolvedPathname))
    return "branch_menu_limits";
  if (/^\/br\/\d+\/pos/.test(resolvedPathname)) return "pos";
  if (/^\/br\/\d+\/kds/.test(resolvedPathname)) return "kds";
  if (/^\/br\/\d+\/runner/.test(resolvedPathname)) return "runner";
  if (resolvedPathname.startsWith("/employee/checkout-approvals")) {
    return "employee_checkout_approvals";
  }
  if (resolvedPathname.startsWith("/employee")) return "employee";
  if (resolvedPathname.startsWith("/notifications")) return "notifications";

  return null;
}
