import type { ModuleKey } from "./module-acl";

export const PUBLIC_APP_PATHS = [
  "/api/health",
  "/api/webhooks",
  "/brand",
  "/manifest.webmanifest",
  "/sw.js",
  "/access-denied",
  "/q",
  "/api/self-order",
] as const;

export const INVENTORY_PROCUREMENT_PREFIXES = [
  "/inventory/ingredients",
  "/inventory/settings",
  "/inventory/suppliers",
  "/inventory/grn",
  "/inventory/supplier-invoices",
  "/inventory/recipes",
] as const;

// Entries already matched by INVENTORY_PROCUREMENT_PREFIXES (checked first in
// resolveModuleFromPath) are omitted here — they would never be reached.
export const INVENTORY_ROUTE_PREFIXES = [
  "/inventory/consumption",
  "/inventory/count-assignments",
  "/inventory/count-slips",
  "/inventory/issues",
  "/inventory/operations",
  "/inventory/production",
  "/inventory/reports",
  "/inventory/stock",
  "/inventory/stocktake",
  "/inventory/transfers",
  "/inventory/waste",
] as const;

export const OWNER_ROUTE_PREFIXES = [
  "/",
  "/settings",
  "/menu",
  "/orders",
  "/inventory",
  "/finance",
  "/branches",
  "/hr",
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
  // Operational PWA manifests (Branch home plus POS/KDS/Runner stations).
  // Browsers fetch `<link rel="manifest">` without credentials, so a gated
  // manifest 302s to /login and the PWA becomes uninstallable. The manifest
  // body carries no sensitive data (name/icons/colors only).
  if (
    /^\/br\/\d+\/(?:(?:pos|kds|runner)\/)?manifest\.webmanifest$/.test(pathname)
  ) {
    return true;
  }
  // Runner is a customer-facing read-only display, not a staff login surface.
  if (isRunnerPublicDisplayPath(pathname)) return true;

  return PUBLIC_APP_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function isOwnerRoutePath(pathname: string): boolean {
  return OWNER_ROUTE_PREFIXES.some((prefix) =>
    matchesPathPrefix(pathname, prefix),
  );
}

export function resolveModuleFromPath(pathname: string): ModuleKey | null {
  if (pathname === "/") {
    return "owner";
  }
  if (matchesPathPrefix(pathname, "/settings")) return "settings";

  for (const prefix of INVENTORY_PROCUREMENT_PREFIXES) {
    if (matchesPathPrefix(pathname, prefix)) {
      return "inventory";
    }
  }

  if (pathname === "/inventory") return "inventory";
  for (const prefix of INVENTORY_ROUTE_PREFIXES) {
    if (matchesPathPrefix(pathname, prefix)) return "inventory";
  }
  if (matchesPathPrefix(pathname, "/finance")) return "finance";
  if (matchesPathPrefix(pathname, "/branches")) return "branches";
  if (matchesPathPrefix(pathname, "/menu")) return "menu";
  if (matchesPathPrefix(pathname, "/orders")) return "orders";
  if (matchesPathPrefix(pathname, "/hr/staff")) return "staff";
  if (matchesPathPrefix(pathname, "/hr/payroll")) return "hr_payroll";
  if (matchesPathPrefix(pathname, "/hr")) return "hr";
  if (/^\/br\/\d+\/?$/.test(pathname)) return "branch_home";
  // Approval routes use dedicated module keys and must precede the generic
  // shift prefix so only explicit approver roles pass the route gate.
  if (/^\/br\/\d+\/shift\/checkout-approvals(?:\/|$)/.test(pathname)) {
    return "employee_checkout_approvals";
  }
  if (/^\/br\/\d+\/shift\/leave-approvals(?:\/|$)/.test(pathname)) {
    return "employee_leave_approvals";
  }
  if (/^\/br\/\d+\/shift(?:\/|$)/.test(pathname)) return "branch_home";
  if (/^\/br\/\d+\/profile(?:\/|$)/.test(pathname)) return "branch_home";
  if (/^\/br\/\d+\/stock\/count(?:\/|$)/.test(pathname)) return "branch_home";
  if (/^\/br\/\d+\/stock(?:\/|$)/.test(pathname)) return "branch_stock";
  if (/^\/br\/\d+\/orders(?:\/|$)/.test(pathname)) return "branch_orders";
  if (/^\/br\/\d+\/dashboard(?:\/|$)/.test(pathname)) return "branch_dashboard";
  if (/^\/br\/\d+\/team(?:\/|$)/.test(pathname)) return "branch_team";
  if (/^\/br\/\d+\/menu-limits(?:\/|$)/.test(pathname))
    return "branch_menu_limits";
  if (/^\/br\/\d+\/settings\/menu-limits(?:\/|$)/.test(pathname)) return null;
  if (/^\/br\/\d+\/pos-sessions(?:\/|$)/.test(pathname))
    return "branch_pos_sessions";
  if (/^\/br\/\d+\/settings\/pos-sessions(?:\/|$)/.test(pathname)) return null;
  if (/^\/br\/\d+\/settings(?:\/|$)/.test(pathname)) return "branch_settings";
  if (/^\/br\/\d+\/pos(?:\/|$)/.test(pathname)) return "pos";
  if (/^\/br\/\d+\/kds(?:\/|$)/.test(pathname)) return "kds";
  if (/^\/br\/\d+\/runner(?:\/|$)/.test(pathname)) return "runner";
  if (matchesPathPrefix(pathname, "/notifications")) return "notifications";

  return null;
}
