import type { ModuleKey } from "./module-acl";

export const PUBLIC_APP_PATHS = [
  "/api/health",
  "/api/webhooks",
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
  "/inventory/m/drafts",
  "/inventory/m/grn",
] as const;

export function isPublicAppPath(pathname: string): boolean {
  if (pathname.startsWith("/swe-worker-")) return true;
  if (pathname.startsWith("/demo/")) return true;
  if (/^\/br\/\d+\/pos\/manifest\.webmanifest$/.test(pathname)) return true;
  // /r/ prefix — public QR feedback submission pages (no auth required)
  if (pathname.startsWith("/r/")) return true;

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

export function isAdminRoutePath(pathname: string): boolean {
  const resolvedPathname = stripBetaPrefix(pathname);
  return resolvedPathname === "/admin" || resolvedPathname.startsWith("/admin/");
}

export function resolveModuleFromPath(pathname: string): ModuleKey | null {
  const resolvedPathname = stripBetaPrefix(pathname);

  if (resolvedPathname === "/admin" || resolvedPathname === "/admin/") {
    return "dashboard";
  }
  if (resolvedPathname.startsWith("/admin/dashboard")) return "dashboard";
  if (resolvedPathname.startsWith("/admin/staff")) return "staff";
  if (resolvedPathname.startsWith("/admin/crm")) return "crm";
  if (resolvedPathname.startsWith("/admin/reports")) return "reports";
  if (resolvedPathname.startsWith("/admin/settings")) return "settings";
  if (resolvedPathname.startsWith("/admin/inventory")) return "inventory_admin";
  if (resolvedPathname.startsWith("/admin/accounting")) return "accounting";
  if (resolvedPathname.startsWith("/admin/feedback")) return "feedback";

  for (const prefix of INVENTORY_PROCUREMENT_PREFIXES) {
    if (resolvedPathname === prefix || resolvedPathname.startsWith(`${prefix}/`)) {
      return "inventory_procurement";
    }
  }

  if (resolvedPathname.startsWith("/inventory")) return "inventory";
  if (resolvedPathname.startsWith("/finance")) return "finance";
  if (resolvedPathname.startsWith("/menu")) return "menu";
  if (resolvedPathname.startsWith("/orders")) return "orders";
  if (resolvedPathname.startsWith("/hr")) return "hr";
  if (/^\/br\/\d+\/settings/.test(resolvedPathname)) return "branch_settings";
  if (/^\/br\/\d+\/menu-limits/.test(resolvedPathname)) return "branch_menu_limits";
  if (/^\/br\/\d+\/pos/.test(resolvedPathname)) return "pos";
  if (/^\/br\/\d+\/kds/.test(resolvedPathname)) return "kds";
  if (resolvedPathname.startsWith("/employee")) return "employee";
  if (resolvedPathname.startsWith("/notifications")) return "notifications";

  return null;
}
