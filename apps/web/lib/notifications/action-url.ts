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

/** D093: branch GRN routes retired — send operators to stock requests. */
function rewriteRetiredBranchGrnPath(url: string): string {
  const match = /^\/br\/(\d+)\/stock\/grn(?:\/\d+)?$/.exec(url);
  if (!match) return url;
  return `/br/${match[1]}/stock/requests`;
}

/** Keep notification links inside the authenticated user's product plane. */
export function resolveNotificationActionUrl(
  claims: JwtClaims,
  target: NotificationActionTarget,
): string | null {
  const safeActionUrl = getSafeInternalReturnTo(target.actionUrl);
  if (!safeActionUrl) return null;

  const actionUrl = rewriteRetiredBranchGrnPath(safeActionUrl);

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
