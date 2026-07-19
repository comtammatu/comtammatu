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

/** Keep notification links inside the authenticated user's product plane. */
export function resolveNotificationActionUrl(
  claims: JwtClaims,
  target: NotificationActionTarget,
): string | null {
  const safeActionUrl = getSafeInternalReturnTo(target.actionUrl);
  if (!safeActionUrl) return null;

  if (
    claims.user_role !== "owner" &&
    target.targetBranchId !== claims.branch_id
  ) {
    return null;
  }

  return resolvePostLoginRedirect(claims, safeActionUrl) === safeActionUrl
    ? safeActionUrl
    : null;
}
