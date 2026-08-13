import {
  getSafeInternalReturnTo,
  resolvePostLoginRedirect,
  type JwtClaims,
  type StaffRole,
} from "@comtammatu/shared/auth";
import {
  normalizeEntityType,
  resolveEntityHref,
} from "@lib/entity-href";

interface NotificationActionTarget {
  actionUrl: string | null;
  entityId: number | null;
  entityType?: string | null;
  kind: string;
  targetBranchId: number | null;
}

/** Roles whose inventory daily hub is L0 `/inventory` (R04 / R14). */
const L0_INVENTORY_SHELL_ROLES: ReadonlySet<StaffRole> = new Set([
  "owner",
  "accountant",
  "central_supply_ops",
  "central_kitchen_lead",
]);

/** Tenant-wide roles may open notifications for any `target_branch_id`. */
const TENANT_WIDE_NOTIFICATION_ROLES: ReadonlySet<StaffRole> = new Set([
  "owner",
  "accountant",
]);

/** Entity types that can deep-link into /settings/activity filter. */
const SYSTEM_ACTIVITY_ENTITY_TYPES: ReadonlySet<string> = new Set([
  "goods_received_note",
  "stock_transfer",
  "stock_request",
  "stock_issue",
  "stocktake_session",
  "purchase_order",
  "orders",
  "expense",
  "tax_invoice",
]);

function isL0InventoryShellRole(role: StaffRole): boolean {
  return L0_INVENTORY_SHELL_ROLES.has(role);
}

/** D093: branch GRN routes retired — send store operators to the fulfillment hub. */
function rewriteRetiredBranchGrnPath(url: string): string {
  const match = /^\/br\/(\d+)\/stock\/grn(?:\/\d+)?$/.exec(url);
  if (!match) return url;
  return `/br/${match[1]}/stock/transfer`;
}

/**
 * R14: map residual `/br/{site}/stock/*` deep-links onto L0 for Owner / KT /
 * central. Branch Manager and floor keep the `/br` operator plane (except
 * retired GRN → transfer above).
 */
