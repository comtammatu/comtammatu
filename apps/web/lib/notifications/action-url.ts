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

function positiveId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Keep notification links inside the authenticated user's product plane. */
export function resolveNotificationActionUrl(
  claims: JwtClaims,
  target: NotificationActionTarget,
): string | null {
  const safeActionUrl = getSafeInternalReturnTo(target.actionUrl);
  if (!safeActionUrl) return null;

  if (resolvePostLoginRedirect(claims, safeActionUrl) === safeActionUrl) {
    return safeActionUrl;
  }

  const branchId = claims.branch_id;
  if (
    claims.user_role === "owner" ||
    branchId == null ||
    (target.targetBranchId != null && target.targetBranchId !== branchId)
  ) {
    return null;
  }

  const branchRoot = `/br/${branchId}`;
  const authorizedBranchTarget = (candidate: string): string | null => {
    if (resolvePostLoginRedirect(claims, candidate) === candidate) {
      return candidate;
    }
    return resolvePostLoginRedirect(claims, branchRoot) === branchRoot
      ? branchRoot
      : null;
  };
  const url = new URL(safeActionUrl, "http://localhost");
  const pathname = url.pathname;

  if (pathname === "/inventory/stock" || pathname.startsWith("/inventory/stock/")) {
    const ingredientId =
      positiveId(url.searchParams.get("ingredient")) ??
      (target.entityId != null &&
      ["inventory.stock_low", "pos.kds_out_of_stock"].includes(target.kind)
        ? target.entityId
        : null);
    return authorizedBranchTarget(
      ingredientId != null
        ? `${branchRoot}/stock/on-hand/${ingredientId}`
        : `${branchRoot}/stock`,
    );
  }

  const grnMatch = pathname.match(/^\/inventory\/grn\/(\d+)(?:\/|$)/);
  if (grnMatch?.[1]) {
    return authorizedBranchTarget(`${branchRoot}/stock/grn/${grnMatch[1]}`);
  }
  if (pathname === "/inventory/grn") {
    return authorizedBranchTarget(`${branchRoot}/stock/grn`);
  }

  if (pathname === "/inventory/count-slips") {
    return authorizedBranchTarget(`${branchRoot}/stock/count-slips`);
  }

  const stocktakeMatch = pathname.match(
    /^\/inventory\/stocktake\/(\d+)(?:\/|$)/,
  );
  if (stocktakeMatch?.[1]) {
    return authorizedBranchTarget(
      `${branchRoot}/stock/stocktake/${stocktakeMatch[1]}`,
    );
  }

  const transferMatch = pathname.match(
    /^\/inventory\/transfers\/(\d+)(?:\/|$)/,
  );
  if (transferMatch?.[1]) {
    return authorizedBranchTarget(
      `${branchRoot}/stock/receive/${transferMatch[1]}`,
    );
  }

  if (pathname === "/orders" || pathname.startsWith("/orders/")) {
    return authorizedBranchTarget(`${branchRoot}/orders`);
  }
  if (pathname === "/menu" || pathname.startsWith("/menu/")) {
    return authorizedBranchTarget(`${branchRoot}/menu-limits`);
  }
  if (pathname === "/hr" || pathname.startsWith("/hr/")) {
    return authorizedBranchTarget(
      target.kind === "hr.leave_requested"
        ? `${branchRoot}/shift/leave-approvals`
        : `${branchRoot}/team`,
    );
  }
  if (pathname.startsWith("/inventory/")) {
    return authorizedBranchTarget(`${branchRoot}/stock`);
  }

  return authorizedBranchTarget(branchRoot);
}
