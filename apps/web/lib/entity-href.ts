import type { JwtClaims, StaffRole } from "@comtammatu/shared/auth";

/** Roles that open inventory documents on the L0 `/inventory` shell (R04 / R14). */
const L0_INVENTORY_SHELL_ROLES: ReadonlySet<StaffRole> = new Set([
  "owner",
  "accountant",
  "central_supply_ops",
  "central_kitchen_lead",
]);

export type EntityHrefPlane = "control" | "branch";

export type EntityHrefClaims = Pick<JwtClaims, "user_role">;

/** Notification/audit aliases → canonical audit `entity_type` values. */
const ENTITY_TYPE_ALIASES: Readonly<Record<string, string>> = {
  grn: "goods_received_note",
  stocktake: "stocktake_session",
};

export function normalizeEntityType(
  entityType: string | null | undefined,
): string | null {
  if (!entityType) return null;
  const trimmed = entityType.trim();
  if (!trimmed) return null;
  const aliased = ENTITY_TYPE_ALIASES[trimmed];
  if (aliased) return aliased;
  return trimmed;
}

function parseEntityId(
  entityId: string | number | null | undefined,
): string | null {
  if (entityId == null) return null;
  const id = String(entityId);
  return /^\d+$/.test(id) ? id : null;
}

function controlPlaneHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "goods_received_note":
      return `/inventory/grn/${entityId}`;
    case "stock_transfer":
      return `/inventory/transfers/${entityId}`;
    case "stock_request":
      return `/inventory/transfers?requestId=${entityId}`;
    case "stock_issue":
      return `/inventory/issues/${entityId}`;
    case "stocktake_session":
      return `/inventory/stocktake/${entityId}`;
    case "purchase_order":
      return `/inventory/purchase-orders?tab=orders&poId=${entityId}&mode=view`;
    case "expense":
      return "/finance/expenses";
    case "tax_invoice":
      return "/finance/invoices";
    default:
      return null;
  }
}

function branchPlaneHref(
  entityType: string,
  entityId: string,
  branchId: number,
): string | null {
  switch (entityType) {
    case "goods_received_note":
      // D093: branch GRN DETAIL retired — fulfillment hub only.
      return `/br/${branchId}/stock/transfer`;
    case "stock_transfer":
      return `/br/${branchId}/stock/receive/${entityId}`;
    case "stock_request":
      return `/br/${branchId}/stock/requests/${entityId}`;
    case "stocktake_session":
      return `/br/${branchId}/stock/stocktake/${entityId}`;
    default:
      return null;
  }
}

function resolvePlane(
  plane: EntityHrefPlane | undefined,
  claims: EntityHrefClaims | null | undefined,
): EntityHrefPlane {
  if (plane) return plane;
  if (claims && L0_INVENTORY_SHELL_ROLES.has(claims.user_role)) {
    return "control";
  }
  if (claims) return "branch";
  return "control";
}

/**
 * Canonical document deep-link for audit rows and notification history CTAs.
 * Control plane = L0 Owner/Ops paths; branch plane = `/br/{id}/stock/…`.
 */
export function resolveEntityHref(input: {
  entityType: string | null | undefined;
  entityId: string | number | null | undefined;
  plane?: EntityHrefPlane;
  branchId?: number | null;
  claims?: EntityHrefClaims | null;
}): string | null {
  const entityType = normalizeEntityType(input.entityType);
  const entityId = parseEntityId(input.entityId);
  if (!entityType || !entityId) return null;

  const plane = resolvePlane(input.plane, input.claims);
  if (plane === "control") {
    return controlPlaneHref(entityType, entityId);
  }

  const branchId = input.branchId;
  if (branchId == null || !Number.isFinite(branchId) || branchId <= 0) {
    return controlPlaneHref(entityType, entityId);
  }
  return (
    branchPlaneHref(entityType, entityId, branchId) ??
    controlPlaneHref(entityType, entityId)
  );
}

/** Gold workflow types that support notify ↔ document history correlation. */
export const GOLD_TRACKING_ENTITY_TYPES = [
  "goods_received_note",
  "stock_transfer",
  "stock_request",
] as const;

export function isGoldTrackingEntityType(
  entityType: string | null | undefined,
): boolean {
  const normalized = normalizeEntityType(entityType);
  return (
    normalized != null &&
    (GOLD_TRACKING_ENTITY_TYPES as readonly string[]).includes(normalized)
  );
}
