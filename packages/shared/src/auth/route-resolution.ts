import type { ModuleKey } from "./module-acl";

export const PUBLIC_APP_PATHS = ["/api/health", "/api/webhooks", "/sw.js"] as const;

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

export function resolveModuleFromPath(pathname: string): ModuleKey | null {
  if (pathname.startsWith("/admin/dashboard")) return "dashboard";
  if (pathname.startsWith("/admin/menu")) return "menu";
  if (pathname.startsWith("/admin/orders")) return "orders";
  if (pathname.startsWith("/admin/staff")) return "staff";
  if (pathname.startsWith("/admin/crm")) return "crm";
  if (pathname.startsWith("/admin/finance")) return "finance";
  if (pathname.startsWith("/admin/reports")) return "reports";
  if (pathname.startsWith("/admin/settings")) return "settings";

  for (const prefix of INVENTORY_PROCUREMENT_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return "inventory_procurement";
    }
  }

  if (pathname.startsWith("/inventory")) return "inventory";
  if (pathname.startsWith("/hr")) return "hr";
  if (/^\/br\/\d+\/pos/.test(pathname)) return "pos";
  if (/^\/br\/\d+\/kds/.test(pathname)) return "kds";
  if (pathname.startsWith("/employee")) return "employee";

  return null;
}
