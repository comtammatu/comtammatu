import { MODULE_ACL, canAccess, type ModuleKey } from "./module-acl";
import {
  BRANCH_PRIMARY_TAB_ITEMS,
  BRANCH_TOOLS_GROUP_ORDER,
  BRANCH_TOOLS_GROUP_TITLES,
  BRANCH_TOOLS_ITEMS,
  OPERATOR_TILE_GROUP_ORDER,
  OPERATOR_TILE_GROUP_TITLES,
  OPERATOR_TILE_ITEMS,
  type BranchPrimaryTabBadge,
  type BranchPrimaryTabId,
  type BranchToolsGroupId,
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

export interface ResolvedBranchTool {
  moduleKey: ModuleKey;
  label: string;
  icon: string;
  href: string;
}

export interface ResolvedBranchToolsGroup {
  id: BranchToolsGroupId;
  title: string;
  tiles: ResolvedBranchTool[];
}

export function resolveBranchToolsGroups(
  role: StaffRole,
  branchId: number,
  branchKind: BranchKind = "branch",
): ResolvedBranchToolsGroup[] {
  const visible = BRANCH_TOOLS_ITEMS.filter(
    (tile) =>
      tile.kinds === undefined ||
      tile.kinds.some((kind) => kind === branchKind),
  ).filter((tile) => canAccess(role, tile.moduleKey));

  return BRANCH_TOOLS_GROUP_ORDER.map((groupId) => ({
    id: groupId,
    title: BRANCH_TOOLS_GROUP_TITLES[groupId],
    tiles: visible
      .filter((tile) => tile.group === groupId)
      .map((tile) => ({
        moduleKey: tile.moduleKey,
        label: tile.label ?? MODULE_ACL[tile.moduleKey].label,
        icon: tile.icon,
        href: tile.hrefTemplate.replace("{branchId}", String(branchId)),
      })),
  })).filter((group) => group.tiles.length > 0);
}

export interface ResolvedBranchPrimaryTab {
  id: BranchPrimaryTabId;
  moduleKey: ModuleKey;
  label: string;
  icon: string;
  href: string;
  exact: boolean;
  matchPrefixes: string[];
  badge: BranchPrimaryTabBadge | null;
}

export function resolveBranchPrimaryTabs(
  role: StaffRole,
  branchId: number,
  branchKind: BranchKind = "branch",
): ResolvedBranchPrimaryTab[] {
  if (branchKind !== "branch") return [];

  const hasManagerChrome = BRANCH_PRIMARY_TAB_ITEMS.some(
    (item) =>
      item.audience === "manager" && canAccess(role, item.moduleKey),
  );

  return BRANCH_PRIMARY_TAB_ITEMS.filter((item) => {
    if ("hideForOwner" in item && item.hideForOwner && role === "owner") {
      return false;
    }
    if (!canAccess(role, item.moduleKey)) return false;
    if (item.audience === "floor" && hasManagerChrome) return false;
    return true;
  }).map((item) => {
    const href = item.hrefTemplate.replace("{branchId}", String(branchId));
    const suffixes =
      item.id === "shift"
        ? hasManagerChrome
          ? ["/shift/clock", "/shift/schedule"]
          : ["/shift/clock"]
        : "matchSuffixes" in item
          ? [...item.matchSuffixes]
          : [];
    return {
      id: item.id,
      moduleKey: item.moduleKey,
      label: item.label,
      icon: item.icon,
      href,
      exact: item.exact,
      matchPrefixes: suffixes.map((suffix) => `/br/${branchId}${suffix}`),
      badge: "badge" in item ? item.badge : null,
    };
  });
}

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
