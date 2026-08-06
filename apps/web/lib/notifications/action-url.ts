import {
  getSafeInternalReturnTo,
  resolvePostLoginRedirect,
  type JwtClaims,
} from "@comtammatu/shared/auth";

interface NotificationActionTarget {
  actionUrl: string | null;
  entityId: number | null;
  kind: string;
  targetBranchId: number | null;
}

/** D093: branch GRN routes retired — send operators to the fulfillment hub. */
function rewriteRetiredBranchGrnPath(url: string): string {
  const match = /^\/br\/(\d+)\/stock\/grn(?:\/\d+)?$/.exec(url);
  if (!match) return url;
  return `/br/${match[1]}/stock/transfer`;
}

/** Legacy leave/checkout shims → Team hub (same as page redirects). */
function rewriteTeamHubPath(url: string): string {
  const leave = /^\/br\/(\d+)\/shift\/leave-approvals(?:\?(.*))?$/.exec(url);
  if (leave) {
    const branchId = leave[1];
    const params = new URLSearchParams(leave[2] ?? "");
    const leaveRequestId = params.get("leaveRequestId");
    const query = leaveRequestId
      ? `?tab=leaves&leaveRequestId=${encodeURIComponent(leaveRequestId)}`
      : "?tab=leaves";
    return `/br/${branchId}/team${query}`;
  }
  const checkout =
    /^\/br\/(\d+)\/shift\/checkout-approvals(?:\?(.*))?$/.exec(url);
  if (checkout) {
    const branchId = checkout[1];
    const params = new URLSearchParams(checkout[2] ?? "");
    const attendanceId = params.get("attendanceId");
    const query = attendanceId
      ? `?tab=checkouts&attendanceId=${encodeURIComponent(attendanceId)}`
      : "?tab=checkouts";
    return `/br/${branchId}/team${query}`;
  }
  return url;
}

function rewriteHrPath(
  claims: JwtClaims,
  target: NotificationActionTarget,
  url: string,
): string {
  if (
    claims.user_role === "branch_manager" &&
    target.kind === "hr.leave_requested" &&
    target.targetBranchId === claims.branch_id
  ) {
    const leaveRequestId = target.entityId;
    return leaveRequestId != null
      ? `/br/${claims.branch_id}/team?tab=leaves&leaveRequestId=${leaveRequestId}`
      : `/br/${claims.branch_id}/team?tab=leaves`;
  }
  if (
    claims.user_role === "branch_manager" &&
    (target.kind === "attendance.checkout_requested" ||
      target.kind === "hr.checkout_requested") &&
    target.targetBranchId === claims.branch_id
  ) {
    const attendanceId = target.entityId;
    return attendanceId != null
      ? `/br/${claims.branch_id}/team?tab=checkouts&attendanceId=${attendanceId}`
      : `/br/${claims.branch_id}/team?tab=checkouts`;
  }
  return url;
}

/** Keep notification links inside the authenticated user's product plane. */
export function resolveNotificationActionUrl(
  claims: JwtClaims,
  target: NotificationActionTarget,
): string | null {
  const safeActionUrl = getSafeInternalReturnTo(target.actionUrl);
  if (!safeActionUrl) return null;

  const actionUrl = rewriteHrPath(
    claims,
    target,
    rewriteTeamHubPath(rewriteRetiredBranchGrnPath(safeActionUrl)),
  );

  if (
    claims.user_role !== "owner" &&
    target.targetBranchId !== claims.branch_id
  ) {
    return null;
  }

  return resolvePostLoginRedirect(claims, actionUrl) === actionUrl
    ? actionUrl
    : null;
}
