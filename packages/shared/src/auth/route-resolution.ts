import type { ModuleKey } from "./module-acl";

export const PUBLIC_APP_PATHS = [
  "/api/health",
  "/api/webhooks",
  "/brand",
  "/manifest.webmanifest",
  "/sw.js",
  "/access-denied",
  "/payment/momo/return",
  "/q",
  "/api/self-order",
] as const;

export const INVENTORY_PROCUREMENT_PREFIXES = [
  "/inventory/ingredients",
  "/inventory/settings",
  "/inventory/suppliers",
  "/inventory/purchase-orders",
  "/inventory/grn",
  "/inventory/supplier-invoices",
  "/inventory/recipes",
] as const;

// Entries already matched by INVENTORY_PROCUREMENT_PREFIXES (checked first in
// resolveModuleFromPath) are omitted here — they would never be reached.
export const INVENTORY_ROUTE_PREFIXES = [
  "/inventory/dashboard",
  "/inventory/consumption",
  "/inventory/count-assignments",
  "/inventory/count-slips",
  "/inventory/drafts",
  "/inventory/issues",
  "/inventory/operations",
  "/inventory/production",
  "/inventory/reports",
  "/inventory/stock",
  "/inventory/stocktake",
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
  // Operational PWA manifests (hub `/br/{id}`, plus pos/kds/runner stations).
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

export function isAdminRoutePath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function resolveModuleFromPath(pathname: string): ModuleKey | null {
  if (pathname === "/admin" || pathname === "/admin/") {
    return "settings";
  }
  if (pathname.startsWith("/admin/settings")) return "settings";

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
  if (pathname === "/" || pathname === "/br" || pathname === "/br/")
    return "branch_picker";
  if (/^\/br\/\d+\/?$/.test(pathname)) return "operator_home";
  // checkout-approvals gets its own module key (D058 §5) — must precede the
  // generic /shift prefix match below so cashier/chef fail the route gate.
  if (/^\/br\/\d+\/shift\/checkout-approvals(?:\/|$)/.test(pathname)) {
    return "employee_checkout_approvals";
  }
  // leave-approvals gets its own module key (D059 §4) for the same reason —
  // must precede the generic /shift prefix match below.
  if (/^\/br\/\d+\/shift\/leave-approvals(?:\/|$)/.test(pathname)) {
    return "employee_leave_approvals";
  }
  if (/^\/br\/\d+\/shift/.test(pathname)) return "operator_home";
  if (/^\/br\/\d+\/profile/.test(pathname)) return "operator_home";
  if (/^\/br\/\d+\/stock\/count(?:\/|$)/.test(pathname)) return "operator_home";
  if (/^\/br\/\d+\/stock/.test(pathname)) return "inventory";
  if (/^\/br\/\d+\/orders/.test(pathname)) return "orders";
  if (/^\/br\/\d+\/dashboard/.test(pathname)) return "branch_dashboard";
  if (/^\/br\/\d+\/team/.test(pathname)) return "branch_team";
  if (/^\/br\/\d+\/menu-limits(?:\/|$)/.test(pathname))
    return "branch_menu_limits";
  if (/^\/br\/\d+\/settings\/menu-limits(?:\/|$)/.test(pathname)) return null;
  if (/^\/br\/\d+\/pos-sessions(?:\/|$)/.test(pathname))
    return "branch_pos_sessions";
  if (/^\/br\/\d+\/settings\/pos-sessions(?:\/|$)/.test(pathname)) return null;
  if (/^\/br\/\d+\/settings/.test(pathname)) return "branch_settings";
  if (/^\/br\/\d+\/pos(?:\/|$)/.test(pathname)) return "pos";
  if (/^\/br\/\d+\/kds(?:\/|$)/.test(pathname)) return "kds";
  if (/^\/br\/\d+\/runner(?:\/|$)/.test(pathname)) return "runner";
  if (pathname.startsWith("/notifications")) return "notifications";

  return null;
}
