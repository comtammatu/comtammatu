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

const DOMAIN_TILE_GROUP_ORDER: readonly OperatorTileGroupId[] =
  OPERATOR_TILE_GROUP_ORDER.filter((groupId) => groupId !== "approvals");

export function resolveOperatorTiles(
  role: StaffRole,
  branchId: number,
  branchKind: BranchKind = "branch",
): ResolvedOperatorTileGroup[] {
  const visibleTiles = resolveVisibleTiles(role, branchId, branchKind);
  const allowedGroups = DOMAIN_TILE_GROUP_ORDER;

  return allowedGroups.map((groupId) => ({
    id: groupId,
    title: OPERATOR_TILE_GROUP_TITLES[groupId],
    tiles: visibleTiles.filter((tile) => tile.group === groupId),
  })).filter((group) => group.tiles.length > 0);
}
