import type { ResolvedOperatorTileGroup } from "@comtammatu/shared/auth";

export const BRANCH_MANAGER_HOME_TILE_SUFFIXES = [
  "/pos",
  "/kds",
  "/runner",
  "/menu-limits",
  "/" + "orders",
  "/team",
  "/stock",
  "/stock/receive",
  "/stock/waste",
  "/stock/stocktake",
  "/stock/production",
  "/stock/grn",
] as const;

export function getBranchPrimaryHomeGroup(
  groups: ResolvedOperatorTileGroup[],
): ResolvedOperatorTileGroup | null {
  return (
    groups.find((group) => group.id === "sales_kitchen") ??
    groups.find((group) => group.id === "stock") ??
    null
  );
}

export function getBranchHomeTileLimit(
  groupId: ResolvedOperatorTileGroup["id"],
): number {
  return groupId === "sales_kitchen" ? 3 : 4;
}

export function getOperatorHomeTileHrefs(
  groups: ResolvedOperatorTileGroup[],
  role?: string,
): Set<string> {
  if (role === "branch_manager" || role === "owner") {
    const result = new Set<string>();
    for (const group of groups) {
      for (const tile of group.tiles) {
        if (
          BRANCH_MANAGER_HOME_TILE_SUFFIXES.some((suffix) =>
            tile.href.endsWith(suffix),
          )
        ) {
          result.add(tile.href);
        }
      }
    }
    return result;
  }

  const group = getBranchPrimaryHomeGroup(groups);
  return new Set(
    group?.tiles
      .slice(0, getBranchHomeTileLimit(group.id))
      .map((tile) => tile.href) ?? [],
  );
}
