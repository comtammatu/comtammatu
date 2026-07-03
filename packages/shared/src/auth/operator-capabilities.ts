import { MODULE_ACL, canAccess, type ModuleKey } from "./module-acl";
import {
  OPERATOR_TILE_GROUP_ORDER,
  OPERATOR_TILE_GROUP_TITLES,
  OPERATOR_TILE_ITEMS,
  type OperatorTileConfig,
  type OperatorTileGroupId,
} from "./nav-config";
import type { BranchKind, StaffRole } from "./types";

export interface ResolvedOperatorTile {
  moduleKey: ModuleKey;
  label: string;
  icon: string;
  href: string;
  group: OperatorTileGroupId;
}

export interface ResolvedOperatorTileGroup {
  id: OperatorTileGroupId;
  title: string;
  tiles: ResolvedOperatorTile[];
}

/** Native stock-group tile for the existing branch-scoped PO wrapper page. */
const CENTRAL_STOCK_PURCHASE_ORDERS_TILE = {
  moduleKey: "inventory_procurement",
  icon: "FileText",
  group: "stock",
  hrefTemplate: "/br/{branchId}/stock/purchase-orders",
  label: "Đơn đặt hàng",
} satisfies OperatorTileConfig;

/**
 * Native production tile — only the central_kitchen site runs production
 * orders/BOM (D055 §1, D059 §4); central_supply and branch sites must never
 * show it, so it is gated on branch_kind directly rather than the broader
 * `isCentralSite` check the PO tile uses.
 */
const CENTRAL_KITCHEN_PRODUCTION_TILE = {
  moduleKey: "inventory_procurement",
  icon: "ChefHat",
  group: "stock",
  hrefTemplate: "/br/{branchId}/stock/production",
  label: "Sản xuất",
} satisfies OperatorTileConfig;

/** Groups that only make sense at a live sales branch, not a central site. */
const BRANCH_ONLY_GROUPS = new Set<OperatorTileGroupId>(["sales_kitchen"]);

/**
 * Domain tile rows rendered below the "Cần xử lý" queue. `approvals` is
 * excluded here — its tiles are surfaced exclusively as queue rows (V2
 * hub layout), not as a duplicate domain tile group.
 */
const DOMAIN_TILE_GROUP_ORDER: readonly OperatorTileGroupId[] =
  OPERATOR_TILE_GROUP_ORDER.filter((groupId) => groupId !== "approvals");

function resolveVisibleTiles(
  role: StaffRole,
  branchId: number,
  branchKind: BranchKind,
): ResolvedOperatorTile[] {
  const isCentralSite = branchKind !== "branch";
  const tileSource = isCentralSite
    ? [...OPERATOR_TILE_ITEMS, CENTRAL_STOCK_PURCHASE_ORDERS_TILE]
    : OPERATOR_TILE_ITEMS;
  const withProductionTile =
    branchKind === "central_kitchen"
      ? [...tileSource, CENTRAL_KITCHEN_PRODUCTION_TILE]
      : tileSource;

  return withProductionTile
    .filter((tile) => !(isCentralSite && BRANCH_ONLY_GROUPS.has(tile.group)))
    .filter((tile) => canAccess(role, tile.moduleKey))
    .map((tile) => ({
      moduleKey: tile.moduleKey,
      label: tile.label ?? MODULE_ACL[tile.moduleKey].label,
      icon: tile.icon,
      href: tile.hrefTemplate.replace("{branchId}", String(branchId)),
      group: tile.group,
    }));
}

export function resolveOperatorTiles(
  role: StaffRole,
  branchId: number,
  branchKind: BranchKind = "branch",
): ResolvedOperatorTileGroup[] {
  if (role === "office") return [];

  const visibleTiles = resolveVisibleTiles(role, branchId, branchKind);

  return DOMAIN_TILE_GROUP_ORDER.map((groupId) => ({
    id: groupId,
    title: OPERATOR_TILE_GROUP_TITLES[groupId],
    tiles: visibleTiles.filter((tile) => tile.group === groupId),
  })).filter((group) => group.tiles.length > 0);
}
