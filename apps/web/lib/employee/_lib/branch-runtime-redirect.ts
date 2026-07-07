import {
  canAccess,
  isAdminRole,
  type JwtClaims,
} from "@comtammatu/shared/auth";

type BranchRuntimeRoute =
  | "home"
  | "shiftClock"
  | "shiftTasks"
  | "shiftSchedule"
  | "profile"
  | "scheduleLeave"
  | "profilePayslip"
  | "stockCount"
  | "checkoutApprovals";

const BRANCH_RUNTIME_PATHS = {
  home: "",
  shiftClock: "/shift/clock",
  shiftTasks: "/shift",
  shiftSchedule: "/shift/schedule",
  profile: "/profile",
  scheduleLeave: "/shift/schedule/leave",
  profilePayslip: "/profile/payslip",
  stockCount: "/stock/count",
  checkoutApprovals: "/shift/checkout-approvals",
} satisfies Record<BranchRuntimeRoute, string>;

// Old /employee entrypoints and their branch-runtime equivalents. The proxy
// consumes this map so redirects happen before pages render; checkout-approvals
// redirects for every operator_home role — the destination's own
// employee_checkout_approvals ACL (owner+branch_manager) rejects cashier/chef
// on the follow-up request.
const LEGACY_EMPLOYEE_ROUTES: Record<string, BranchRuntimeRoute> = {
  "/employee": "home",
  "/employee/clock": "shiftClock",
  "/employee/tasks": "shiftTasks",
  "/employee/schedule": "shiftSchedule",
  "/employee/attendance": "shiftSchedule",
  "/employee/profile": "profile",
  "/employee/leave": "scheduleLeave",
  "/employee/payslip": "profilePayslip",
  "/employee/permissions": "profile",
  "/employee/count": "stockCount",
  "/employee/checkout-approvals": "checkoutApprovals",
};

export function resolveEmployeeBranchRuntimePath(
  claims: JwtClaims,
  route: BranchRuntimeRoute,
  homeBranchId?: number | null,
): string | null {
  if (claims.user_role === "office" && claims.branch_id == null) {
    return "/finance";
  }

  if (!canAccess(claims.user_role, "operator_home")) {
    return claims.user_role === "office" ? "/finance" : null;
  }

  if (claims.branch_id == null) {
    if (isAdminRole(claims.user_role)) return "/br";
    // Central-site roles (D055 §1) carry no branch claim; callers resolve
    // their home site via resolveCentralSiteHomeBranchId.
    if (homeBranchId == null) return null;
    return `/br/${homeBranchId}${BRANCH_RUNTIME_PATHS[route]}`;
  }

  return `/br/${claims.branch_id}${BRANCH_RUNTIME_PATHS[route]}`;
}

export function resolveLegacyEmployeeBranchRuntimePath(
  claims: JwtClaims,
  pathname: string,
  homeBranchId?: number | null,
): string | null {
  const route = LEGACY_EMPLOYEE_ROUTES[pathname];
  if (!route) return null;
  return resolveEmployeeBranchRuntimePath(claims, route, homeBranchId);
}

export function appendSearchParams(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) searchParams.set(key, value);
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}
