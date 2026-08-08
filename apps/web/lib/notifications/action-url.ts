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

/** Legacy Team hub tab deep links → full shift management routes. */
function rewriteLegacyTeamTabPath(url: string): string {
  const match = /^\/br\/(\d+)\/team(?:\?(.*))?$/.exec(url);
  if (!match) return url;
  const branchId = match[1];
  const params = new URLSearchParams(match[2] ?? "");
  const tab = params.get("tab");
  if (tab === "leaves") {
    const leaveRequestId = params.get("leaveRequestId");
    const query = leaveRequestId
      ? `?leaveRequestId=${encodeURIComponent(leaveRequestId)}`
      : "";
    return `/br/${branchId}/shift/leave-approvals${query}`;
  }
  if (tab === "checkouts") {
    const attendanceId = params.get("attendanceId");
    const query = attendanceId
      ? `?attendanceId=${encodeURIComponent(attendanceId)}`
      : "";
    return `/br/${branchId}/shift/checkout-approvals${query}`;
  }
  if (tab === "roster") {
    const week = params.get("week");
    const query = week ? `?week=${encodeURIComponent(week)}` : "";
    return `/br/${branchId}/shift/roster${query}`;
  }
  if (tab === "attendance") {
    return `/br/${branchId}/shift/attendance`;
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
      ? `/br/${claims.branch_id}/shift/leave-approvals?leaveRequestId=${leaveRequestId}`
      : `/br/${claims.branch_id}/shift/leave-approvals`;
  }
  if (
    claims.user_role === "branch_manager" &&
    (target.kind === "attendance.checkout_requested" ||
      target.kind === "hr.checkout_requested") &&
    target.targetBranchId === claims.branch_id
  ) {
    const attendanceId = target.entityId;
    return attendanceId != null
      ? `/br/${claims.branch_id}/shift/checkout-approvals?attendanceId=${attendanceId}`
      : `/br/${claims.branch_id}/shift/checkout-approvals`;
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
    rewriteLegacyTeamTabPath(rewriteRetiredBranchGrnPath(safeActionUrl)),
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
