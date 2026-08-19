import type { ModuleKey } from "./module-acl";

export const PUBLIC_APP_PATHS = [
  "/api/health",
  "/api/webhooks",
  "/brand",
  "/manifest.webmanifest",
  "/me/manifest.webmanifest",
  "/sw.js",
  "/offline",
  "/access-denied",
  "/q",
  "/api/self-order",
  "/r",
  "/api/feedback",
] as const;

export const INVENTORY_PROCUREMENT_PREFIXES = [
  "/inventory/purchase-requests",
  "/inventory/purchase-orders",
  "/inventory/grn",
] as const;

// Entries already matched by INVENTORY_PROCUREMENT_PREFIXES (checked first in
// resolveModuleFromPath) are omitted here — they would never be reached.
export const INVENTORY_ROUTE_PREFIXES = [
  "/inventory/consumption",
  "/inventory/count-assignments",
  "/inventory/count-slips",
  "/inventory/ingredients",
  "/inventory/issues",
  "/inventory/menu-recipes",
  "/inventory/production",
  // Compatibility alias redirects to `/inventory/menu-recipes`.
  "/inventory/recipes",
  "/inventory/reports",
  "/inventory/settings",
  "/inventory/stock",
  "/inventory/stocktake",
  "/inventory/stock-requests",
  "/inventory/supplier-invoices",
  "/inventory/suppliers",
  "/inventory/transfers",
  "/inventory/waste",
] as const;

export const OWNER_ROUTE_PREFIXES = [
  "/",
  "/settings",
  "/menu",
  "/promotions",
  "/orders",
  "/feedback",
  "/inventory",
  "/finance",
  "/branches",
  "/hr",
] as const;

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Guest-facing pickup board (`Gọi số`) — public read-only display. */
export function isPickupPublicDisplayPath(pathname: string): boolean {
  return /^\/br\/\d+\/pickup\/?$/.test(pathname);
}

/**
 * Retired staff-runner URL. Canonical guest board is `/br/{id}/pickup`.
 * Proxy 308s these to pickup so old bookmarks never hit the staff layout.
 */
export function rewriteRetiredRunnerPath(pathname: string): string | null {
  const match = pathname.match(/^\/br\/(\d+)\/runner(?:\/|$)/);
  const branchId = match?.[1];
  if (!branchId) return null;
  return `/br/${branchId}/pickup`;
}

export function isPublicAppPath(pathname: string): boolean {
  if (pathname.startsWith("/swe-worker-")) return true;
  if (pathname.startsWith("/demo/")) return true;
  // Operational + personnel PWA manifests. Browsers fetch
  // `<link rel="manifest">` without credentials, so a gated manifest 302s to
  // /login and the PWA becomes uninstallable. The body is name/icons/colors
  // only. `/me/manifest.webmanifest` is listed in PUBLIC_APP_PATHS.
  if (
    /^\/br\/\d+\/(?:(?:pos|kds|pickup)\/)?manifest\.webmanifest$/.test(
      pathname,
    )
  ) {
    return true;
  }
  if (isPickupPublicDisplayPath(pathname)) return true;

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
    if (matchesPathPrefix(pathname, prefix)) return "inventory_operations";
  }
  if (matchesPathPrefix(pathname, "/finance")) return "finance";
  if (matchesPathPrefix(pathname, "/branches")) return "branches";
  if (matchesPathPrefix(pathname, "/menu")) return "menu";
  if (matchesPathPrefix(pathname, "/promotions")) return "promotions";
  if (matchesPathPrefix(pathname, "/orders")) return "orders";
  if (matchesPathPrefix(pathname, "/feedback")) return "feedback";
  if (matchesPathPrefix(pathname, "/work")) return "work";
  if (matchesPathPrefix(pathname, "/hr/staff")) return "staff";
  if (matchesPathPrefix(pathname, "/hr/payroll")) return "hr_payroll";
  if (matchesPathPrefix(pathname, "/hr")) return "hr";
  if (matchesPathPrefix(pathname, "/me")) return "me";
  if (/^\/br\/\d+\/?$/.test(pathname)) return "branch_home";
  // Team children and Class C `/shift/*` shims must precede generic `/team`
  // and personal `/shift` so only explicit approver/roster roles pass.
  if (
    /^\/br\/\d+\/(?:team|shift)\/checkout-approvals(?:\/|$)/.test(pathname)
  ) {
    return "employee_checkout_approvals";
  }
  if (/^\/br\/\d+\/(?:team|shift)\/leave-approvals(?:\/|$)/.test(pathname)) {
    return "employee_leave_approvals";
  }
  if (/^\/br\/\d+\/(?:team|shift)\/roster(?:\/|$)/.test(pathname)) {
    return "branch_shift_roster";
  }
  if (/^\/br\/\d+\/(?:team|shift)\/attendance(?:\/|$)/.test(pathname)) {
    return "branch_shift_attendance";
  }
  if (/^\/br\/\d+\/team(?:\/|$)/.test(pathname)) return "branch_team";
  if (/^\/br\/\d+\/shift(?:\/|$)/.test(pathname)) return "branch_home";
  if (/^\/br\/\d+\/profile(?:\/|$)/.test(pathname)) return "branch_home";
  if (/^\/br\/\d+\/stock\/count(?:\/|$)/.test(pathname)) return "branch_home";
  if (/^\/br\/\d+\/stock(?:\/|$)/.test(pathname)) return "branch_stock";
  if (/^\/br\/\d+\/orders(?:\/|$)/.test(pathname)) return "branch_orders";
  if (/^\/br\/\d+\/dashboard(?:\/|$)/.test(pathname)) return "branch_dashboard";
  if (/^\/br\/\d+\/feedback(?:\/|$)/.test(pathname)) return "branch_feedback";
  if (/^\/br\/\d+\/menu-limits(?:\/|$)/.test(pathname))
    return "branch_menu_limits";
  if (/^\/br\/\d+\/settings\/menu-limits(?:\/|$)/.test(pathname)) return null;
  if (/^\/br\/\d+\/pos-sessions(?:\/|$)/.test(pathname))
    return "branch_pos_sessions";
  if (/^\/br\/\d+\/settings\/pos-sessions(?:\/|$)/.test(pathname)) return null;
  if (/^\/br\/\d+\/close-day(?:\/|$)/.test(pathname)) return "branch_close_day";
  if (/^\/br\/\d+\/settings(?:\/|$)/.test(pathname)) return "branch_settings";
  if (/^\/br\/\d+\/pos(?:\/|$)/.test(pathname)) return "pos";
  if (/^\/br\/\d+\/kds(?:\/|$)/.test(pathname)) return "kds";
  if (/^\/br\/\d+\/pickup(?:\/|$)/.test(pathname)) return "pickup";
  if (matchesPathPrefix(pathname, "/notifications")) return "notifications";

  return null;
}
