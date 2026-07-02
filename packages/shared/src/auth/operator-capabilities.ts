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

/** Groups that only make sense at a live sales branch, not a central site. */
const BRANCH_ONLY_GROUPS = new Set<OperatorTileGroupId>(["sales_kitchen"]);

export function resolveOperatorTiles(
  role: StaffRole,
  branchId: number,
  branchKind: BranchKind = "branch",
): ResolvedOperatorTileGroup[] {
  if (role === "office") return [];

  const isCentralSite = branchKind !== "branch";
  const tileSource = isCentralSite
    ? [...OPERATOR_TILE_ITEMS, CENTRAL_STOCK_PURCHASE_ORDERS_TILE]
    : OPERATOR_TILE_ITEMS;

  const visibleTiles = tileSource
    .filter((tile) => !(isCentralSite && BRANCH_ONLY_GROUPS.has(tile.group)))
    .filter((tile) => canAccess(role, tile.moduleKey))
    .map((tile) => ({
      moduleKey: tile.moduleKey,
      label: tile.label ?? MODULE_ACL[tile.moduleKey].label,
      icon: tile.icon,
      href: tile.hrefTemplate.replace("{branchId}", String(branchId)),
      group: tile.group,
    }));

  return OPERATOR_TILE_GROUP_ORDER.map((groupId) => ({
    id: groupId,
    title: OPERATOR_TILE_GROUP_TITLES[groupId],
    tiles: visibleTiles.filter((tile) => tile.group === groupId),
  })).filter((group) => group.tiles.length > 0);
}
