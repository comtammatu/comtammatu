import { MODULE_ACL, canAccess, type ModuleKey } from "./module-acl";
import {
  OPERATOR_TILE_GROUP_ORDER,
  OPERATOR_TILE_GROUP_TITLES,
  OPERATOR_TILE_ITEMS,
  type OperatorTileGroupId,
} from "./nav-config";
import type { StaffRole } from "./types";

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

export function resolveOperatorTiles(
  role: StaffRole,
  branchId: number,
): ResolvedOperatorTileGroup[] {
  if (role === "office") return [];

  const visibleTiles = OPERATOR_TILE_ITEMS.filter((tile) =>
    canAccess(role, tile.moduleKey),
  ).map((tile) => ({
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
