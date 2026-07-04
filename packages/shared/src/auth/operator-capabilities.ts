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
  const tiles: readonly OperatorTileConfig[] = OPERATOR_TILE_ITEMS;
  return tiles
    .filter(
      (tile) => tile.kinds === undefined || tile.kinds.includes(branchKind),
    )
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
