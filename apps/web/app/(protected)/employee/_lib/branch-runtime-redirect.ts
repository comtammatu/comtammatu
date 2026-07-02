import { canAccess, type JwtClaims } from "@comtammatu/shared/auth";

type BranchRuntimeRoute =
  | "home"
  | "shiftClock"
  | "shiftTasks"
  | "shiftSchedule"
  | "profile"
  | "scheduleLeave"
  | "profilePayslip"
  | "stockCount";

const BRANCH_RUNTIME_PATHS = {
  home: "",
  shiftClock: "/shift/clock",
  shiftTasks: "/shift",
  shiftSchedule: "/shift/schedule",
  profile: "/profile",
  scheduleLeave: "/shift/schedule/leave",
  profilePayslip: "/profile/payslip",
  stockCount: "/stock/count",
} satisfies Record<BranchRuntimeRoute, string>;

export function resolveEmployeeBranchRuntimePath(
  claims: JwtClaims,
  route: BranchRuntimeRoute,
): string | null {
  if (
    claims.branch_id == null ||
    !canAccess(claims.user_role, "operator_home")
  ) {
    return null;
  }

  return `/br/${claims.branch_id}${BRANCH_RUNTIME_PATHS[route]}`;
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
