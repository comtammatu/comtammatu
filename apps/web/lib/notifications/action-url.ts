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

  if (
    claims.user_role !== "owner" &&
    target.targetBranchId !== claims.branch_id
  ) {
    return null;
  }

  if (resolvePostLoginRedirect(claims, safeActionUrl) === safeActionUrl) {
    return safeActionUrl;
  }

  const branchId =
    claims.user_role === "owner" ? target.targetBranchId : claims.branch_id;
  if (branchId == null) return null;

  const branchRoot = `/br/${branchId}`;
  const url = new URL(safeActionUrl, "http://localhost");
  const pathname = url.pathname;
  let candidate: string | null = null;

  switch (target.kind) {
    case "inventory.stock_low": {
      if (
        pathname !== "/inventory/stock" &&
        !pathname.startsWith("/inventory/stock/")
      ) {
        break;
      }
      const ingredientId =
        positiveId(url.searchParams.get("ingredient")) ?? target.entityId;
      candidate = ingredientId
        ? `${branchRoot}/stock/on-hand/${ingredientId}`
        : `${branchRoot}/stock`;
      break;
    }
    case "workflow.grn_pending": {
      const match = pathname.match(/^\/inventory\/grn\/(\d+)(?:\/|$)/);
      if (match?.[1]) candidate = `${branchRoot}/stock/grn/${match[1]}`;
      break;
    }
    case "workflow.po_sent":
      if (
        pathname === "/inventory/grn" ||
        /^\/inventory\/purchase-orders\/\d+(?:\/|$)/.test(pathname)
      ) {
        candidate = `${branchRoot}/stock/grn`;
      }
      break;
    case "inventory.count_slip_submitted":
      if (pathname === "/inventory/count-slips") {
        candidate = `${branchRoot}/stock/count-slips`;
      }
      break;
    case "workflow.stocktake_submitted": {
      const match = pathname.match(/^\/inventory\/stocktake\/(\d+)(?:\/|$)/);
      if (match?.[1]) {
        candidate = `${branchRoot}/stock/stocktake/${match[1]}`;
      }
      break;
    }
    case "workflow.transfer_in_transit": {
      const match = pathname.match(/^\/inventory\/transfers\/(\d+)(?:\/|$)/);
      if (match?.[1]) candidate = `${branchRoot}/stock/receive/${match[1]}`;
      break;
    }
    case "hr.leave_requested":
      if (pathname === "/hr") {
        candidate = `${branchRoot}/shift/leave-approvals`;
      }
      break;
    case "attendance.checkout_requested":
      if (pathname === "/employee/checkout-approvals") {
        candidate = `${branchRoot}/shift/checkout-approvals`;
      }
      break;
    case "inventory.count_slip_approved":
    case "inventory.count_slip_recount":
      if (pathname === "/employee/count") {
        candidate = `${branchRoot}/stock/count`;
      }
      break;
    case "hr.leave_approved":
    case "hr.leave_rejected":
      if (pathname === "/employee/leave") {
        candidate = `${branchRoot}/shift/schedule/leave`;
      }
      break;
    case "pos.shift_variance": {
      const sessionId =
        positiveId(url.searchParams.get("session")) ?? target.entityId;
      if (
        pathname === `${branchRoot}/settings/pos-sessions` &&
        sessionId != null
      ) {
        candidate = `${branchRoot}/pos-sessions?session=${sessionId}`;
      }
      break;
    }
    case "pos.payment_stock_failed":
      if (pathname === "/orders") candidate = `${branchRoot}/orders`;
      break;
  }

  return candidate && resolvePostLoginRedirect(claims, candidate) === candidate
    ? candidate
    : null;
}
