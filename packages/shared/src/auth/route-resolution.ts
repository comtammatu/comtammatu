import type { ModuleKey } from "./module-acl";

export const PUBLIC_APP_PATHS = [
  "/api/health",
  "/api/webhooks",
  "/sw.js",
  "/access-denied",
] as const;
export const BETA_ROUTE_PREFIX = "/beta" as const;

export const INVENTORY_PROCUREMENT_PREFIXES = [
  "/inventory/suppliers",
  "/inventory/purchase-orders",
  "/inventory/grn",
  "/inventory/supplier-invoices",
  "/inventory/recipes",
  "/inventory/receiving",
] as const;

export function isPublicAppPath(pathname: string): boolean {
  if (pathname.startsWith("/swe-worker-")) return true;
  if (pathname.startsWith("/demo/")) return true;

  return PUBLIC_APP_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function isBetaPath(pathname: string): boolean {
  return pathname === BETA_ROUTE_PREFIX || pathname.startsWith(`${BETA_ROUTE_PREFIX}/`);
}

export function stripBetaPrefix(pathname: string): string {
  if (!isBetaPath(pathname)) {
    return pathname;
  }

  const stripped = pathname.slice(BETA_ROUTE_PREFIX.length);
  return stripped.length > 0 ? stripped : "/";
}

export function resolveModuleFromPath(pathname: string): ModuleKey | null {
  const resolvedPathname = stripBetaPrefix(pathname);

  if (resolvedPathname.startsWith("/admin/dashboard")) return "dashboard";
  if (resolvedPathname.startsWith("/admin/menu")) return "menu";
  if (resolvedPathname.startsWith("/admin/orders")) return "orders";
  if (resolvedPathname.startsWith("/admin/staff")) return "staff";
  if (resolvedPathname.startsWith("/admin/crm")) return "crm";
  if (resolvedPathname.startsWith("/admin/reports")) return "reports";
  if (resolvedPathname.startsWith("/admin/settings")) return "settings";

  for (const prefix of INVENTORY_PROCUREMENT_PREFIXES) {
    if (resolvedPathname === prefix || resolvedPathname.startsWith(`${prefix}/`)) {
      return "inventory_procurement";
    }
  }

  if (resolvedPathname.startsWith("/inventory")) return "inventory";
  if (resolvedPathname.startsWith("/finance")) return "finance";
  if (resolvedPathname.startsWith("/hr")) return "hr";
  if (/^\/br\/\d+\/pos/.test(resolvedPathname)) return "pos";
  if (/^\/br\/\d+\/kds/.test(resolvedPathname)) return "kds";
  if (resolvedPathname.startsWith("/employee")) return "employee";

  return null;
}