function rewriteInventoryBranchStockPathForL0(
  role: StaffRole,
  url: string,
): string {
  if (!isL0InventoryShellRole(role)) return url;

  const parsed = new URL(url, "http://localhost");
  const match =
    /^\/br\/(\d+)\/stock(?:\/([^/?#]+))?(?:\/([^/?#]+))?(?:\/(.*))?$/.exec(
      parsed.pathname,
    );
  if (!match) return url;

  const branchId = match[1]!;
  const seg1 = match[2] ?? null;
  const seg2 = match[3] ?? null;
  const rest = match[4] ?? null;
  const qs = parsed.search;
  const hash = parsed.hash;

  const withBranch = (path: string): string => {
    const joiner = path.includes("?") ? "&" : "?";
    const branchQuery = `branch=${branchId}`;
    // Prefer explicit branch scope on L0 list/detail when not already present.
    const existing = new URLSearchParams(qs);
    if (existing.has("branch") || existing.has("branchId")) {
      return `${path}${qs}${hash}`;
    }
    return `${path}${qs ? `${qs}&${branchQuery}` : `${joiner}${branchQuery}`}${hash}`;
  };

  if (seg1 == null) {
    return withBranch("/inventory/stock");
  }

  switch (seg1) {
    case "on-hand":
      return seg2
        ? withBranch(`/inventory/stock/${seg2}`)
        : withBranch("/inventory/stock");
    case "grn":
      return seg2 ? `/inventory/grn/${seg2}${qs}${hash}` : `/inventory/grn${qs}${hash}`;
    case "transfer":
      return seg2
        ? `/inventory/transfers/${seg2}${qs}${hash}`
        : withBranch("/inventory/transfers");
    case "receive":
      // Receive pad is residual `/br`; L0 lands on transfer detail.
      return seg2
        ? `/inventory/transfers/${seg2}${qs}${hash}`
        : withBranch("/inventory/transfers");
    case "requests":
      return seg2
        ? `/inventory/transfers?requestId=${seg2}`
        : withBranch("/inventory/transfers");
    case "purchase-requests":
      return `/inventory/purchase-requests${qs}${hash}`;
    case "stocktake":
      return seg2
        ? withBranch(`/inventory/stocktake/${seg2}${rest ? `/${rest}` : ""}`)
        : withBranch("/inventory/stocktake");
    case "waste-approvals":
      return withBranch("/inventory/waste/approvals");
    case "waste":
      return withBranch("/inventory/waste/approvals");
    case "consumption":
      return withBranch("/inventory/consumption");
    case "production":
      return `/inventory/production${qs}${hash}`;
    case "catalog":
      return `/inventory/ingredients${qs}${hash}`;
    case "count-slips":
      // Count approval stays Branch-native even for Owner oversight.
      return url;
    case "count":
    case "count-assignments":
      return url;
    default:
      return withBranch("/inventory/stock");
  }
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

function canOpenTargetBranch(
  claims: JwtClaims,
  targetBranchId: number | null,
): boolean {
  if (targetBranchId == null) return true;
  if (TENANT_WIDE_NOTIFICATION_ROLES.has(claims.user_role)) return true;
  return claims.branch_id === targetBranchId;
}

function finalizeNotificationUrl(
  claims: JwtClaims,
  target: NotificationActionTarget,
  url: string,
): string | null {
  if (!canOpenTargetBranch(claims, target.targetBranchId)) {
    return null;
  }

  const rewritten = rewriteHrPath(
    claims,
    target,
    rewriteLegacyTeamTabPath(
      rewriteInventoryBranchStockPathForL0(
        claims.user_role,
        // Branch GRN rewrite only for non-L0 shells (BM / floor).
        isL0InventoryShellRole(claims.user_role)
          ? url
          : rewriteRetiredBranchGrnPath(url),
      ),
    ),
  );

  return resolvePostLoginRedirect(claims, rewritten) === rewritten
    ? rewritten
    : null;
}

/** Keep notification links inside the authenticated user's product plane. */
export function resolveNotificationActionUrl(
  claims: JwtClaims,
  target: NotificationActionTarget,
): string | null {
  const safeActionUrl = getSafeInternalReturnTo(target.actionUrl);
  const entityHref = resolveEntityHref({
    entityType: target.entityType,
    entityId: target.entityId,
    claims,
    branchId: target.targetBranchId,
  });
  // Prefer stored work-queue action_url; fill from shared entity map when missing.
  const candidate = safeActionUrl ?? entityHref;
  if (!candidate) return null;
  return finalizeNotificationUrl(claims, target, candidate);
}

/**
 * Document DETAIL / history deep-link (notify ↔ chứng từ).
 * Prefers the role-aware entity map over work-queue hubs whenever a detail
 * path exists (gold workflows plus hub-vs-detail entities like issues/PO).
 */
export function resolveNotificationHistoryUrl(
  claims: JwtClaims,
  target: Pick<
    NotificationActionTarget,
    "entityType" | "entityId" | "targetBranchId" | "kind"
  >,
): string | null {
  const entityHref = resolveEntityHref({
    entityType: target.entityType,
    entityId: target.entityId,
    claims,
    branchId: target.targetBranchId,
    // History for L0 shells is always the document DETAIL, not branch hubs.
    plane: isL0InventoryShellRole(claims.user_role) ? "control" : undefined,
  });
  if (!entityHref) return null;
  return finalizeNotificationUrl(
    claims,
    {
      actionUrl: entityHref,
      entityId: target.entityId,
      entityType: target.entityType,
      kind: target.kind,
      targetBranchId: target.targetBranchId,
    },
    entityHref,
  );
}

/**
 * Owner-only jump into system activity filtered to the same document.
 * Separate from 「Xem lịch sử chứng từ」 (document DETAIL).
 */
export function resolveNotificationAuditUrl(
  claims: JwtClaims,
  target: Pick<NotificationActionTarget, "entityType" | "entityId">,
): string | null {
  if (claims.user_role !== "owner") return null;
  const entityType = normalizeEntityType(target.entityType);
  if (!entityType || !SYSTEM_ACTIVITY_ENTITY_TYPES.has(entityType)) {
    return null;
  }
  if (target.entityId == null || !Number.isFinite(target.entityId)) {
    return null;
  }
  const params = new URLSearchParams({
    entity_type: entityType,
    entity_id: String(target.entityId),
  });
  return `/settings/activity?${params.toString()}`;
}
